import {
  BeliefStorySchema,
  type Access,
  type BeliefStory,
  type BeliefTable,
  type StepState,
} from "./schema";

/**
 * Deterministic belief-state tracker.
 *
 * This is a small re-implementation of the paper's "symbolic oracle": an
 * engine that executes the annotation rules in Sec. III-A. It implements
 * ONLY the rules the paper states:
 *
 *  R1  A directly observed event can update the observer's belief.
 *  R2  An actor with no access to an event keeps their prior belief,
 *      unless another recorded communication changes it.
 *  R3  Mutually exclusive propositions cannot both be endorsed for the same
 *      object (applied to both the world and every actor's beliefs).
 *  R4  A communication updates only its named recipients and recorded
 *      overhearers.
 *  Eq.1  Beliefs are binary: 1 if the actor believes p, otherwise 0.
 *  Div.  Belief-reality divergence = belief value differs from world value.
 *
 * Decisions made with the author (not stated in the paper):
 *  - Initial beliefs are declared per story; anything undeclared is 0.
 *  - A message's assertions are adopted as belief by recipients/overhearers;
 *    a later observation or message replaces them (newest wins). No trust or
 *    conflicting-testimony reasoning. When a message changes a belief the
 *    actor already held, a neutral note is attached instead of resolving it.
 *  - Second-order beliefs, feelings and emotions are not modelled.
 *
 * Deliberately NOT inferred: speakers' own beliefs, "forgetting", or any
 * belief from an actor's thoughts. Only access (observed/told/overheard)
 * moves a belief.
 */

type Bits = Record<string, 0 | 1>;

function setProposition(
  state: Bits,
  groups: string[][],
  proposition: string,
  value: boolean,
): void {
  state[proposition] = value ? 1 : 0;
  if (value) {
    // R3: endorsing p clears every proposition exclusive with p.
    for (const group of groups) {
      if (!group.includes(proposition)) continue;
      for (const other of group) if (other !== proposition) state[other] = 0;
    }
  }
}

function divergencesOf(
  world: Bits,
  actorBeliefs: { actorId: string; beliefs: Bits }[],
  propositionIds: string[],
) {
  const out: StepState["divergences"] = [];
  for (const { actorId, beliefs } of actorBeliefs) {
    for (const proposition of propositionIds) {
      if (beliefs[proposition] !== world[proposition]) {
        out.push({
          actorId,
          proposition,
          belief: beliefs[proposition],
          world: world[proposition],
        });
      }
    }
  }
  return out;
}

export function trackBeliefs(input: unknown): BeliefTable {
  const story: BeliefStory = BeliefStorySchema.parse(input);
  const propositionIds = story.propositions.map((p) => p.id);
  const groups = story.exclusiveGroups;

  const world: Bits = Object.fromEntries(propositionIds.map((p) => [p, 0 as const]));
  for (const p of story.initialWorld) world[p] = 1;

  const beliefs: Record<string, Bits> = {};
  /** Propositions an actor already holds a belief about through some earlier event. */
  const established: Record<string, Set<string>> = {};
  const accessed: Record<string, string[]> = {};
  for (const actor of story.actors) {
    beliefs[actor.id] = Object.fromEntries(propositionIds.map((p) => [p, 0 as const]));
    established[actor.id] = new Set();
    accessed[actor.id] = [];
    for (const p of story.initialBeliefs[actor.id] ?? []) {
      beliefs[actor.id][p] = 1;
      established[actor.id].add(p);
    }
  }

  const snapshot = (
    t: number,
    eventId: string | null,
    eventType: StepState["eventType"],
    description: string,
    access: Record<string, Access>,
    changed: Record<string, string[]>,
    notes: StepState["notes"],
  ): StepState => {
    const actors = story.actors.map((a) => ({
      actorId: a.id,
      access: access[a.id] ?? "none",
      beliefs: { ...beliefs[a.id] },
      changedBeliefs: changed[a.id] ?? [],
      accessedEventIds: [...accessed[a.id]],
    }));
    return {
      t,
      eventId,
      eventType,
      description,
      world: { ...world },
      actors,
      divergences: divergencesOf(
        world,
        actors.map((a) => ({ actorId: a.actorId, beliefs: a.beliefs })),
        propositionIds,
      ),
      notes,
    };
  };

  const steps: StepState[] = [
    snapshot(0, null, "initial", "Starting state before the first event.", {}, {}, []),
  ];

  for (const event of story.events) {
    const access: Record<string, Access> = {};
    const updates: { proposition: string; value: boolean }[] =
      event.type === "action" ? event.effects : event.assertions;

    if (event.type === "action") {
      // The world changes whether or not anyone sees it.
      for (const u of updates) setProposition(world, groups, u.proposition, u.value);
      for (const a of event.observers) access[a] = "observed"; // R1
    } else {
      for (const a of event.overhearers) access[a] = "overheard"; // R4
      for (const a of event.recipients) access[a] = "told"; // R4 (told wins over overheard)
    }

    const changed: Record<string, string[]> = {};
    const notes: StepState["notes"] = [];

    for (const actor of story.actors) {
      const mode = access[actor.id];
      if (!mode) continue; // R2: no access, belief preserved.

      accessed[actor.id].push(event.id);
      const before = { ...beliefs[actor.id] };
      for (const u of updates) setProposition(beliefs[actor.id], groups, u.proposition, u.value);

      changed[actor.id] = propositionIds.filter((p) => before[p] !== beliefs[actor.id][p]);

      if (event.type === "communication") {
        for (const p of changed[actor.id]) {
          if (established[actor.id].has(p)) {
            notes.push({
              code: "message_overrides_prior_belief",
              actorId: actor.id,
              proposition: p,
              message: `A message changed a belief ${actor.id} already held about "${p}". The newest information was adopted; no judgment about which source is right is made.`,
            });
          }
        }
      }
      for (const u of updates) established[actor.id].add(u.proposition);
    }

    steps.push(
      snapshot(event.t, event.id, event.type, event.description, access, changed, notes),
    );
  }

  return {
    scenarioId: story.scenarioId,
    mode: "mock",
    source: "symbolic-engine",
    actors: story.actors,
    propositions: story.propositions,
    steps,
  };
}
