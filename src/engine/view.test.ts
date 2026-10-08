import { beforeEach, describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { trackBeliefs } from "./engine";
import { handleBeliefRequest } from "./handler";
import { resetRateLimit } from "./rate-limit";
import { BeliefStorySchema } from "./schema";
import { beliefStories, getBeliefStory } from "./stories";
import { StepViewSchema, buildStepView, visiblePropositionIds } from "./view";

const viewOf = (id: string, n: number) => {
  const story = getBeliefStory(id)!;
  const scenario = scenarios.find((s) => s.id === id)!;
  return buildStepView(story, trackBeliefs(story), scenario, n);
};
const character = (v: ReturnType<typeof viewOf>, id: string) =>
  v.characters.find((c) => c.id === id)!;

const post = (body: unknown) =>
  new Request("http://localhost/api/belief-tracking", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => resetRateLimit());

describe("step view: the two lenses", () => {
  it("is schema-valid for every step of every scenario", () => {
    for (const s of beliefStories) {
      for (let n = 1; n <= s.events.length; n++) {
        const v = viewOf(s.scenarioId, n);
        expect(StepViewSchema.safeParse(v).success, `${s.scenarioId} step ${n}`).toBe(true);
        expect(v.stepNumber).toBe(n);
        expect(v.totalSteps).toBe(s.events.length);
        expect(v.characters).toHaveLength(s.actors.length);
      }
    }
  });

  it("is a faithful projection of the engine table (nothing invented)", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      for (let n = 1; n <= s.events.length; n++) {
        const v = viewOf(s.scenarioId, n);
        const step = table.steps[n];
        for (const t of v.truths) expect(step.world[t.id], `${s.scenarioId} ${n} truth ${t.id}`).toBe(1);
        for (const c of v.characters) {
          const row = step.actors.find((a) => a.actorId === c.id)!;
          expect(c.participation === "spoke" ? "none" : c.participation).toBe(row.access);
          for (const u of c.updated) {
            expect(row.beliefs[u.id]).toBe(0);
            expect(step.world[u.id]).toBe(0); // an updated-away belief is never one that is true
          }
          for (const b of c.believes) {
            expect(row.beliefs[b.id]).toBe(1);
            expect(b.status).toBe(step.world[b.id] === 1 ? "matches" : "differs");
          }
          for (const k of c.notKnown) {
            expect(row.beliefs[k.id]).toBe(0);
            expect(step.world[k.id]).toBe(1);
          }
        }
      }
    }
  });

  it("never labels missing information as a mistake: 'differs' means believed-but-not-true only", () => {
    for (const s of beliefStories) {
      for (let n = 1; n <= s.events.length; n++) {
        const v = viewOf(s.scenarioId, n);
        const truthIds = new Set(v.truths.map((t) => t.id));
        for (const c of v.characters) {
          for (const b of c.believes) {
            // something is only "different from reality" if it is NOT currently true
            expect(b.status === "differs").toBe(!truthIds.has(b.id));
          }
          // facts a character lacks are listed separately and are always true facts
          for (const k of c.notKnown) {
            expect(truthIds.has(k.id)).toBe(true);
            expect(c.believes.some((b) => b.id === k.id)).toBe(false);
          }
        }
      }
    }
  });

  it("missed message: Jordan has not learned the movie time; that is missing information, not a false belief", () => {
    const v = viewOf("the-unanswered-group-chat", 5);
    const jordan = character(v, "jordan");
    expect(jordan.notKnown.map((k) => k.id)).toContain("movie_at_3");
    expect(jordan.believes.some((b) => b.id === "movie_at_3")).toBe(false);
    expect(jordan.believes.every((b) => b.status !== "differs")).toBe(true);
  });

  it("actual false belief: Ben holds the old room while the lesson is in the library", () => {
    const v = viewOf("the-wrong-room", 1);
    const ben = character(v, "ben");
    expect(ben.believes).toContainEqual(
      expect.objectContaining({ id: "lesson_in_classroom", status: "differs" }),
    );
    expect(v.truths.map((t) => t.id)).toContain("lesson_in_library");
    expect(v.truths.map((t) => t.id)).not.toContain("lesson_in_classroom");
  });

  it("a belief update is marked new and then matches reality", () => {
    const v = viewOf("the-wrong-room", 4);
    const ben = character(v, "ben");
    expect(ben.believes).toContainEqual(
      expect.objectContaining({ id: "lesson_in_library", status: "matches", isNew: true }),
    );
    expect(ben.believes.some((b) => b.status === "differs")).toBe(false);
  });

  it("Taylor's belief about the hook differs from reality after Morgan takes the jacket (she was not there)", () => {
    const v = viewOf("the-missing-jacket", 1);
    expect(character(v, "taylor").participation).toBe("none");
    expect(character(v, "taylor").believes).toContainEqual(
      expect.objectContaining({ id: "blue_jacket_on_hook", status: "differs" }),
    );
    // she has not learned where it went: separate, neutral list
    expect(character(v, "taylor").notKnown.map((k) => k.id)).toContain("morgan_took_blue_jacket");
  });
});

