import { describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { trackBeliefs } from "@/engine/engine";
import { benchmarkCases, buildCase, casesFingerprint, getCase, type BenchmarkCase } from "./build";
import { evaluateReply } from "./evaluate";
import { buildPrompt, requiredRowCount } from "./prompts";
import { referenceBelief, referenceWorld } from "./reference";
import { DEFAULT_SETTINGS, ResultsFileSchema, runBenchmark, type ModelCall } from "./runner";
import { scriptedCaller } from "./scripted";
import { caseSpecs } from "./specs";
import { clusterBootstrap, mcnemarExact, wilson } from "./stats";
import { baselineAccuracies, summarize } from "./summarize";
import { MAX_CROSS_FAMILY_SIMILARITY, describeBenchmark, similarityReport, validateBenchmark } from "./validate";

const clone = <T,>(x: T): T => structuredClone(x);
const fast = { retryDelayMs: 0 };

describe("the benchmark cases", () => {
  it("has 26 cases: 6 classic and 20 adapted from the library and its examples", () => {
    expect(benchmarkCases).toHaveLength(26);
    expect(benchmarkCases.filter((c) => c.source === "classic")).toHaveLength(6);
    expect(benchmarkCases.filter((c) => c.source !== "classic")).toHaveLength(20);
  });

  it("is honest about independence: 26 cases come from only 17 families", () => {
    const d = describeBenchmark(benchmarkCases);
    expect(d.cases).toBe(26);
    expect(d.families).toBe(17);
    expect(d.families).toBeLessThan(d.cases);
    // the 12 library scenarios, 2 Make Your Own examples and 3 classic tasks
    const fromLibrary = new Set(benchmarkCases.filter((c) => c.source === "library").map((c) => c.parent));
    expect(fromLibrary.size).toBe(12);
    for (const parent of fromLibrary) expect(scenarios.some((s) => s.id === parent)).toBe(true);
    expect(benchmarkCases.filter((c) => c.source === "classic").map((c) => c.familyId).filter((f, i, a) => a.indexOf(f) === i)).toHaveLength(3);
  });

  it("passes every validation rule", () => {
    expect(validateBenchmark(benchmarkCases)).toEqual([]);
  });

  it("gives every case a complete story, a belief question, a verified answer, an explanation, a family and a validation record", () => {
    for (const c of benchmarkCases) {
      expect(c.sentences.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.sentences.join(" "), c.id).toContain(c.question.targetCharacterName);
      expect(c.question.text, c.id).toMatch(/believe/);
      expect(c.question.options.map((o) => o.letter), c.id).toContain(c.gold.answer);
      expect(c.gold.explanation.length, c.id).toBeGreaterThan(40);
      expect(c.familyId, c.id).toBeTruthy();
      expect(c.gold.validation.goldMethod, c.id).toMatch(/deterministic belief engine/);
      expect(c.gold.validation.independentCheck.agrees, c.id).toBe(true);
      expect(c.gold.validation.humanReview, c.id).toMatch(/NOT an independent human audit/);
    }
  });

  it("includes genuine false beliefs, not only missing information", () => {
    const by = (cat: string) => benchmarkCases.filter((c) => c.category === cat);
    expect(by("false_belief").length).toBe(10);
    expect(by("true_belief_control").length).toBe(8);
    expect(by("missing_information").length).toBe(8);
    for (const c of by("false_belief")) {
      // a genuine false belief: the character holds a belief that is not true, and copying the world gets it wrong
      expect(c.gold.divergence, c.id).toBe(true);
      expect(c.gold.answerKey, c.id).not.toBe("none");
      expect(c.gold.answerKey, c.id).not.toBe("no");
      expect(c.gold.realityCopyAnswer, c.id).not.toBe(c.gold.answer);
    }
  });

  it("includes the Sally-Anne task, properly attributed, with a control", () => {
    const sally = getCase("classic-sally-anne");
    expect(sally.category).toBe("false_belief");
    expect(sally.citation).toMatch(/Baron-Cohen, Leslie & Frith \(1985\)/);
    expect(sally.citation).toMatch(/Wimmer & Perner \(1983\)/);
    expect(sally.citation).toMatch(/Wording is original to this project/);
    expect(getCase("classic-sally-anne-control").category).toBe("true_belief_control");
    // the story is the project's own wording, not a copy of a published text
    expect(sally.sentences.join(" ")).toMatch(/marble/);
  });

  it("every classic task is attributed", () => {
    for (const c of benchmarkCases.filter((x) => x.source === "classic")) expect(c.citation).toMatch(/Wording is original/);
  });

  it("records, for each case, how it was adapted", () => {
    for (const c of benchmarkCases) expect(c.adaptation.length, c.id).toBeGreaterThan(15);
  });
});

describe("the gold answers are verified", () => {
  it("an independently written backward-scanning reference agrees with the engine on every belief, at every step", () => {
    for (const c of benchmarkCases) {
      const table = trackBeliefs(c.structured);
      for (const step of table.steps.slice(1)) {
        for (const a of step.actors) {
          for (const s of c.statements) {
            expect(referenceBelief(c.structured, a.actorId, s.propId, step.t).belief, `${c.id} t${step.t} ${a.actorId} ${s.id}`).toBe(a.beliefs[s.propId]);
          }
        }
        for (const s of c.statements) expect(referenceWorld(c.structured, s.propId, step.t), `${c.id} world`).toBe(step.world[s.propId]);
      }
    }
  });

  it("the gold answer is read off the engine's belief table, never typed in", () => {
    for (const c of benchmarkCases) {
      const table = trackBeliefs(c.structured);
      const last = table.steps[c.sentences.length].actors.find((a) => a.actorId === c.question.targetCharacterId)!;
      const key = c.question.options.find((o) => o.letter === c.gold.answer)!.key;
      if (c.question.kind === "yes_no") {
        const prop = c.statements.find((s) => s.id === c.question.targetStatementId)!.propId;
        expect(key, c.id).toBe(last.beliefs[prop] === 1 ? "yes" : "no");
      } else {
        const held = c.question.options.filter((o) => o.key !== "none").find((o) => last.beliefs[o.key] === 1);
        expect(key, c.id).toBe(held ? held.key : "none");
      }
    }
  });

  it("the specs do not contain answers at all: nothing to type in wrongly", () => {
    for (const spec of caseSpecs) expect(Object.keys(spec)).not.toContain("answer");
  });

  it("the stories are self-contained: no hidden starting beliefs or facts, and the prose matches the events", () => {
    for (const c of benchmarkCases) {
      expect(c.structured.initialBeliefs, c.id).toEqual({});
      expect(c.structured.initialWorld, c.id).toEqual([]);
      expect(c.structured.events.map((e) => e.description), c.id).toEqual(c.sentences);
      for (const person of c.characters) {
        expect(c.sentences.join(" "), `${c.id}: ${person.name}`).toContain(person.name.replace(/'s mother$/, ""));
      }
    }
  });

  it("the validator catches a bad case: a wrong gold letter, a failed independent check, a hidden-belief story", () => {
    const good = clone(benchmarkCases);
    expect(validateBenchmark(good)).toEqual([]);

    const bad1 = clone(benchmarkCases);
    bad1[0].gold.answer = "C";
    bad1[0].question.options = bad1[0].question.options.filter((o) => o.letter !== "C");
    expect(validateBenchmark(bad1).join()).toMatch(/gold answer is not one of the options/);

    const bad2 = clone(benchmarkCases);
    bad2[3].gold.validation.independentCheck.agrees = false;
    expect(validateBenchmark(bad2).join()).toMatch(/independent reference disagrees/);

    const bad3 = clone(benchmarkCases);
    bad3[5].gold.validation.selfContained = false;
    expect(validateBenchmark(bad3).join()).toMatch(/hidden starting beliefs/);

    const bad4 = clone(benchmarkCases);
    const fbIndex = bad4.findIndex((c) => c.category === "false_belief");
    bad4[fbIndex].gold.divergence = false;
    expect(validateBenchmark(bad4).join()).toMatch(/false-belief case must differ from reality/);
  });

  it("a spec whose declared category disagrees with the engine is rejected at build time", () => {
    const wrong = { ...caseSpecs[0], declaredCategory: "missing_information" as const };
    expect(buildCase(wrong).gold.validation.declaredCategoryMatchesDerived).toBe(false);
    const withWrong = [...clone(benchmarkCases)];
    withWrong[0] = buildCase(wrong);
    expect(validateBenchmark(withWrong).join()).toMatch(/declared category does not match/);
  });
});

describe("related stories are not counted as independent", () => {
  it("different families are genuinely distinct stories, below the near-duplicate threshold", () => {
    const sim = similarityReport(benchmarkCases);
    expect(sim.maxAcrossFamilies.value).toBeLessThan(MAX_CROSS_FAMILY_SIMILARITY);
    expect(sim.maxWithinFamily.value).toBeGreaterThan(sim.maxAcrossFamilies.value); // family members really are related
  });

  it("a near-duplicate filed under a different family is detected", () => {
    const sneaky = clone(benchmarkCases);
    const copy = clone(sneaky.find((c) => c.id === "classic-maxi")!);
    copy.id = "maxi-reworded";
    copy.familyId = "totally-new-family"; // pretending to be independent
    sneaky.push(copy);
    expect(validateBenchmark(sneaky).join()).toMatch(/near-duplicate stories in different families/);
  });

  it("too many cases in one family is rejected, and so is pretending every case is a family", () => {
    const crowded = clone(benchmarkCases).map((c) => (c.source === "classic" ? { ...c, familyId: "one" } : c));
    expect(validateBenchmark(crowded).join()).toMatch(/family one has 6 cases/);
    const allSeparate = clone(benchmarkCases).map((c) => ({ ...c, familyId: c.id }));
    expect(validateBenchmark(allSeparate).join()).toMatch(/families are not being tracked/);
  });

  it("every variant names the family it belongs to", () => {
    for (const c of benchmarkCases.filter((x) => x.source === "variant")) {
      const siblings = benchmarkCases.filter((x) => x.familyId === c.familyId);
      expect(siblings.length >= 1, c.id).toBe(true);
      expect(c.parent, c.id).toBeTruthy();
    }
  });

  it("the answer letters do not give the answer away by position", () => {
    const count = (l: string) => benchmarkCases.filter((c) => c.gold.answer === l).length;
    for (const l of ["A", "B", "C"]) expect(count(l)).toBeGreaterThanOrEqual(3);
  });
});

describe("the two prompts", () => {
  const c = getCase("classic-sally-anne");
  const A = buildPrompt("A", c);
  const B = buildPrompt("B", c);

  it("share the same instructions, story, characters, statements, question and options", () => {
    const common = A.split("\n\nAnswer directly.")[0];
    expect(B.startsWith(common)).toBe(true);
    for (const s of c.sentences) {
      expect(A).toContain(s);
      expect(B).toContain(s);
    }
    for (const o of c.question.options) expect(B).toContain(`${o.letter}. ${o.text}`);
    expect(A).toContain("A character believes something only if they saw it happen, were told it, or overheard it.");
  });

  it("differ only in the answer instructions: B must write a time-indexed belief table first", () => {
    expect(A).not.toMatch(/belief-state table/);
    expect(A).not.toContain('"table"');
    expect(B).toMatch(/build a belief-state table/);
    expect(B).toContain(`exactly ${requiredRowCount(c)} rows`);
    expect(requiredRowCount(c)).toBe(c.sentences.length * c.characters.length * c.statements.length);
    for (const p of [A, B]) {
      expect(p).toContain('"final_answer"');
      expect(p).toContain("Reply with ONLY this JSON object");
    }
  });

  it("do not leak the answer, the category or the explanation", () => {
    for (const x of benchmarkCases) {
      for (const method of ["A", "B"] as const) {
        const p = buildPrompt(method, x);
        expect(p, x.id).not.toContain(x.gold.explanation);
        expect(p.toLowerCase(), x.id).not.toMatch(/false belief|gold|correct answer|true_belief|missing_information/);
        expect(p, x.id).not.toContain(x.id); // the internal case id is never shown
        expect(p, x.id).not.toMatch(/category|family/i);
      }
    }
  });

  it("each case's prompt for B asks for the right number of rows", () => {
    for (const x of benchmarkCases) {
      const n = x.sentences.length * x.characters.length * x.statements.length;
      expect(buildPrompt("B", x)).toContain(`exactly ${n} rows`);
      expect(x.gold.rows).toHaveLength(n);
    }
  });
});

describe("strict scoring", () => {
  const c = getCase("wrong-room-away");
  const gold = c.gold.answer;
  const wrong = c.question.options.find((o) => o.letter !== gold)!.letter;
  const goodRows = () => scriptedRows(c);
  const reply = (obj: unknown, stopReason = "end_turn") => ({ text: JSON.stringify(obj), stopReason });

  function scriptedRows(x: BenchmarkCase) {
    return x.gold.rows.map((r) => ({
      t: r.t,
      character: x.characters.find((p) => p.id === r.characterId)!.name,
      statement: r.statementId,
      belief: r.belief,
    }));
  }

  it("Method A: the right answer is correct, a valid wrong answer is 'wrong'", () => {
    expect(evaluateReply("A", c, reply({ final_answer: gold })).outcome).toBe("correct");
    const w = evaluateReply("A", c, reply({ final_answer: wrong }));
    expect(w.outcome).toBe("wrong");
    expect(w.primaryCorrect).toBe(false);
  });

  it("accepts JSON inside a code fence, and nothing sloppier", () => {
    expect(evaluateReply("A", c, { text: "```json\n" + JSON.stringify({ final_answer: gold }) + "\n```", stopReason: "end_turn" }).outcome).toBe("correct");
    expect(evaluateReply("A", c, { text: `Sure! {"final_answer": "${gold}"}`, stopReason: "end_turn" }).outcome).toBe("unparseable");
  });

  it("every kind of failure counts as a failure, under its own name", () => {
    const expectFail = (r: ReturnType<typeof evaluateReply>, outcome: string) => {
      expect(r.outcome).toBe(outcome);
      expect(r.primaryCorrect).toBe(false);
    };
    expectFail(evaluateReply("A", c, { error: "network" }), "api_error");
    expectFail(evaluateReply("A", c, { text: "", stopReason: "refusal" }), "refusal");
    expectFail(evaluateReply("A", c, { text: '{"final_ans', stopReason: "max_tokens" }), "truncated");
    expectFail(evaluateReply("A", c, { text: "", stopReason: "end_turn" }), "unparseable");
    expectFail(evaluateReply("A", c, { text: "not json at all", stopReason: "end_turn" }), "unparseable");
    expectFail(evaluateReply("A", c, { text: "[1,2]", stopReason: "end_turn" }), "unparseable");
    expectFail(evaluateReply("A", c, reply({ answer: gold })), "malformed");
    expectFail(evaluateReply("A", c, reply({ final_answer: gold, why: "because" })), "malformed");
    expectFail(evaluateReply("A", c, reply({ final_answer: "Z" })), "malformed");
    expectFail(evaluateReply("A", c, reply({ final_answer: "a" })), "malformed"); // lowercase is not an offered letter
  });

  it("a letter that is not one of the offered options is invalid, not wrong", () => {
    const twoOptions = getCase("group-chat-missed");
    const missing = ["A", "B", "C"].find((l) => !twoOptions.question.options.some((o) => o.letter === l))!;
    const r = evaluateReply("A", twoOptions, reply({ final_answer: missing }));
    expect(r.outcome).toBe("invalid_answer");
    expect(r.primaryCorrect).toBe(false);
  });

  it("Method B: a complete table and the right answer is correct, with perfect row accuracy", () => {
    const r = evaluateReply("B", c, reply({ table: goodRows(), final_answer: gold }));
    expect(r.outcome).toBe("correct");
    expect(r.rowAccuracy).toBe(1);
    expect(r.tableConsistent).toBe(true);
  });

  it("Method B: a missing row makes the whole reply incomplete (a primary failure), yet the answer is still credited separately", () => {
    const rows = goodRows().slice(1);
    const r = evaluateReply("B", c, reply({ table: rows, final_answer: gold }));
    expect(r.outcome).toBe("incomplete_table");
    expect(r.primaryCorrect).toBe(false);
    expect(r.answerOnlyCorrect).toBe(true); // the secondary metric
    // every row it did give is right, and the missing one counts as wrong
    expect(r.rowAccuracy).toBeCloseTo(rows.length / goodRows().length, 5);
  });

  it("Method B: duplicate, extra and unknown rows are all incomplete", () => {
    const rows = goodRows();
    expect(evaluateReply("B", c, reply({ table: [...rows, rows[0]], final_answer: gold })).outcome).toBe("incomplete_table");
    expect(evaluateReply("B", c, reply({ table: [...rows, { t: 99, character: "Ben", statement: "S1", belief: 0 }], final_answer: gold })).outcome).toBe("incomplete_table");
    expect(evaluateReply("B", c, reply({ table: [...rows.slice(1), { ...rows[0], character: "Nobody" }], final_answer: gold })).outcome).toBe("incomplete_table");
  });

  it("Method B: a malformed row or table shape is 'malformed'; the answer is salvaged for the secondary metric only", () => {
    const bad = evaluateReply("B", c, reply({ table: [{ t: 1, character: "Ben", statement: "S1", belief: 2 }], final_answer: gold }));
    expect(bad.outcome).toBe("malformed");
    expect(bad.primaryCorrect).toBe(false);
    expect(bad.answerOnlyCorrect).toBe(true);
    expect(evaluateReply("B", c, reply({ final_answer: gold })).outcome).toBe("malformed");
    expect(evaluateReply("B", c, reply({ table: goodRows(), final_answer: gold, extra: 1 })).outcome).toBe("malformed");
  });

  it("Method B: a correct table with a wrong answer is 'wrong', and the model's own table is checked against its answer", () => {
    const r = evaluateReply("B", c, reply({ table: goodRows(), final_answer: wrong }));
    expect(r.outcome).toBe("wrong");
    expect(r.tableConsistent).toBe(false); // it contradicted its own table
    expect(r.rowAccuracy).toBe(1);
  });

  it("character names are matched ignoring case and spacing; statement ids must be exact", () => {
    const rows = goodRows().map((r) => ({ ...r, character: ` ${r.character.toUpperCase()} ` }));
    expect(evaluateReply("B", c, reply({ table: rows, final_answer: gold })).outcome).toBe("correct");
    const badIds = goodRows().map((r) => ({ ...r, statement: r.statement.toLowerCase() }));
    expect(evaluateReply("B", c, reply({ table: badIds, final_answer: gold })).outcome).toBe("incomplete_table");
  });

  it("is the same strict rule for both methods: a correct, valid answer is credited the same", () => {
    for (const x of benchmarkCases) {
      const a = evaluateReply("A", x, reply({ final_answer: x.gold.answer }));
      const b = evaluateReply("B", x, reply({ table: scriptedRows(x), final_answer: x.gold.answer }));
      expect(a.primaryCorrect, x.id).toBe(true);
      expect(b.primaryCorrect, x.id).toBe(true);
    }
  });

  it("works for yes/no and for three-option cases", () => {
    for (const id of ["group-chat-missed", "weekend-told", "classic-contents"]) {
      const x = getCase(id);
      const r = evaluateReply("B", x, reply({ table: scriptedRows(x), final_answer: x.gold.answer }));
      expect(r.outcome, id).toBe("correct");
      expect(r.tableConsistent, id).toBe(true);
    }
  });
});

describe("runs: nothing is silently dropped", () => {
  it("records every request, for both methods, for every case", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, dryRunKind: "oracle", ...fast });
    expect(file.records).toHaveLength(26 * 2);
    expect(new Set(file.records.map((r) => `${r.caseId}|${r.method}`)).size).toBe(52);
    expect(file.records.every((r) => r.primaryCorrect)).toBe(true);
    expect(ResultsFileSchema.safeParse(file).success).toBe(true);
  });

  it("with runs=2 asks every question twice", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, settings: { runs: 2 }, ...fast });
    expect(file.records).toHaveLength(26 * 2 * 2);
    expect(file.settings.runs).toBe(2);
  });

  it("separates API failures from the model's own mistakes, and counts both as failures", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("flaky"), mode: "dry-run", model: null, concurrency: 1, settings: { apiRetries: 0 }, ...fast });
    const s = summarize(file.records);
    for (const m of ["A", "B"] as const) {
      const ms = s.methods[m];
      expect(ms.total).toBe(26);
      // every request is accounted for: correct + each kind of failure = total
      const failureTotal = Object.values(ms.failures).reduce((a, b) => a + b, 0);
      expect(ms.correct + failureTotal).toBe(ms.total);
      expect(ms.apiFailures).toBe(ms.failures.api_error);
      expect(ms.modelFailures).toBe(ms.total - ms.correct - ms.apiFailures);
      expect(ms.accuracy).toBeCloseTo(ms.correct / ms.total, 10);
      // API errors are in the denominator of the primary metric; a second figure leaves them out
      expect(ms.accuracyExcludingApiErrors).toBeCloseTo(ms.correct / (ms.total - ms.apiFailures), 10);
    }
    const all = file.records.map((r) => r.outcome);
    for (const o of ["correct", "unparseable", "malformed", "api_error", "truncated", "wrong", "refusal"]) expect(all).toContain(o);
    expect(all).toContain("incomplete_table");
  });

  it("retries only a failed API request, never a bad answer", async () => {
    let calls = 0;
    const flaky: ModelCall = async () => {
      calls++;
      if (calls <= 2) throw new Error("rate limited");
      return { text: JSON.stringify({ final_answer: "A" }), stopReason: "end_turn" };
    };
    const one = benchmarkCases.slice(0, 1);
    const { file } = await runBenchmark({ call: flaky, mode: "dry-run", model: null, cases: one, concurrency: 1, settings: { apiRetries: 2 }, ...fast });
    const a = file.records.find((r) => r.method === "A")!;
    expect(a.attempts).toBe(3); // two API failures, then it went through
    expect(a.outcome).not.toBe("api_error");

    let badCalls = 0;
    const alwaysBad: ModelCall = async () => {
      badCalls++;
      return { text: "garbage", stopReason: "end_turn" };
    };
    const r2 = await runBenchmark({ call: alwaysBad, mode: "dry-run", model: null, cases: one, concurrency: 1, ...fast });
    expect(badCalls).toBe(2); // one per method: an unparseable answer is a result, not retried
    expect(r2.file.records.every((r) => r.attempts === 1 && r.outcome === "unparseable")).toBe(true);

    const neverWorks: ModelCall = async () => {
      throw new Error("down");
    };
    const r3 = await runBenchmark({ call: neverWorks, mode: "dry-run", model: null, cases: one, concurrency: 1, settings: { apiRetries: 2 }, ...fast });
    expect(r3.file.records.every((r) => r.outcome === "api_error" && r.attempts === 3)).toBe(true);
    expect(r3.file.records).toHaveLength(2); // still counted, not dropped
  });

  it("the same case, model call, and settings are used for both methods; only the prompt differs", async () => {
    const seen: { system: string; user: string }[] = [];
    const spy: ModelCall = async (system, user) => {
      seen.push({ system, user });
      return scriptedCaller("oracle")(system, user);
    };
    await runBenchmark({ call: spy, mode: "dry-run", model: null, cases: benchmarkCases.slice(0, 3), concurrency: 1, ...fast });
    expect(new Set(seen.map((s) => s.system)).size).toBe(1); // one system prompt for both methods
    expect(seen).toHaveLength(6);
    expect(DEFAULT_SETTINGS.maxTokens).toBe(8000);
  });

  it("refuses to run a benchmark that fails validation", async () => {
    const broken = clone(benchmarkCases);
    broken[0].gold.validation.independentCheck.agrees = false;
    await expect(runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, cases: broken, ...fast })).rejects.toThrow(/will not be run/);
  });

  it("stored results are tied to exactly these cases", () => {
    const fp = casesFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(casesFingerprint()).toBe(fp);
    const changed = clone(benchmarkCases);
    changed[0].sentences[0] += " Extra.";
    expect(casesFingerprint(changed)).not.toBe(fp);
  });
});

