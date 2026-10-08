import { z } from "zod";
import type { Scenario } from "@/data/scenarios";
import { PredictionPromptSchema, type PredictionPrompt } from "./prediction-schema";
import type { BeliefStory, BeliefTable } from "./schema";

/**
 * The "two lens" view of one story step, for students.
 *
 * It is a read-only projection of the belief table the engine already produces
 * (engine.ts is not touched). Nothing is computed here that the engine did not:
 *  - truths      = propositions with world value 1
 *  - believes    = propositions the actor believes (B = 1), tagged by comparing with the world
 *  - notKnown    = propositions that are true but the actor does not believe (B = 0, world = 1)
 *  - updated     = propositions the actor believed before this step and no longer does (B: 1 -> 0)
 *
 * Belief–reality difference vs. missing information (kept separate on purpose):
 *  - "differs":   B = 1 and world = 0. The actor holds a belief that is not true right now.
 *  - "notKnown":  B = 0 and world = 1. The actor has not observed or been told it. This is
 *                 missing information, never labelled a mistake.
 *
 * Spoiler safety: a view for step n only ever contains steps 1..n and only the
 * propositions that have appeared by step n (see visiblePropositionIds). Character
 * roles are left out because several of them describe later events.
 */

const Id = z.string().min(1).max(64);
const Text = z.string().min(1).max(500);

export const ViewItemSchema = z.strictObject({
  id: Id,
  text: Text,
  /** Newly shown or changed at this step. */
  isNew: z.boolean(),
});

export const BelievedItemSchema = ViewItemSchema.extend({
  status: z.enum(["matches", "differs"]),
});

/**
 * How a character took part in the current step. Observation, being told and overhearing
 * come from the engine's access types; "spoke" is read from the event's recorded speaker.
 */
export const ParticipationSchema = z.enum(["spoke", "observed", "told", "overheard", "none"]);

export const CharacterViewSchema = z.strictObject({
  id: Id,
  name: Text,
  participation: ParticipationSchema,
  believes: z.array(BelievedItemSchema),
  /** True facts this character has not observed or been told. Missing information, not a mistake. */
  notKnown: z.array(ViewItemSchema),
  /** Beliefs this character held before this step and no longer holds. */
  updated: z.array(ViewItemSchema),
});

export const StepViewSchema = z.strictObject({
  scenarioId: Id,
  title: Text,
  stepNumber: z.number().int().min(1),
  totalSteps: z.number().int().min(1),
  currentStep: z.strictObject({ number: z.number().int().min(1), text: Text }),
  earlierSteps: z.array(z.strictObject({ number: z.number().int().min(1), text: Text })),
  truths: z.array(ViewItemSchema),
  characters: z.array(CharacterViewSchema),
  /**
   * The question to ask when the student presses Next Step from this step, or null.
   * Prompt and neutral choices only: never the answer, explanation, or what happens next.
   */
  prediction: PredictionPromptSchema.nullable(),
});

export type StepView = z.infer<typeof StepViewSchema>;

/**
 * Propositions a student may see at step n (1-based):
 *  1. any proposition an event up to step n states or changes,
 *  2. any proposition the story marks with revealAt <= n (the story text states it that early), and
 *  3. the other side of an exclusive pair with such a proposition, but only if it was
 *     true or believed by someone at some point up to step n (e.g. "the jacket is on
 *     the hook" once someone takes it). Peers nobody has held yet stay hidden, so
 *     they cannot give away what happens later.
 */
export function visiblePropositionIds(
  story: BeliefStory,
  table: BeliefTable,
  n: number,
): Set<string> {
  const touched = new Set<string>();
  for (const event of story.events.slice(0, n)) {
    const updates = event.type === "action" ? event.effects : event.assertions;
    for (const u of updates) touched.add(u.proposition);
  }

  const visible = new Set(touched);
  for (const [p, step] of Object.entries(story.revealAt)) if (step <= n) visible.add(p);
  for (const group of story.exclusiveGroups) {
    if (!group.some((p) => touched.has(p))) continue;
    for (const p of group) {
      if (visible.has(p)) continue;
      const heldBefore = table.steps
        .slice(0, n + 1)
        .some((s) => s.world[p] === 1 || s.actors.some((a) => a.beliefs[p] === 1));
      if (heldBefore) visible.add(p);
    }
  }
  return visible;
}

export function buildStepView(
  story: BeliefStory,
  table: BeliefTable,
  scenario: Scenario,
  n: number,
  prediction: PredictionPrompt | null = null,
): StepView {
  const total = story.events.length;
  if (!Number.isInteger(n) || n < 1 || n > total) {
    throw new RangeError(`step must be between 1 and ${total}`);
  }

  const step = table.steps[n]; // table.steps[0] is the starting state
  const previous = table.steps[n - 1];
  const visibleNow = visiblePropositionIds(story, table, n);
  const visibleBefore = n > 1 ? visiblePropositionIds(story, table, n - 1) : new Set<string>();
  const text = (id: string) => story.propositions.find((p) => p.id === id)!.text;
  const ordered = story.propositions.map((p) => p.id).filter((id) => visibleNow.has(id));

  const worldChanged = (id: string) => step.world[id] !== previous.world[id];
  const event = story.events[n - 1];

  const truths = ordered
    .filter((id) => step.world[id] === 1)
    .map((id) => ({
      id,
      text: text(id),
      isNew: !visibleBefore.has(id) || worldChanged(id),
    }));

  const characters = story.actors.map((actor) => {
    const now = step.actors.find((a) => a.actorId === actor.id)!;
    const before = previous.actors.find((a) => a.actorId === actor.id)!;
    return {
      id: actor.id,
      name: actor.name,
      participation:
        event.type === "communication" && event.speaker === actor.id
          ? ("spoke" as const)
          : now.access,
      believes: ordered
        .filter((id) => now.beliefs[id] === 1)
        .map((id) => ({
          id,
          text: text(id),
          isNew: !visibleBefore.has(id) || before.beliefs[id] !== now.beliefs[id],
          status: step.world[id] === 1 ? ("matches" as const) : ("differs" as const),
        })),
      notKnown: ordered
        .filter((id) => now.beliefs[id] === 0 && step.world[id] === 1)
        .map((id) => ({
          id,
          text: text(id),
          isNew: !visibleBefore.has(id) || before.beliefs[id] !== now.beliefs[id] || worldChanged(id),
        })),
      updated: ordered
        .filter((id) => before.beliefs[id] === 1 && now.beliefs[id] === 0)
        .map((id) => ({ id, text: text(id), isNew: true })),
    };
  });

  return StepViewSchema.parse({
    scenarioId: story.scenarioId,
    title: scenario.title,
    stepNumber: n,
    totalSteps: total,
    currentStep: { number: n, text: scenario.steps[n - 1].text },
    earlierSteps: scenario.steps.slice(0, n - 1).map((s, i) => ({ number: i + 1, text: s.text })),
    truths,
    characters,
    prediction,
  });
}