describe("step view: no spoilers", () => {
  it("contains only steps 1..n and never a later step's text", () => {
    for (const sc of scenarios) {
      for (let n = 1; n <= sc.steps.length; n++) {
        const v = viewOf(sc.id, n);
        const json = JSON.stringify(v);
        expect(v.earlierSteps).toHaveLength(n - 1);
        sc.steps.slice(n).forEach((later, i) => {
          expect(json, `${sc.id} step ${n} leaks step ${n + i + 1}`).not.toContain(later.text);
        });
      }
    }
  });

  it("does not expose character roles (several describe later events)", () => {
    for (const sc of scenarios) {
      const json = JSON.stringify(viewOf(sc.id, 1));
      for (const c of sc.characters) expect(json).not.toContain(c.role);
      expect(json).not.toContain('"role"');
    }
  });

  it("does not show a fact before the story reaches it", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      const firstTouch = new Map<string, number>();
      s.events.forEach((e, i) => {
        for (const u of e.type === "action" ? e.effects : e.assertions) {
          if (!firstTouch.has(u.proposition)) firstTouch.set(u.proposition, i + 1);
        }
      });
      for (let n = 1; n <= s.events.length; n++) {
        const json = JSON.stringify(viewOf(s.scenarioId, n));
        const visible = visiblePropositionIds(s, table, n);
        for (const p of s.propositions) {
          if (visible.has(p.id)) continue;
          expect(json, `${s.scenarioId} step ${n} shows hidden "${p.id}"`).not.toContain(p.text);
        }
        for (const id of visible) {
          const touched = firstTouch.get(id);
          if (touched !== undefined && touched <= n) continue;
          if ((s.revealAt[id] ?? Infinity) <= n) continue; // the story text states it by this step
          // shown only as the other side of an exclusive pair: it must already have been held
          const held = table.steps
            .slice(0, n + 1)
            .some((st) => st.world[id] === 1 || st.actors.some((a) => a.beliefs[id] === 1));
          expect(held, `${s.scenarioId} step ${n} shows unheld peer "${id}"`).toBe(true);
        }
      }
    }
  });

  it("by the last step nothing that is true or believed is still hidden", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      const visible = visiblePropositionIds(s, table, s.events.length);
      const last = table.steps.at(-1)!;
      for (const p of s.propositions) {
        const active = last.world[p.id] === 1 || last.actors.some((a) => a.beliefs[p.id] === 1);
        if (active) expect(visible.has(p.id), `${s.scenarioId}: ${p.id}`).toBe(true);
      }
    }
  });
});