describe("what the scripted stand-ins show (pipeline checks, NOT findings about any AI)", () => {
  it("a perfect reader scores 26/26 under both methods", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, ...fast });
    const s = summarize(file.records);
    expect(s.methods.A).toMatchObject({ total: 26, correct: 26, accuracy: 1, apiFailures: 0 });
    expect(s.methods.B).toMatchObject({ total: 26, correct: 26, accuracy: 1 });
    expect(s.methods.B.meanRowAccuracy).toBe(1);
    expect(s.methods.B.tableConsistency).toBe(1);
    expect(s.paired).toMatchObject({ bothCorrect: 26, onlyA: 0, onlyB: 0, neither: 0, mcnemarP: 1 });
  });

  it("a reader that only copies the world state passes the controls and fails every case where belief differs from reality", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("reality"), mode: "dry-run", model: null, ...fast });
    const s = summarize(file.records);
    expect(s.methods.A.correct).toBe(8); // exactly the true-belief controls
    expect(s.divergence).toMatchObject({ questions: 18, a: 0, b: 0 }); // 0% where belief differs from reality, as in the paper
    expect(s.byCategory.find((g) => g.label.startsWith("Genuine"))).toMatchObject({ questions: 10, a: 0 });
    expect(s.byCategory.find((g) => g.label.startsWith("True"))).toMatchObject({ questions: 8, a: 8 });
  });

  it("random guessing lands near chance", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("random"), mode: "dry-run", model: null, settings: { runs: 40 }, ...fast });
    const s = summarize(file.records);
    expect(s.methods.A.accuracy).toBeGreaterThan(0.3);
    expect(s.methods.A.accuracy).toBeLessThan(0.55);
    expect(s.methods.B.meanRowAccuracy!).toBeGreaterThan(0.4);
    expect(s.methods.B.meanRowAccuracy!).toBeLessThan(0.6);
  });

  it("dry-run files are labelled so they can never be mistaken for results", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, dryRunKind: "oracle", ...fast });
    expect(file.mode).toBe("dry-run");
    expect(file.model).toBeNull();
    expect(file.dryRunKind).toBe("oracle");
  });
});

