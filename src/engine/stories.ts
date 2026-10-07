import { scenarios } from "@/data/scenarios";
import { BeliefStorySchema, type BeliefStory } from "./schema";

/**
 * Structured (engine-readable) versions of the 12 scenarios.
 *
 * The scenario prose in src/data/scenarios.ts is the source of each event's
 * description; the entries below add what the paper's representation needs and
 * the prose cannot supply: propositions, who observed or was told what, and
 * declared starting beliefs. Event N here is step N of the scenario.
 *
 * These were hand-authored for this app, not taken from the paper's dataset.
 * Only evidence-driven belief is modelled: wondering, assuming and forgetting
 * do not change a belief, because the paper has no rule that says they do.
 */

type Flags = Record<string, boolean>;
type Spec =
  | { kind: "action"; effects: Flags; observers: string[] }
  | {
      kind: "communication";
      speaker: string;
      assertions: Flags;
      recipients: string[];
      overhearers: string[];
    };

const act = (effects: Flags, observers: string[]): Spec => ({
  kind: "action",
  effects,
  observers,
});
const say = (
  speaker: string,
  assertions: Flags,
  recipients: string[],
  overhearers: string[] = [],
): Spec => ({ kind: "communication", speaker, assertions, recipients, overhearers });
/** A step where nothing observable changes (e.g. someone wonders or feels something). */
const quiet = (): Spec => act({}, []);

const flags = (f: Flags) => Object.entries(f).map(([proposition, value]) => ({ proposition, value }));

interface Def {
  propositions: Record<string, string>;
  exclusiveGroups?: string[][];
  initialWorld?: string[];
  initialBeliefs?: Record<string, string[]>;
  events: Spec[];
}

function build(scenarioId: string, def: Def): BeliefStory {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);
  if (def.events.length !== scenario.steps.length) {
    throw new Error(`"${scenarioId}": ${def.events.length} events but ${scenario.steps.length} steps`);
  }
  return BeliefStorySchema.parse({
    scenarioId,
    actors: scenario.characters.map((c) => ({ id: c.id, name: c.name })),
    propositions: Object.entries(def.propositions).map(([id, text]) => ({ id, text })),
    exclusiveGroups: def.exclusiveGroups ?? [],
    initialWorld: def.initialWorld ?? [],
    initialBeliefs: def.initialBeliefs ?? {},
    events: def.events.map((spec, i) => {
      const base = { id: `e${i + 1}`, t: i + 1, description: scenario.steps[i].text };
      return spec.kind === "action"
        ? { type: "action", ...base, effects: flags(spec.effects), observers: spec.observers }
        : {
            type: "communication",
            ...base,
            speaker: spec.speaker,
            assertions: flags(spec.assertions),
            recipients: spec.recipients,
            overhearers: spec.overhearers,
          };
    }),
  });
}

