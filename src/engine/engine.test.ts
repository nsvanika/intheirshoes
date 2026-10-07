import { describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { trackBeliefs } from "./engine";
import { BeliefStorySchema, BeliefTableSchema } from "./schema";
import { beliefStories, getBeliefStory } from "./stories";

/** Minimal story builder for rule-level tests. */
function story(over: Record<string, unknown>) {
  return {
    scenarioId: "test-story",
    actors: [
      { id: "ann", name: "Ann" },
      { id: "bo", name: "Bo" },
      { id: "cy", name: "Cy" },
    ],
    propositions: [
      { id: "box_in_basket", text: "The box is in the basket" },
      { id: "box_in_drawer", text: "The box is in the drawer" },
      { id: "door_open", text: "The door is open" },
    ],
    exclusiveGroups: [["box_in_basket", "box_in_drawer"]],
    events: [],
    ...over,
  };
}

const at = (table: ReturnType<typeof trackBeliefs>, t: number) =>
  table.steps.find((s) => s.t === t)!;
const actor = (table: ReturnType<typeof trackBeliefs>, t: number, id: string) =>
  at(table, t).actors.find((a) => a.actorId === id)!;

describe("R1: observation updates the observer", () => {
  it("sets the observer's belief to the new world value", () => {
    const table = trackBeliefs(
      story({
        events: [
          { type: "action", id: "e1", t: 1, description: "Door opens.", effects: [{ proposition: "door_open", value: true }], observers: ["ann"] },
        ],
      }),
    );
    expect(actor(table, 1, "ann").beliefs.door_open).toBe(1);
    expect(actor(table, 1, "ann").access).toBe("observed");
    expect(actor(table, 1, "ann").changedBeliefs).toEqual(["door_open"]);
  });
});

describe("R2: no access preserves prior belief (false belief)", () => {
  const table = trackBeliefs(
    story({
      initialWorld: ["box_in_basket"],
      initialBeliefs: { ann: ["box_in_basket"], bo: ["box_in_basket"] },
      events: [
        { type: "action", id: "e1", t: 1, description: "Ann leaves.", effects: [], observers: ["ann", "bo"] },
        { type: "action", id: "e2", t: 2, description: "Bo moves the box.", effects: [{ proposition: "box_in_drawer", value: true }], observers: ["bo"] },
      ],
    }),
  );

  it("the world changes but the absent actor's belief does not", () => {
    expect(at(table, 2).world.box_in_drawer).toBe(1);
    expect(actor(table, 2, "ann").beliefs.box_in_basket).toBe(1);
    expect(actor(table, 2, "ann").beliefs.box_in_drawer).toBe(0);
    expect(actor(table, 2, "ann").access).toBe("none");
    expect(actor(table, 2, "ann").changedBeliefs).toEqual([]);
  });

  it("reports the belief-reality divergence", () => {
    const d = at(table, 2).divergences.filter((x) => x.actorId === "ann");
    expect(d).toContainEqual({ actorId: "ann", proposition: "box_in_basket", belief: 1, world: 0 });
    expect(d).toContainEqual({ actorId: "ann", proposition: "box_in_drawer", belief: 0, world: 1 });
    expect(at(table, 2).divergences.some((x) => x.actorId === "bo")).toBe(false);
  });

  it("the observer's belief matches the world", () => {
    expect(actor(table, 2, "bo").beliefs.box_in_drawer).toBe(1);
    expect(actor(table, 2, "bo").beliefs.box_in_basket).toBe(0); // R3 cleared it
  });
});

describe("R3: mutually exclusive propositions", () => {
  it("clears exclusive peers in the world and in beliefs", () => {
    const table = trackBeliefs(
      story({
        initialWorld: ["box_in_basket"],
        initialBeliefs: { ann: ["box_in_basket"] },
        events: [
          { type: "action", id: "e1", t: 1, description: "Moved.", effects: [{ proposition: "box_in_drawer", value: true }], observers: ["ann"] },
        ],
      }),
    );
    expect(at(table, 1).world).toMatchObject({ box_in_basket: 0, box_in_drawer: 1 });
    expect(actor(table, 1, "ann").beliefs).toMatchObject({ box_in_basket: 0, box_in_drawer: 1 });
  });

  it("rejects a story that starts with exclusive propositions both true", () => {
    const r = BeliefStorySchema.safeParse(story({ initialWorld: ["box_in_basket", "box_in_drawer"], events: [{ type: "action", id: "e1", t: 1, description: "x", effects: [], observers: [] }] }));
    expect(r.success).toBe(false);
  });
});

describe("R4: missed messages — only recipients and overhearers are updated", () => {
  const table = trackBeliefs(
    story({
      events: [
        { type: "communication", id: "e1", t: 1, description: "Ann tells Bo the door is open; Cy is nearby.", speaker: "ann", assertions: [{ proposition: "door_open", value: true }], recipients: ["bo"], overhearers: ["cy"] },
      ],
      initialWorld: ["door_open"],
    }),
  );

  it("recipient is told, overhearer overhears, both update", () => {
    expect(actor(table, 1, "bo")).toMatchObject({ access: "told" });
    expect(actor(table, 1, "bo").beliefs.door_open).toBe(1);
    expect(actor(table, 1, "cy")).toMatchObject({ access: "overheard" });
    expect(actor(table, 1, "cy").beliefs.door_open).toBe(1);
  });

  it("a non-recipient never learns it and keeps diverging from reality", () => {
    expect(actor(table, 1, "ann").access).toBe("none"); // speaker is not auto-updated
    expect(actor(table, 1, "ann").beliefs.door_open).toBe(0);
    expect(at(table, 1).divergences.some((d) => d.actorId === "ann" && d.proposition === "door_open")).toBe(true);
  });
});

describe("belief updates over time", () => {
  it("a later observation corrects an earlier false belief", () => {
    const table = trackBeliefs(
      story({
        initialWorld: ["box_in_drawer"],
        initialBeliefs: { ann: ["box_in_basket"] },
        events: [
          { type: "action", id: "e1", t: 1, description: "Ann looks in the drawer.", effects: [{ proposition: "box_in_drawer", value: true }], observers: ["ann"] },
        ],
      }),
    );
    expect(at(table, 0).divergences.length).toBeGreaterThan(0);
    expect(actor(table, 1, "ann").beliefs).toMatchObject({ box_in_basket: 0, box_in_drawer: 1 });
    expect(at(table, 1).divergences.filter((d) => d.actorId === "ann")).toEqual([]);
  });

  it("a message replaces an earlier belief (newest wins) and attaches a neutral note", () => {
    const table = trackBeliefs(
      story({
        initialWorld: ["box_in_drawer"],
        initialBeliefs: { bo: ["box_in_basket"] },
        events: [
          { type: "communication", id: "e1", t: 1, description: "Ann says the box is in the drawer.", speaker: "ann", assertions: [{ proposition: "box_in_drawer", value: true }], recipients: ["bo"], overhearers: [] },
        ],
      }),
    );
    expect(actor(table, 1, "bo").beliefs).toMatchObject({ box_in_basket: 0, box_in_drawer: 1 });
    expect(at(table, 1).notes.map((n) => n.actorId)).toContain("bo");
  });

  it("accumulates the ids of events an actor had access to", () => {
    const table = trackBeliefs(
      story({
        events: [
          { type: "action", id: "e1", t: 1, description: "a", effects: [], observers: ["ann"] },
          { type: "action", id: "e2", t: 2, description: "b", effects: [], observers: ["bo"] },
          { type: "action", id: "e3", t: 3, description: "c", effects: [], observers: ["ann"] },
        ],
      }),
    );
    expect(actor(table, 3, "ann").accessedEventIds).toEqual(["e1", "e3"]);
    expect(actor(table, 3, "bo").accessedEventIds).toEqual(["e2"]);
  });
});

describe("determinism and output schema", () => {
  it("returns identical output for identical input", () => {
    const s = story({ events: [{ type: "action", id: "e1", t: 1, description: "x", effects: [{ proposition: "door_open", value: true }], observers: ["ann"] }] });
    expect(JSON.stringify(trackBeliefs(s))).toBe(JSON.stringify(trackBeliefs(s)));
  });
});

describe("input validation", () => {
  const ok = { type: "action", id: "e1", t: 1, description: "x", effects: [], observers: [] };
  it("rejects unknown references, duplicate ids, non-increasing times and extra keys", () => {
    expect(BeliefStorySchema.safeParse(story({ events: [{ ...ok, observers: ["nobody"] }] })).success).toBe(false);
    expect(BeliefStorySchema.safeParse(story({ events: [{ ...ok, effects: [{ proposition: "nope", value: true }] }] })).success).toBe(false);
    expect(BeliefStorySchema.safeParse(story({ events: [ok, { ...ok, t: 2 }] })).success).toBe(false); // duplicate id
    expect(BeliefStorySchema.safeParse(story({ events: [ok, { ...ok, id: "e2", t: 1 }] })).success).toBe(false);
    expect(BeliefStorySchema.safeParse(story({ events: [ok], extra: 1 })).success).toBe(false);
    expect(BeliefStorySchema.safeParse(story({ events: [] })).success).toBe(false);
  });
});

describe("the 12 built-in scenarios", () => {
  it("every scenario has a structured story with one event per step", () => {
    expect(beliefStories).toHaveLength(12);
    for (const sc of scenarios) {
      const s = getBeliefStory(sc.id);
      expect(s, sc.id).toBeDefined();
      expect(s!.events).toHaveLength(sc.steps.length);
      s!.events.forEach((e, i) => expect(e.description).toBe(sc.steps[i].text));
    }
  });

  it("every table is schema-valid, complete, and deterministic", () => {
    for (const s of beliefStories) {
      const table = trackBeliefs(s);
      expect(BeliefTableSchema.safeParse(table).success, s.scenarioId).toBe(true);
      expect(table.steps).toHaveLength(s.events.length + 1);
      for (const step of table.steps) {
        expect(step.actors).toHaveLength(s.actors.length);
        expect(Object.keys(step.world)).toHaveLength(s.propositions.length);
      }
      expect(JSON.stringify(trackBeliefs(s))).toBe(JSON.stringify(table));
    }
  });

  it("missed message: Jordan never learns the movie time and diverges from reality", () => {
    const t = trackBeliefs(getBeliefStory("the-unanswered-group-chat")!);
    for (const step of t.steps.slice(1)) {
      expect(step.actors.find((a) => a.actorId === "jordan")!.beliefs.movie_at_3).toBe(0);
    }
    const last = t.steps.at(-1)!;
    expect(last.divergences).toContainEqual({ actorId: "jordan", proposition: "movie_at_3", belief: 0, world: 1 });
    expect(last.actors.find((a) => a.actorId === "sam")!.beliefs.movie_at_3).toBe(1);
  });

  it("false belief then update: Ben holds the old room until he checks the schedule", () => {
    const t = trackBeliefs(getBeliefStory("the-wrong-room")!);
    const ben = (n: number) => actor(t, n, "ben");
    expect(ben(1).beliefs).toMatchObject({ lesson_in_classroom: 1, lesson_in_library: 0 });
    expect(at(t, 1).divergences.some((d) => d.actorId === "ben" && d.proposition === "lesson_in_library")).toBe(true);
    expect(ben(3).beliefs).toMatchObject({ lesson_in_classroom: 1 }); // sat in the empty room, learned nothing
    expect(ben(4).beliefs).toMatchObject({ lesson_in_classroom: 0, lesson_in_library: 1 });
    expect(at(t, 4).divergences.filter((d) => d.actorId === "ben" && d.proposition.startsWith("lesson_in"))).toEqual([]);
  });

  it("belief update via message: Nia keeps the old time until Coach Lee tells her", () => {
    const t = trackBeliefs(getBeliefStory("the-rescheduled-practice")!);
    expect(actor(t, 4, "nia").beliefs).toMatchObject({ practice_at_old_time: 1, practice_at_earlier_time: 0 });
    expect(actor(t, 5, "nia").beliefs).toMatchObject({ practice_at_old_time: 0, practice_at_earlier_time: 1 });
    expect(actor(t, 1, "marcus").beliefs.practice_at_earlier_time).toBe(1);
  });
});
