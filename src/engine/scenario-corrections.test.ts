import { describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { trackBeliefs } from "./engine";
import { beliefStories, getBeliefStory } from "./stories";

type Table = ReturnType<typeof trackBeliefs>;

const tableOf = (id: string): Table => trackBeliefs(getBeliefStory(id)!);
const scenarioOf = (id: string) => scenarios.find((s) => s.id === id)!;
const at = (t: Table, n: number) => t.steps.find((s) => s.t === n)!;
const actor = (t: Table, n: number, who: string) =>
  at(t, n).actors.find((a) => a.actorId === who)!;
const belief = (t: Table, n: number, who: string, p: string) =>
  actor(t, n, who).beliefs[p];

describe("The Lunch Table Seat (corrected)", () => {
  const t = tableOf("the-lunch-table-seat");

  it("Riley stays at the table, so Priya has someone to ask", () => {
    expect(scenarioOf("the-lunch-table-seat").steps).toHaveLength(6);
    expect(actor(t, 2, "riley").access).toBe("observed");
    expect(actor(t, 4, "riley").access).toBe("told");
  });

  it("Priya holds neither 'free' nor 'saved' until Riley answers", () => {
    for (const n of [2, 3, 4]) {
      expect(belief(t, n, "priya", "seat_free")).toBe(0);
      expect(belief(t, n, "priya", "seat_saved")).toBe(0);
    }
    expect(actor(t, 5, "priya").access).toBe("told");
    expect(belief(t, 5, "priya", "seat_free")).toBe(1);
  });

  it("moving the bag is its own observed event and the world is updated", () => {
    expect(at(t, 5).world.bag_on_chair).toBe(1);
    expect(at(t, 6).world.bag_on_chair).toBe(0);
    expect(belief(t, 6, "priya", "bag_on_chair")).toBe(0);
    expect(at(t, 6).divergences).toEqual([]);
  });
});

describe("The Joke That Landed Wrong (corrected)", () => {
  const t = tableOf("the-joke-that-landed-wrong");

  it("Eli only learns how the joke felt when Noor says so", () => {
    for (const n of [1, 2, 3, 4]) expect(belief(t, n, "eli", "noor_felt_hurt")).toBe(0);
    expect(at(t, 4).divergences).toContainEqual({
      actorId: "eli",
      proposition: "noor_felt_hurt",
      belief: 0,
      world: 1,
    });
    expect(actor(t, 5, "eli").access).toBe("told");
    expect(belief(t, 5, "eli", "noor_felt_hurt")).toBe(1);
  });

  it("Noor hears 'did not mean to hurt' only after Eli has asked and heard the answer", () => {
    expect(belief(t, 5, "noor", "eli_meant_no_harm")).toBe(0);
    expect(belief(t, 6, "noor", "eli_meant_no_harm")).toBe(1);
    const steps = scenarioOf("the-joke-that-landed-wrong").steps;
    expect(steps[4].text).toMatch(/asks Noor how the joke felt/);
    expect(steps[5].text).toMatch(/did not mean to hurt/);
  });

  it("a friend who was not part of that conversation does not learn it", () => {
    expect(belief(t, 6, "kai", "noor_felt_hurt")).toBe(0);
  });
});

describe("The Group Project Handoff (corrected)", () => {
  const t = tableOf("the-group-project-handoff");
  const sc = scenarioOf("the-group-project-handoff");

  it("no step or role presents someone's assumption as a fact", () => {
    for (const s of sc.steps) expect(s.text).not.toMatch(/\bassum/i);
    expect(sc.characters.map((c) => c.role).join(" ")).not.toMatch(/thinks/i);
  });

  it("is chronological: class, report, Mei's comment, Isaac's reading, Mei's intention, check-in", () => {
    expect(sc.steps[1].text).toMatch(/^After school/);
    expect(sc.steps[2].text).toMatch(/^That evening, Mei tells Isaac/);
    expect(sc.steps[3].text).toMatch(/^Isaac takes this to mean/);
    expect(sc.steps[5].text).toMatch(/^The night before/);
  });

  it("Isaac learns about Mei's interest only because she told him", () => {
    expect(belief(t, 2, "isaac", "mei_likes_design")).toBe(0);
    expect(actor(t, 3, "isaac").access).toBe("told");
    expect(belief(t, 3, "isaac", "mei_likes_design")).toBe(1);
    expect(belief(t, 3, "harper", "mei_likes_design")).toBe(0);
  });

  it("only Harper knows the report is done, and everyone sees that nobody started the slides", () => {
    expect(belief(t, 2, "isaac", "report_done")).toBe(0);
    expect(belief(t, 6, "harper", "report_done")).toBe(1);
    for (const who of ["harper", "isaac", "mei"]) {
      expect(belief(t, 6, who, "slides_not_started")).toBe(1);
    }
  });
});

describe("The Surprise Substitute (corrected)", () => {
  const t = tableOf("the-surprise-substitute");
  const sc = scenarioOf("the-surprise-substitute");

  it("Jules's role and feelings are neutral and tentative", () => {
    const jules = sc.characters.find((c) => c.id === "jules")!;
    expect(jules.role).not.toMatch(/routine/i);
    expect(sc.steps[2].text).toMatch(/a little unsure/);
  });

  it("Jules learns the schedule differs only when told, and only Ren sees Jules looks unsure", () => {
    expect(belief(t, 1, "jules", "schedule_differs")).toBe(0);
    expect(belief(t, 2, "jules", "schedule_differs")).toBe(1);
    expect(belief(t, 3, "jules", "jules_looks_unsure")).toBe(0);
    expect(belief(t, 4, "ren", "jules_looks_unsure")).toBe(1);
    expect(belief(t, 4, "mr-patel", "jules_looks_unsure")).toBe(0);
  });
});

describe("The Different Weekend Plans (corrected)", () => {
  const t = tableOf("the-different-weekend-plans");

  it("each friend learns the other's plan only when it is said", () => {
    for (const n of [0, 1, 2, 3, 4]) expect(belief(t, n, "zoe", "devon_plans_arcade")).toBe(0);
    expect(actor(t, 5, "zoe").access).toBe("told");
    expect(belief(t, 5, "zoe", "devon_plans_arcade")).toBe(1);
    for (const n of [0, 1, 2, 3, 4, 5]) {
      expect(belief(t, n, "devon", "zoe_plans_movie_home")).toBe(0);
    }
    expect(belief(t, 6, "devon", "zoe_plans_movie_home")).toBe(1);
  });

  it("Zoe sees how Devon is dressed, which is not the same as learning the plan", () => {
    expect(belief(t, 3, "zoe", "devon_dressed_for_arcade")).toBe(1);
    expect(belief(t, 3, "zoe", "devon_plans_arcade")).toBe(0);
  });

  it("Devon sees the movie set-up when he is there, and everyone is aligned at the end", () => {
    expect(belief(t, 3, "devon", "snacks_set_out")).toBe(0);
    expect(belief(t, 4, "devon", "snacks_set_out")).toBe(1);
    expect(at(t, 6).divergences).toEqual([]);
  });

  it("the plans are named only after they have been shared", () => {
    const steps = scenarioOf("the-different-weekend-plans").steps;
    expect(steps[0].text).toMatch(/in mind/);
    expect(steps[4].text).toMatch(/^Devon tells Zoe/);
    expect(steps[5].text).toMatch(/^Zoe says the plan was a movie/);
  });
});

describe("The New Student's Hello (corrected)", () => {
  const t = tableOf("the-new-student-hello");
  const sc = scenarioOf("the-new-student-hello");

  it("Amara has no evidence about Theo's reason until Theo tells her", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(belief(t, n, "amara", "theo_thinking_about_test")).toBe(0);
    }
    expect(actor(t, 5, "amara").access).toBe("told");
    expect(belief(t, 5, "amara", "theo_thinking_about_test")).toBe(1);
  });

  it("no step states a guess about Theo's reason as a conclusion", () => {
    for (const s of sc.steps) expect(s.text).not.toMatch(/probably|realizes/i);
    expect(sc.steps[2].text).toMatch(/wonders whether Theo saw it/);
  });

  it("Theo never learns about the wave", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(belief(t, n, "theo", "amara_waved")).toBe(0);
  });
});