export const beliefStories: BeliefStory[] = [
  build("the-unanswered-group-chat", {
    propositions: {
      movie_at_3: "The movie starts at 3:00 on Saturday",
      sam_confirmed: "Sam has confirmed they will come",
      jordan_phone_away: "Jordan's phone is in another room",
      jordan_at_home: "Jordan stayed home",
      jordan_absent_at_theater: "Jordan has not arrived at the theater",
    },
    initialWorld: ["movie_at_3"],
    initialBeliefs: { maya: ["movie_at_3"] },
    events: [
      say("maya", { movie_at_3: true }, ["sam"]), // Jordan never sees it
      act({ sam_confirmed: true }, ["sam", "maya"]),
      act({ jordan_phone_away: true }, ["jordan"]),
      act({ jordan_at_home: true }, ["jordan"]),
      act({ jordan_absent_at_theater: true }, ["maya"]),
    ],
  }),

  build("the-lunch-table-seat", {
    propositions: {
      bag_on_chair: "A bag is on the open chair",
      seat_free: "The chair is free to sit in",
      seat_saved: "The chair is being saved for someone",
    },
    exclusiveGroups: [["seat_free", "seat_saved"]],
    initialWorld: ["seat_free"],
    initialBeliefs: { riley: ["seat_free"] },
    events: [
      act({ bag_on_chair: true }, ["riley"]),
      act({ bag_on_chair: true }, ["riley", "priya"]),
      quiet(),
      say("priya", {}, ["riley"]), // a question asserts nothing
      say("riley", { seat_free: true }, ["priya"]),
    ],
  }),

  build("the-surprise-party", {
    propositions: {
      party_planned: "A surprise party is planned for Alex",
      whispers_stop_near_alex: "Dana and Chris stop talking when Alex walks over",
      alex_looks_sad: "Alex looks sad",
    },
    events: [
      act({ party_planned: true }, ["dana", "chris"]),
      act({ whispers_stop_near_alex: true }, ["alex", "dana", "chris"]),
      quiet(),
      act({ alex_looks_sad: true }, ["chris"]),
      act({ party_planned: true }, ["alex", "dana", "chris"]),
    ],
  }),

  build("the-missing-jacket", {
    // Propositions are worded so each event only states what its observers could know:
    // Morgan sees "a blue jacket" (not whose it is) until the name tag in step 4.
    propositions: {
      blue_jacket_on_hook: "A blue jacket is hanging on the hook",
      morgan_took_blue_jacket: "Morgan took the blue jacket from the hook",
      jacket_is_taylors: "The jacket Morgan took belongs to Taylor",
      taylor_has_jacket: "Taylor has their jacket back",
    },
    exclusiveGroups: [["blue_jacket_on_hook", "morgan_took_blue_jacket", "taylor_has_jacket"]],
    initialWorld: ["blue_jacket_on_hook", "jacket_is_taylors"],
    initialBeliefs: { taylor: ["blue_jacket_on_hook"] },
    events: [
      act({ morgan_took_blue_jacket: true }, ["morgan"]), // Taylor is not there: her belief stays
      act({ blue_jacket_on_hook: false }, ["taylor"]),
      quiet(),
      act({ jacket_is_taylors: true }, ["morgan"]), // reads the name tag
      act({ taylor_has_jacket: true, jacket_is_taylors: true }, ["morgan", "taylor"]), // Morgan explains the mix-up
    ],
  }),

  build("the-joke-that-landed-wrong", {
    propositions: {
      joke_told: "Eli made a joke about Noor",
      kai_laughed: "Kai laughed",
      noor_felt_hurt: "Noor felt hurt by the joke",
      noor_quiet: "Noor stopped laughing and went quiet",
      eli_meant_no_harm: "Eli did not mean to hurt Noor",
    },
    initialWorld: ["eli_meant_no_harm"],
    initialBeliefs: { eli: ["eli_meant_no_harm"] },
    events: [
      act({ joke_told: true }, ["eli", "noor", "kai"]),
      act({ kai_laughed: true }, ["eli", "noor", "kai"]),
      act({ noor_felt_hurt: true }, ["noor"]),
      act({ noor_quiet: true }, ["eli", "noor", "kai"]),
      say("eli", { eli_meant_no_harm: true }, ["noor"]),
    ],
  }),

  build("the-wrong-room", {
    propositions: {
      lesson_in_library: "Monday's lesson is in the library",
      lesson_in_classroom: "Monday's lesson is in the usual classroom",
      ben_in_empty_classroom: "Ben is waiting in the empty classroom",
      ben_in_library: "Ben is in the library",
    },
    exclusiveGroups: [["lesson_in_library", "lesson_in_classroom"]],
    initialWorld: ["lesson_in_library"],
    initialBeliefs: { ben: ["lesson_in_classroom"], "ms-ortiz": ["lesson_in_library"] },
    events: [
      say("ms-ortiz", { lesson_in_library: true }, []), // Ben is packing his bag and is not a recipient
      quiet(),
      act({ ben_in_empty_classroom: true }, ["ben"]),
      act({ lesson_in_library: true }, ["ben"]),
      act({ ben_in_library: true }, ["ben", "ms-ortiz"]),
    ],
  }),

  build("the-borrowed-pen", {
    propositions: {
      pen_with_lucia: "The pen is with Lucia",
      pen_with_omar: "The pen is with Omar",
      pen_in_omars_pocket: "The pen is in Omar's pocket",
    },
    exclusiveGroups: [["pen_with_lucia", "pen_with_omar"]],
    initialWorld: ["pen_with_lucia"],
    initialBeliefs: { lucia: ["pen_with_lucia"], omar: ["pen_with_lucia"] },
    events: [
      act({ pen_with_omar: true }, ["lucia", "omar"]),
      act({ pen_in_omars_pocket: true }, []), // "without thinking": Omar does not register it
      quiet(), // Lucia remembers and wonders; nothing observable changes
      act({ pen_in_omars_pocket: true }, ["omar"]), // finds it: his first awareness of the pocket
      act({ pen_with_lucia: true, pen_in_omars_pocket: false }, ["omar", "lucia"]),
    ],
  }),

  build("the-different-weekend-plans", {
    propositions: {
      devon_wants_plans: "Devon wants to do something this weekend",
      zoe_agreed: "Zoe agreed to do something",
      devon_plans_arcade: "Devon is planning to go to the arcade",
      zoe_plans_movie_home: "Zoe is planning a movie at home",
    },
    initialWorld: ["devon_wants_plans", "zoe_agreed", "devon_plans_arcade", "zoe_plans_movie_home"],
    initialBeliefs: { devon: ["devon_plans_arcade"], zoe: ["zoe_plans_movie_home"] },
    events: [
      say("devon", { devon_wants_plans: true }, ["zoe"]),
      say("zoe", { zoe_agreed: true }, ["devon"]),
      act({ devon_plans_arcade: true }, ["devon", "zoe"]), // Devon turns up ready for the arcade
      quiet(),
      say("zoe", { zoe_plans_movie_home: true }, ["devon"]),
    ],
  }),

  build("the-group-project-handoff", {
    propositions: {
      slides_owner_unassigned: "No one has been named to make the slides",
      report_done: "The written report is finished",
      mei_likes_design: "Mei likes design",
      slides_not_started: "No one has started the slides",
    },
    events: [
      act({ slides_owner_unassigned: true }, ["harper", "isaac", "mei"]),
      act({ report_done: true }, ["harper"]),
      act({ mei_likes_design: true }, ["isaac", "mei"]),
      quiet(),
      act({ slides_not_started: true }, ["harper", "isaac", "mei"]),
    ],
  }),

  build("the-new-student-hello", {
    propositions: {
      amara_waved: "Amara waved in the hallway",
      theo_thinking_about_test: "Theo is thinking about a test",
      theo_said_hello: "Theo said hello at lunch",
    },
    events: [
      act({ amara_waved: true }, ["amara"]), // Theo does not notice
      act({ theo_thinking_about_test: true }, ["theo"]),
      quiet(),
      act({ theo_said_hello: true }, ["theo", "amara"]),
      quiet(),
    ],
  }),

  build("the-rescheduled-practice", {
    propositions: {
      practice_at_earlier_time: "Practice is at the new, earlier time",
      practice_at_old_time: "Practice is at the old time",
      email_in_nia_spam: "The schedule email is in Nia's spam folder",
      marcus_warming_up: "Marcus is warming up",
      nia_arrived_at_old_time: "Nia arrived at the old practice time",
    },
    exclusiveGroups: [["practice_at_earlier_time", "practice_at_old_time"]],
    initialWorld: ["practice_at_earlier_time"],
    initialBeliefs: {
      "coach-lee": ["practice_at_earlier_time"],
      nia: ["practice_at_old_time"],
      marcus: ["practice_at_old_time"],
    },
    events: [
      say("coach-lee", { practice_at_earlier_time: true }, ["marcus"]), // Nia's copy goes to spam
      act({ email_in_nia_spam: true }, []),
      act({ marcus_warming_up: true }, ["marcus", "coach-lee"]),
      act({ nia_arrived_at_old_time: true }, ["nia", "coach-lee", "marcus"]),
      say("coach-lee", { practice_at_earlier_time: true }, ["nia"]),
    ],
  }),

  build("the-surprise-substitute", {
    propositions: {
      sub_today: "A substitute teacher is teaching today",
      schedule_differs: "Today's schedule differs from the usual one",
      jules_looks_unsettled: "Jules looks unsettled",
      plan_posted: "The plan for today has been shared with Jules",
    },
    initialWorld: ["sub_today", "schedule_differs"],
    initialBeliefs: { "mr-patel": ["sub_today", "schedule_differs"] },
    events: [
      act({ sub_today: true }, ["jules", "mr-patel", "ren"]),
      say("mr-patel", { schedule_differs: true }, ["jules", "ren"]),
      quiet(),
      act({ jules_looks_unsettled: true }, ["ren"]),
      act({ plan_posted: true }, ["ren", "jules"]),
    ],
  }),
];

export function getBeliefStory(scenarioId: string): BeliefStory | undefined {
  return beliefStories.find((s) => s.scenarioId === scenarioId);
}