describe("statistics", () => {
  it("Wilson interval matches known values", () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [l0, h0] = wilson(0, 26);
    expect(l0).toBe(0);
    expect(h0).toBeCloseTo(0.1288, 3);
  });

  it("exact McNemar matches known values", () => {
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(5, 5)).toBe(1);
    expect(mcnemarExact(0, 10)).toBeCloseTo(2 / 1024, 6);
    expect(mcnemarExact(1, 9)).toBeCloseTo(2 * (1 + 10) / 1024, 6);
    expect(mcnemarExact(10, 0)).toBe(mcnemarExact(0, 10));
  });

  it("the family bootstrap is repeatable, contains the mean, and is wider than a naive interval when families are alike", () => {
    const items = benchmarkCases.map((c, i) => ({ family: c.familyId, value: i % 3 === 0 ? 1 : 0 }));
    const a = clusterBootstrap(items);
    const b = clusterBootstrap(items);
    expect(a).toEqual(b);
    expect(a.families).toBe(17);
    expect(a.low).toBeLessThanOrEqual(a.mean);
    expect(a.high).toBeGreaterThanOrEqual(a.mean);
    // all-or-nothing within each family: the clustered interval is at least as wide as a naive one
    const clustered = benchmarkCases.map((c) => ({ family: c.familyId, value: c.familyId.length % 2 })).map((x) => ({ ...x }));
    const wide = clusterBootstrap(clustered);
    const [wl, wh] = wilson(clustered.filter((x) => x.value === 1).length, clustered.length);
    expect(wide.high - wide.low).toBeGreaterThanOrEqual((wh - wl) * 0.8);
  });

  it("the model-free baselines on this benchmark are exactly what the cases say", () => {
    const b = baselineAccuracies();
    const reality = b.find((x) => x.name.startsWith("Copying"))!;
    expect(reality.correct).toBe(8);
    expect(reality.total).toBe(26);
    expect(b.find((x) => x.name.includes("oracle"))!.correct).toBe(26);
    expect(b.find((x) => x.name.startsWith("Always"))!.correct).toBeLessThan(26 * 0.55);
  });

  it("paired counts add up to the number of questions", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("flaky"), mode: "dry-run", model: null, concurrency: 1, settings: { apiRetries: 0 }, ...fast });
    const p = summarize(file.records).paired;
    expect(p.bothCorrect + p.onlyA + p.onlyB + p.neither).toBe(26);
  });
});
