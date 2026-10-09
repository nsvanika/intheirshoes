import { trackBeliefs } from "@/engine/engine";
import { benchmarkCases, type BenchmarkCase, type Letter } from "./build";
import { seededRandom } from "./stats";
import type { ModelCall, ModelReply } from "./runner";

/**
 * SCRIPTED STAND-INS for a model. They exist only to test the pipeline (parsing, scoring, failure
 * accounting) and to let `npm run benchmark -- --dry-run` rehearse a run for free.
 *
 * Their output is NOT a finding about any AI model, and it is never shown as one: a run made with
 * these is labelled mode "dry-run", and the About page only ever shows mode "live".
 */

export type ScriptKind = "oracle" | "reality" | "random" | "flaky";

function identify(user: string): { c: BenchmarkCase; method: "A" | "B" } {
  // match on the WHOLE story: a control and its false-belief twin share a first sentence and a question
  const numbered = (user.match(/^\d+\. /gm) ?? []).length;
  const c = benchmarkCases.find(
    (x) => x.sentences.length === numbered && x.sentences.every((line) => user.includes(line)) && user.includes(x.question.text),
  );
  if (!c) throw new Error("scripted model: could not identify the case");
  return { c, method: user.includes('"table"') ? "B" : "A" };
}

/** A table with every required row, from a rule: gold beliefs, or the world state copied, or random. */
export function tableFor(c: BenchmarkCase, belief: (t: number, characterId: string, propId: string, goldBelief: 0 | 1) => 0 | 1) {
  const table = trackBeliefs(c.structured);
  const rows: { t: number; character: string; statement: string; belief: 0 | 1 }[] = [];
  for (const step of table.steps.slice(1)) {
    for (const a of step.actors) {
      for (const s of c.statements) {
        rows.push({
          t: step.t,
          character: c.characters.find((x) => x.id === a.actorId)!.name,
          statement: s.id,
          belief: belief(step.t, a.actorId, s.propId, a.beliefs[s.propId]),
        });
      }
    }
  }
  return rows;
}

function reply(c: BenchmarkCase, method: "A" | "B", answer: Letter, rows?: ReturnType<typeof tableFor>): ModelReply {
  const body = method === "A" ? { final_answer: answer } : { table: rows ?? tableFor(c, (_t, _a, _p, g) => g), final_answer: answer };
  return { text: JSON.stringify(body), stopReason: "end_turn", inputTokens: 500, outputTokens: 60 };
}

export function scriptedCaller(kind: ScriptKind): ModelCall {
  const rand = seededRandom(99);
  let calls = 0;
  return async (_system, user) => {
    const { c, method } = identify(user);
    calls++;
    switch (kind) {
      case "oracle":
        return reply(c, method, c.gold.answer);
      case "reality": {
        const world = trackBeliefs(c.structured);
        return reply(
          c,
          method,
          c.gold.realityCopyAnswer,
          tableFor(c, (t, _a, propId) => world.steps[t].world[propId]),
        );
      }
      case "random": {
        const letters = c.question.options.map((o) => o.letter);
        return reply(c, method, letters[Math.floor(rand() * letters.length)], tableFor(c, () => (rand() < 0.5 ? 0 : 1)));
      }
      case "flaky": {
        // a fixed rotation of every kind of failure, so accounting can be checked exactly
        const mode = calls % 9;
        const good = reply(c, method, c.gold.answer);
        const wrongLetter = c.question.options.find((o) => o.letter !== c.gold.answer)!.letter;
        if (mode === 0) return good; // correct
        if (mode === 1) return { text: "I think the answer is probably B.", stopReason: "end_turn" }; // unparseable
        if (mode === 2) return { text: '{"answer": "A"}', stopReason: "end_turn" }; // malformed
        if (mode === 3) return { text: JSON.stringify({ final_answer: "D" }), stopReason: "end_turn" }; // malformed (not a letter)
        if (mode === 4) throw new Error("simulated network failure"); // api_error
        if (mode === 5) return { text: good.text.slice(0, 40), stopReason: "max_tokens" }; // truncated
        if (mode === 6) return reply(c, method, wrongLetter); // valid but wrong
        if (mode === 7) {
          if (method === "B") return reply(c, method, c.gold.answer, tableFor(c, (_t, _a, _p, g) => g).slice(1)); // incomplete table
          return reply(c, method, c.gold.answer);
        }
        return { text: "", stopReason: "refusal" }; // refusal
      }
    }
  };
}
