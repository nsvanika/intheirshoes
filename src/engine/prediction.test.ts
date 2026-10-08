import { beforeEach, describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { getPredictionQuestion, predictionQuestions } from "@/data/predictions";
import { trackBeliefs } from "./engine";
import { handleBeliefRequest } from "./handler";
import { buildPrompt, buildReveal, choiceFitsBeliefs, evidenceLines } from "./prediction";
import { PredictionPromptSchema, PredictionRevealSchema } from "./prediction-schema";
import { resetRateLimit } from "./rate-limit";
import { beliefStories, getBeliefStory } from "./stories";
import { StepViewSchema, buildStepView, visiblePropositionIds } from "./view";

const storyOf = (id: string) => getBeliefStory(id)!;
const scenarioOf = (id: string) => scenarios.find((s) => s.id === id)!;
const post = (body: unknown) =>
  new Request("http://localhost/api/belief-tracking", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => resetRateLimit());

// Judgment words and scoring language. (Everyday uses such as "points to" or "lost-and-found" are fine.)
const FORBIDDEN = /\b(wrong|incorrect|fail(ed|ure|s)?|error|bad|stupid|scores?|\d+ points?)\b|[✗✘❌]/i;

describe("question data", () => {
  it("every one of the 12 scenarios has at least one belief-based question", () => {
    for (const sc of scenarios) {
      const qs = predictionQuestions.filter((q) => q.scenarioId === sc.id);
      expect(qs.length, sc.id).toBeGreaterThanOrEqual(1);
      expect(qs.some((q) => q.kind === "belief"), `${sc.id} has a belief question`).toBe(true);
    }
  });

  it("question ids are unique and at most one question is asked after any step", () => {
    expect(new Set(predictionQuestions.map((q) => q.id)).size).toBe(predictionQuestions.length);
    const keys = predictionQuestions.map((q) => `${q.scenarioId}:${q.afterStep}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("each question has exactly 3 choices with ids a, b, c", () => {
    for (const q of predictionQuestions) {
      expect(q.choices, q.id).toHaveLength(3);
      expect(q.choices.map((c) => c.id), q.id).toEqual(["a", "b", "c"]);
    }
  });

  it("each question is about a real character, asked before a step that exists", () => {
    for (const q of predictionQuestions) {
      const story = storyOf(q.scenarioId);
      expect(story.actors.some((a) => a.id === q.characterId), q.id).toBe(true);
      expect(q.afterStep).toBeGreaterThanOrEqual(1);
      expect(q.afterStep, q.id).toBeLessThan(story.events.length); // there is a next step to reveal
    }
  });

  it("the best answers are not all in the same position", () => {
    const positions = new Set(predictionQuestions.map((q) => q.best).filter(Boolean));
    expect(positions.size).toBe(3);
  });

  it("wording is gentle: no 'wrong', 'incorrect', 'fail', scores or X marks anywhere", () => {
    for (const q of predictionQuestions) {
      const all = [q.prompt, q.explanation, ...q.choices.flatMap((c) => [c.text, c.note])].join(" ");
      expect(all, q.id).not.toMatch(FORBIDDEN);
    }
  });
});

describe("answers are supported by the belief engine", () => {
  const belief = predictionQuestions.filter((q) => q.kind === "belief");

  it("the best-supported choice relies only on beliefs the character really holds at that step", () => {
    for (const q of belief) {
      const table = trackBeliefs(storyOf(q.scenarioId));
      const best = q.choices.find((c) => c.id === q.best)!;
      expect(best.reliesOn, q.id).not.toBeNull();
      expect(choiceFitsBeliefs(q, best, table), q.id).toBe(true);
    }
  });

  it("every other choice either needs a belief the character lacks, or has no basis in their information", () => {
    for (const q of belief) {
      const table = trackBeliefs(storyOf(q.scenarioId));
      for (const c of q.choices.filter((x) => x.id !== q.best)) {
        const fits = choiceFitsBeliefs(q, c, table);
        expect(fits === false || fits === null, `${q.id} choice ${c.id}`).toBe(true);
      }
    }
  });

  it("each question has at least one alternative that contradicts the character's actual belief state", () => {
    for (const q of belief) {
      const table = trackBeliefs(storyOf(q.scenarioId));
      const contradicting = q.choices.filter((c) => choiceFitsBeliefs(q, c, table) === false);
      expect(contradicting.length, q.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("every proposition a question refers to exists in the story", () => {
    for (const q of predictionQuestions) {
      const ids = new Set(storyOf(q.scenarioId).propositions.map((p) => p.id));
      for (const c of q.choices) for (const r of c.reliesOn ?? []) expect(ids.has(r.proposition), q.id).toBe(true);
      for (const e of q.evidence) {
        expect(ids.has(e.proposition), q.id).toBe(true);
        if (e.cause) expect(ids.has(e.cause), q.id).toBe(true);
      }
    }
  });

  it("distinguishes a false belief from missing information, matching the engine", () => {
    // False belief: believes something that is not true right now.
    const falseBelief = ["jacket-taylor-looks", "wrong-room-ben-monday", "practice-nia-thursday"];
    for (const id of falseBelief) {
      const q = predictionQuestions.find((x) => x.id === id)!;
      const table = trackBeliefs(storyOf(q.scenarioId));
      const best = q.choices.find((c) => c.id === q.best)!;
      const p = best.reliesOn![0].proposition;
      const step = table.steps[q.afterStep];
      expect(step.actors.find((a) => a.actorId === q.characterId)!.beliefs[p], id).toBe(1);
      expect(step.world[p], id).toBe(0);
    }
    // Missing information: the character does not hold something that is true.
    const missing = ["group-chat-jordan-saturday", "party-alex-walks-in", "hello-amara-why"];
    for (const id of missing) {
      const q = predictionQuestions.find((x) => x.id === id)!;
      const table = trackBeliefs(storyOf(q.scenarioId));
      const best = q.choices.find((c) => c.id === q.best)!;
      const p = best.reliesOn![0].proposition;
      const step = table.steps[q.afterStep];
      expect(step.actors.find((a) => a.actorId === q.characterId)!.beliefs[p], id).toBe(0);
      expect(step.world[p], id).toBe(1);
    }
  });

  it("the story's next step is shown as the outcome, and the evidence only uses facts already visible", () => {
    for (const q of predictionQuestions) {
      const story = storyOf(q.scenarioId);
      const table = trackBeliefs(story);
      const visible = visiblePropositionIds(story, table, q.afterStep);
      for (const e of q.evidence) {
        expect(visible.has(e.proposition), `${q.id} evidence ${e.proposition}`).toBe(true);
        if (e.cause) expect(visible.has(e.cause), `${q.id} cause ${e.cause}`).toBe(true);
      }
      const lines = evidenceLines(q, story, table, scenarioOf(q.scenarioId));
      expect(lines.length).toBeGreaterThan(0);
    }
  });
});

describe("interpretation (feelings) questions", () => {
  const interp = predictionQuestions.filter((q) => q.kind === "interpretation");

  it("exist only as clearly separate, answer-less questions", () => {
    expect(interp.length).toBeGreaterThanOrEqual(1);
    for (const q of interp) {
      expect(q.best).toBeNull();
      for (const c of q.choices) expect(c.reliesOn).toBeNull();
    }
  });

  it("are a small minority; belief-based questions come first", () => {
    expect(interp.length).toBeLessThan(predictionQuestions.length / 4);
  });

  it("reveal has no best answer and never scores the choice", async () => {
    for (const q of interp) {
      for (const id of ["a", "b", "c"] as const) {
        const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: id }), {});
        const r = PredictionRevealSchema.parse(await res.json());
        expect(r.kind).toBe("interpretation");
        expect(r.bestChoiceId).toBeNull();
        expect(r.matchedBest).toBeNull();
        expect(r.explanation).toMatch(/no single answer|different people/i);
      }
    }
  });
});

describe("spoiler prevention: before the student answers", () => {
  it("the prompt has only an id, kind, name, question and three neutral choices", () => {
    for (const q of predictionQuestions) {
      const prompt = buildPrompt(q, storyOf(q.scenarioId));
      expect(Object.keys(prompt).sort()).toEqual(["characterName", "choices", "id", "kind", "prompt"]);
      for (const c of prompt.choices) expect(Object.keys(c).sort()).toEqual(["id", "text"]);
    }
  });

  it("the step view that carries the prompt never contains the answer, explanation, evidence or next event", async () => {
    for (const q of predictionQuestions) {
      const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep }), {});
      const body = await res.json();
      const view = StepViewSchema.parse(body);
      expect(view.prediction?.id).toBe(q.id);
      const json = JSON.stringify(body);
      const sc = scenarioOf(q.scenarioId);

      expect(json, q.id).not.toContain(q.explanation);
      for (const c of q.choices) expect(json, `${q.id} note`).not.toContain(c.note);
      for (const line of evidenceLines(q, storyOf(q.scenarioId), trackBeliefs(storyOf(q.scenarioId)), sc)) {
        expect(json, `${q.id} evidence`).not.toContain(line);
      }
      for (const k of ["best", "bestChoiceId", "explanation", "evidence", "reliesOn", "matchedBest", "notes", "nextStep"]) {
        expect(json, `${q.id} key ${k}`).not.toContain(`"${k}"`);
      }
      // later story steps stay hidden
      sc.steps.slice(q.afterStep).forEach((later) => expect(json, `${q.id}`).not.toContain(later.text));
    }
  });

  it("question and choice text never state a later step or a fact the story has not reached yet", () => {
    for (const q of predictionQuestions) {
      const story = storyOf(q.scenarioId);
      const table = trackBeliefs(story);
      const visible = visiblePropositionIds(story, table, q.afterStep);
      const text = [q.prompt, ...q.choices.map((c) => c.text)].join(" \n ");
      scenarioOf(q.scenarioId).steps.slice(q.afterStep).forEach((later) => {
        expect(text, q.id).not.toContain(later.text);
      });
      for (const p of story.propositions) {
        if (!visible.has(p.id)) expect(text, `${q.id} states hidden fact "${p.text}"`).not.toContain(p.text);
      }
    }
  });

  it("every view in a scenario other than the asking step carries no prompt", async () => {
    for (const sc of scenarios) {
      const asked = new Set(predictionQuestions.filter((q) => q.scenarioId === sc.id).map((q) => q.afterStep));
      for (let n = 1; n <= sc.steps.length; n++) {
        const res = await handleBeliefRequest(post({ scenarioId: sc.id, step: n }), {});
        const view = StepViewSchema.parse(await res.json());
        expect(view.prediction !== null, `${sc.id} step ${n}`).toBe(asked.has(n));
      }
    }
  });

  it("a request with no answer never returns a reveal", async () => {
    const q = predictionQuestions[0];
    const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep }), {});
    const body = await res.json();
    expect(PredictionRevealSchema.safeParse(body).success).toBe(false);
  });

  it("the initial step-1 payload contains no answers either", () => {
    for (const q of predictionQuestions.filter((x) => x.afterStep === 1)) {
      const story = storyOf(q.scenarioId);
      const view = buildStepView(story, trackBeliefs(story), scenarioOf(q.scenarioId), 1, buildPrompt(q, story));
      const json = JSON.stringify(view);
      expect(json).not.toContain(q.explanation);
      for (const c of q.choices) expect(json).not.toContain(c.note);
    }
  });
});

describe("revealing after the student submits", () => {
  it("choosing the best-supported answer is recognised, with the explanation and evidence", async () => {
    for (const q of predictionQuestions.filter((x) => x.kind === "belief")) {
      const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: q.best }), {});
      expect(res.status, q.id).toBe(200);
      const r = PredictionRevealSchema.parse(await res.json());
      expect(r.matchedBest).toBe(true);
      expect(r.bestChoiceId).toBe(q.best);
      expect(r.chosenChoiceId).toBe(q.best);
      expect(r.explanation).toBe(q.explanation);
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.notes.map((n) => n.choiceId)).toEqual(["a", "b", "c"]);
    }
  });

  it("every alternative answer gets a gentle reveal, still naming the best-supported answer", async () => {
    for (const q of predictionQuestions.filter((x) => x.kind === "belief")) {
      for (const c of q.choices.filter((x) => x.id !== q.best)) {
        const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: c.id }), {});
        expect(res.status, `${q.id} ${c.id}`).toBe(200);
        const r = PredictionRevealSchema.parse(await res.json());
        expect(r.matchedBest).toBe(false);
        expect(r.bestChoiceId).toBe(q.best);
        expect(r.chosenChoiceId).toBe(c.id);
        // only the text a student reads (ids are internal; one scenario is titled "The Wrong Room")
        const text = [r.explanation, ...r.notes.map((n) => n.text), ...r.evidence.map((e) => e.text)].join(" ");
        expect(text, `${q.id} ${c.id}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("the reveal shows the next story step only now, matching the scenario text", async () => {
    for (const q of predictionQuestions) {
      const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: "a" }), {});
      const r = PredictionRevealSchema.parse(await res.json());
      expect(r.nextStep).toEqual({ number: q.afterStep + 1, text: scenarioOf(q.scenarioId).steps[q.afterStep].text });
    }
  });

  it("evidence comes from the engine: beliefs, and how the character did or did not learn them", () => {
    const q = predictionQuestions.find((x) => x.id === "wrong-room-ben-monday")!;
    const story = storyOf(q.scenarioId);
    const lines = evidenceLines(q, story, trackBeliefs(story), scenarioOf(q.scenarioId));
    expect(lines[0]).toContain("Ben believes");
    expect(lines[0]).toContain("not true right now");
    expect(lines[1]).toMatch(/In step 1 .*Ben did not see or hear it\./);

    const jordan = predictionQuestions.find((x) => x.id === "group-chat-jordan-saturday")!;
    const j = evidenceLines(jordan, storyOf(jordan.scenarioId), trackBeliefs(storyOf(jordan.scenarioId)), scenarioOf(jordan.scenarioId));
    expect(j[0]).toContain("has not seen or been told");
    expect(j[1]).toMatch(/In step 1 .*Jordan did not see or hear it\./);

    const nia = predictionQuestions.find((x) => x.id === "practice-nia-thursday")!;
    const n = evidenceLines(nia, storyOf(nia.scenarioId), trackBeliefs(storyOf(nia.scenarioId)), scenarioOf(nia.scenarioId));
    expect(n.join(" ")).toContain("Marcus was told");
  });

  it("evidence never assumes a character knows something they have not observed or been told", () => {
    for (const q of predictionQuestions) {
      const story = storyOf(q.scenarioId);
      const table = trackBeliefs(story);
      const lines = evidenceLines(q, story, table, scenarioOf(q.scenarioId));
      q.evidence.forEach((e) => {
        const actor = story.actors.find((a) => a.id === e.actorId)!;
        const text = story.propositions.find((p) => p.id === e.proposition)!.text;
        const row = table.steps[q.afterStep].actors.find((a) => a.actorId === e.actorId)!;
        const mentions = lines.filter((l) => l.includes(`"${text}"`) && l.startsWith(actor.name));
        expect(mentions.length, `${q.id} ${e.proposition}`).toBe(1);
        if (row.beliefs[e.proposition] === 0) expect(mentions[0]).toMatch(/has not seen or been told|does not currently hold/);
        else expect(mentions[0]).toContain("believes");
      });
    }
  });
});

describe("API validation for predictions", () => {
  it("rejects an unknown choice, a step with no question, the last step, and unknown scenarios", async () => {
    const q = predictionQuestions[0];
    expect((await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: "z" }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: "" }), {})).status).toBe(400);
    const noQuestionStep = [1, 2, 3, 4, 5].find((n) => !getPredictionQuestion(q.scenarioId, n))!;
    expect((await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: noQuestionStep, answer: "a" }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: 5, answer: "a" }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: "nope", step: 1, answer: "a" }), {})).status).toBe(404);
    expect((await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: "a", extra: 1 }), {})).status).toBe(400);
  });

  it("works in api mode too, with no model call", async () => {
    const q = predictionQuestions[0];
    let called = false;
    const res = await handleBeliefRequest(post({ scenarioId: q.scenarioId, step: q.afterStep, answer: "a" }), {
      mode: "api",
      caller: async () => {
        called = true;
        return "{}";
      },
    });
    expect(res.status).toBe(200);
    expect(called).toBe(false);
  });
});

describe("all 12 scenarios, end to end", () => {
  it("for every scenario: ask, answer each choice, reveal, and the next step exists", async () => {
    for (const s of beliefStories) {
      const qs = predictionQuestions.filter((q) => q.scenarioId === s.scenarioId);
      for (const q of qs) {
        const table = trackBeliefs(s);
        const prompt = PredictionPromptSchema.parse(buildPrompt(q, s));
        expect(prompt.choices).toHaveLength(3);
        for (const c of q.choices) {
          const reveal = buildReveal(q, s, table, scenarioOf(s.scenarioId), c.id);
          expect(PredictionRevealSchema.safeParse(reveal).success).toBe(true);
        }
      }
    }
  });
});