describe("step view API", () => {
  it("returns only the requested step", async () => {
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room", step: 2 }), {});
    expect(res.status).toBe(200);
    const body = StepViewSchema.parse(await res.json());
    expect(body.stepNumber).toBe(2);
    expect(body.earlierSteps).toHaveLength(1);
    const later = scenarios.find((s) => s.id === "the-wrong-room")!.steps.slice(2);
    for (const l of later) expect(JSON.stringify(body)).not.toContain(l.text);
  });

  it("uses the engine even if the server is in api mode, with no model call", async () => {
    let called = false;
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room", step: 1 }), {
      mode: "api",
      caller: async () => {
        called = true;
        return "{}";
      },
    });
    expect(res.status).toBe(200);
    expect(called).toBe(false);
  });

  it("rejects out-of-range, non-integer and unknown requests", async () => {
    expect((await handleBeliefRequest(post({ scenarioId: "the-wrong-room", step: 0 }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: "the-wrong-room", step: 6 }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: "the-wrong-room", step: 1.5 }), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: "nope", step: 1 }), {})).status).toBe(404);
  });

  it("serves every step of every scenario", async () => {
    for (const sc of scenarios) {
      for (let n = 1; n <= sc.steps.length; n++) {
        const res = await handleBeliefRequest(post({ scenarioId: sc.id, step: n }), {});
        expect(res.status, `${sc.id} ${n}`).toBe(200);
      }
      const past = await handleBeliefRequest(post({ scenarioId: sc.id, step: sc.steps.length + 1 }), {});
      expect(past.status).toBe(400);
    }
  });
});

describe("step view: participation and updates", () => {
  it("the person who posted a message is shown as having said it, not as absent", () => {
    const v = viewOf("the-unanswered-group-chat", 1);
    expect(character(v, "maya").participation).toBe("spoke");
    expect(character(v, "sam").participation).toBe("told");
    expect(character(v, "jordan").participation).toBe("none");
  });

  it("when someone learns an old belief is no longer true, that update is shown", () => {
    const taylor = character(viewOf("the-missing-jacket", 2), "taylor");
    expect(taylor.participation).toBe("observed");
    expect(taylor.updated.map((u) => u.id)).toEqual(["blue_jacket_on_hook"]);
    expect(taylor.believes).toEqual([]);
    const ben = character(viewOf("the-wrong-room", 4), "ben");
    expect(ben.updated.map((u) => u.id)).toEqual(["lesson_in_classroom"]);
  });

  it("an update only ever appears on the step where it happens", () => {
    expect(character(viewOf("the-wrong-room", 5), "ben").updated).toEqual([]);
  });
});

describe("revealAt (display only)", () => {
  it("shows each weekend plan when the text states it, with the other friend lacking it", () => {
    const one = viewOf("the-different-weekend-plans", 1);
    expect(character(one, "zoe").notKnown.map((k) => k.id)).toContain("devon_plans_arcade");
    expect(character(one, "devon").believes.map((b) => b.id)).toContain("devon_plans_arcade");
    expect(one.truths.map((t) => t.id)).not.toContain("zoe_plans_movie_home"); // not stated until step 2
    const two = viewOf("the-different-weekend-plans", 2);
    expect(character(two, "devon").notKnown.map((k) => k.id)).toContain("zoe_plans_movie_home");
    expect(character(two, "zoe").believes.map((b) => b.id)).toContain("zoe_plans_movie_home");
  });

  it("is missing information, not a mistake, and is resolved when the plans are shared", () => {
    const v = viewOf("the-different-weekend-plans", 2);
    for (const c of v.characters) expect(c.believes.every((b) => b.status === "matches")).toBe(true);
    const end = viewOf("the-different-weekend-plans", 6);
    for (const c of end.characters) expect(c.notKnown).toEqual([]);
  });

  it("does not change the engine's output", () => {
    const story = getBeliefStory("the-different-weekend-plans")!;
    expect(JSON.stringify(trackBeliefs({ ...story, revealAt: {} }))).toBe(
      JSON.stringify(trackBeliefs(story)),
    );
  });

  it("is validated: unknown facts and reveal steps later than the first touching event are rejected", () => {
    const story = getBeliefStory("the-different-weekend-plans")!;
    expect(BeliefStorySchema.safeParse({ ...story, revealAt: { nope: 1 } }).success).toBe(false);
    expect(BeliefStorySchema.safeParse({ ...story, revealAt: { devon_plans_arcade: 6 } }).success).toBe(false);
    expect(BeliefStorySchema.safeParse({ ...story, revealAt: { devon_plans_arcade: 99 } }).success).toBe(false);
    expect(BeliefStorySchema.safeParse({ ...story, revealAt: { devon_plans_arcade: 5 } }).success).toBe(true);
  });
});
