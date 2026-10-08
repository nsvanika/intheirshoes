import { z } from "zod";

/**
 * Schemas for the belief-state engine.
 *
 * Source: Doddavarapu & Tomar, "Beyond Final Answers: Explicit Belief-State
 * Tracking in Compact Instruction-Tuned Language Models" (docs/ folder).
 *   - Eq. (1): B_{i,t}(p) is 1 if actor i believes p at time t, otherwise 0.
 *   - Sec. III-A: a story has actors, objects/locations (here: propositions),
 *     time-stamped events, observation/communication access (observers,
 *     recipients, overhearers), and mutually exclusive proposition groups.
 *   - Gold rows keep the world-state value and the information-access type,
 *     so belief-reality divergence can be read off directly.
 * Anything the paper does not specify is NOT modelled here (see engine.ts).
 */

const Id = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, "ids are lowercase letters, digits, _ or -")
  .max(64);

const Text = z.string().min(1).max(500);

const Effect = z.strictObject({ proposition: Id, value: z.boolean() });

const EventBase = {
  id: Id,
  /** Time step. Strictly increasing across events, starting at 1 or later. */
  t: z.number().int().min(1).max(1000),
  description: Text,
};

/** A world event that the listed observers directly see. */
export const ActionEventSchema = z.strictObject({
  type: z.literal("action"),
  ...EventBase,
  /** Changes to the true world state. May be empty (no world change). */
  effects: z.array(Effect).max(20),
  observers: z.array(Id).max(10),
});

/** A message. Only the named recipients and recorded overhearers receive it. */
export const CommunicationEventSchema = z.strictObject({
  type: z.literal("communication"),
  ...EventBase,
  /** Informational only; the paper gives no rule that changes the speaker's belief. */
  speaker: Id.optional(),
  /** What the message states. May be empty (e.g. a question). */
  assertions: z.array(Effect).max(20),
  recipients: z.array(Id).max(10),
  overhearers: z.array(Id).max(10).default([]),
});

export const StoryEventSchema = z.discriminatedUnion("type", [
  ActionEventSchema,
  CommunicationEventSchema,
]);

export const BeliefStorySchema = z
  .strictObject({
    scenarioId: Id,
    actors: z.array(z.strictObject({ id: Id, name: Text })).min(1).max(10),
    propositions: z.array(z.strictObject({ id: Id, text: Text })).min(1).max(50),
    /** Groups of mutually exclusive propositions (paper, Sec. III-A). */
    exclusiveGroups: z.array(z.array(Id).min(2)).max(20).default([]),
    /** Propositions true in the world before the first event. Others are false. */
    initialWorld: z.array(Id).max(50).default([]),
    /** Propositions each actor believes before the first event. Others are 0 (Eq. 1). */
    initialBeliefs: z.record(Id, z.array(Id).max(50)).default({}),
    /**
     * Display only; the engine ignores it. Maps a proposition to the step from which a student
     * view may show it, for facts the story text states before any event changes them (e.g. a
     * private plan mentioned in step 1). Must not be later than the first event that touches it.
     */
    revealAt: z.record(Id, z.number().int().min(1).max(1000)).default({}),
    events: z.array(StoryEventSchema).min(1).max(20),
  })
  .superRefine((story, ctx) => {
    const fail = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });

    const actorIds = new Set<string>();
    story.actors.forEach((a, i) => {
      if (actorIds.has(a.id)) fail(`duplicate actor id "${a.id}"`, ["actors", i]);
      actorIds.add(a.id);
    });

    const propIds = new Set<string>();
    story.propositions.forEach((p, i) => {
      if (propIds.has(p.id)) fail(`duplicate proposition id "${p.id}"`, ["propositions", i]);
      propIds.add(p.id);
    });

    const needActor = (id: string, path: (string | number)[]) => {
      if (!actorIds.has(id)) fail(`unknown actor "${id}"`, path);
    };
    const needProp = (id: string, path: (string | number)[]) => {
      if (!propIds.has(id)) fail(`unknown proposition "${id}"`, path);
    };

    story.exclusiveGroups.forEach((g, gi) => {
      g.forEach((p, i) => needProp(p, ["exclusiveGroups", gi, i]));
    });

    // At most one proposition per exclusive group may be true / believed at once.
    const checkExclusive = (props: string[], label: string, path: (string | number)[]) => {
      for (const g of story.exclusiveGroups) {
        const active = g.filter((p) => props.includes(p));
        if (active.length > 1) {
          fail(`${label} endorses mutually exclusive propositions: ${active.join(", ")}`, path);
        }
      }
    };

    story.initialWorld.forEach((p, i) => needProp(p, ["initialWorld", i]));
    checkExclusive(story.initialWorld, "initialWorld", ["initialWorld"]);

    for (const [actor, props] of Object.entries(story.initialBeliefs)) {
      needActor(actor, ["initialBeliefs", actor]);
      props.forEach((p, i) => needProp(p, ["initialBeliefs", actor, i]));
      checkExclusive(props, `initialBeliefs.${actor}`, ["initialBeliefs", actor]);
    }

    const firstTouch = new Map<string, number>();
    story.events.forEach((e, i) => {
      for (const x of e.type === "action" ? e.effects : e.assertions) {
        if (!firstTouch.has(x.proposition)) firstTouch.set(x.proposition, i + 1);
      }
    });
    for (const [p, step] of Object.entries(story.revealAt)) {
      needProp(p, ["revealAt", p]);
      if (step > story.events.length) fail(`revealAt step ${step} is past the last event`, ["revealAt", p]);
      const touched = firstTouch.get(p);
      if (touched !== undefined && step > touched) {
        fail(`revealAt step ${step} is later than the first event that touches "${p}" (step ${touched})`, ["revealAt", p]);
      }
    }

    const eventIds = new Set<string>();
    let lastT = 0;
    story.events.forEach((e, i) => {
      const at = (...rest: (string | number)[]) => ["events", i, ...rest];
      if (eventIds.has(e.id)) fail(`duplicate event id "${e.id}"`, at("id"));
      eventIds.add(e.id);
      if (e.t <= lastT) fail("event times must be strictly increasing", at("t"));
      lastT = e.t;

      if (e.type === "action") {
        e.effects.forEach((x, j) => needProp(x.proposition, at("effects", j, "proposition")));
        e.observers.forEach((a, j) => needActor(a, at("observers", j)));
      } else {
        if (e.speaker) needActor(e.speaker, at("speaker"));
        e.assertions.forEach((x, j) => needProp(x.proposition, at("assertions", j, "proposition")));
        e.recipients.forEach((a, j) => needActor(a, at("recipients", j)));
        e.overhearers.forEach((a, j) => needActor(a, at("overhearers", j)));
      }
    });
  });