describe("consistency across all 12 scenarios", () => {
  it("nobody is told something that is not true in the world", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      for (const e of s.events) {
        if (e.type !== "communication") continue;
        for (const a of e.assertions) {
          expect(at(table, e.t).world[a.proposition], `${s.scenarioId} ${e.id}`).toBe(
            a.value ? 1 : 0,
          );
        }
      }
    }
  });

  it("everyone with access to an event holds exactly what it conveyed", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      for (const e of s.events) {
        const updates = e.type === "action" ? e.effects : e.assertions;
        for (const a of at(table, e.t).actors.filter((x) => x.access !== "none")) {
          for (const u of updates) {
            expect(a.beliefs[u.proposition], `${s.scenarioId} ${e.id} ${a.actorId}`).toBe(
              u.value ? 1 : 0,
            );
          }
        }
      }
    }
  });

  it("a speaker holds what they say (the engine does not update speakers, so the data must)", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      for (const e of s.events) {
        if (e.type !== "communication" || !e.speaker) continue;
        for (const a of e.assertions) {
          expect(belief(table, e.t, e.speaker, a.proposition), `${s.scenarioId} ${e.id}`).toBe(
            a.value ? 1 : 0,
          );
        }
      }
    }
  });

  it("scenario text meets the library rules: 4-6 one-sentence steps, 2-3 characters, no guesses", () => {
    for (const sc of scenarios) {
      expect(sc.steps.length).toBeGreaterThanOrEqual(4);
      expect(sc.steps.length).toBeLessThanOrEqual(6);
      expect(sc.characters.length).toBeGreaterThanOrEqual(2);
      expect(sc.characters.length).toBeLessThanOrEqual(3);
      for (const s of sc.steps) {
        const sentences = s.text.replace(/\b(Mr|Ms)\./g, "$1").match(/[.!?]"?(\s|$)/g) ?? [];
        expect(sentences.length, `${sc.id}: ${s.text}`).toBe(1);
        expect(s.text).not.toMatch(/probably/i);
      }
    }
  });

  it("the world never ends up with two mutually exclusive facts true", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      for (const step of table.steps) {
        for (const group of s.exclusiveGroups) {
          expect(group.filter((p) => step.world[p] === 1).length).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