export type BeliefStory = z.infer<typeof BeliefStorySchema>;
export type StoryEvent = z.infer<typeof StoryEventSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Binary belief / world value, as in Eq. (1). */
const Bit = z.union([z.literal(0), z.literal(1)]);
const BitMap = z.record(Id, Bit);

/** How an actor had access to the event at this step (paper: information-access type). */
export const AccessSchema = z.enum(["observed", "told", "overheard", "none"]);

export const ActorStepSchema = z.strictObject({
  actorId: Id,
  access: AccessSchema,
  /** B_{i,t}(p) for every proposition p (Eq. 1). */
  beliefs: BitMap,
  /** Propositions whose belief value changed at this step. */
  changedBeliefs: z.array(Id),
  /** Ids of every event this actor has had access to so far. */
  accessedEventIds: z.array(Id),
});

export const DivergenceSchema = z.strictObject({
  actorId: Id,
  proposition: Id,
  belief: Bit,
  world: Bit,
});

export const NoteSchema = z.strictObject({
  code: z.literal("message_overrides_prior_belief"),
  actorId: Id,
  proposition: Id,
  message: z.string().max(300),
});

export const StepStateSchema = z.strictObject({
  t: z.number().int().min(0),
  eventId: Id.nullable(),
  eventType: z.enum(["initial", "action", "communication"]),
  description: Text,
  /** True world state after this step. */
  world: BitMap,
  actors: z.array(ActorStepSchema),
  /** Rows where an actor's belief differs from the world state. */
  divergences: z.array(DivergenceSchema),
  notes: z.array(NoteSchema),
});

export const MismatchSchema = z.strictObject({
  t: z.number().int().min(0),
  actorId: Id.optional(),
  proposition: Id.optional(),
  field: z.enum(["world", "belief", "access", "structure"]),
  claude: z.union([z.number(), z.string(), z.null()]),
  engine: z.union([z.number(), z.string(), z.null()]),
});

export const BeliefTableSchema = z.strictObject({
  scenarioId: Id,
  mode: z.enum(["mock", "api"]),
  /** "symbolic-engine" = deterministic rules; "claude" = model output checked against them. */
  source: z.enum(["symbolic-engine", "claude"]),
  actors: z.array(z.strictObject({ id: Id, name: Text })),
  propositions: z.array(z.strictObject({ id: Id, text: Text })),
  steps: z.array(StepStateSchema).min(2),
  /** Present when source is "claude": comparison with the deterministic engine. */
  verification: z
    .strictObject({
      agreesWithEngine: z.boolean(),
      mismatches: z.array(MismatchSchema).max(200),
    })
    .optional(),
});

export type BeliefTable = z.infer<typeof BeliefTableSchema>;
export type StepState = z.infer<typeof StepStateSchema>;
export type Access = z.infer<typeof AccessSchema>;
