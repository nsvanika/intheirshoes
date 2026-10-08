import type { Scenario } from "@/data/scenarios";
import {
  getPredictionQuestion,
  type PredictionChoice,
  type PredictionQuestion,
} from "@/data/predictions";
import type { BeliefStory, BeliefTable } from "./schema";
import {
  PredictionPromptSchema,
  PredictionRevealSchema,
  type ChoiceId,
  type PredictionPrompt,
  type PredictionReveal,
} from "./prediction-schema";

/**
 * Server-side logic for "Predict, Then Reveal". Like view.ts, this only READS the belief
 * table produced by the existing engine; engine.ts and its research-based rules are untouched.
 */

const PARTICIPATION_PHRASE = {
  spoke: "said it",
  observed: "saw it happen",
  told: "was told",
  overheard: "overheard it",
  none: "did not see or hear it",
} as const;

/** What the student sees before answering. Contains no answer, explanation or later event. */
export function buildPrompt(
  question: PredictionQuestion,
  story: BeliefStory,
): PredictionPrompt {
  const actor = story.actors.find((a) => a.id === question.characterId)!;
  return PredictionPromptSchema.parse({
    id: question.id,
    kind: question.kind,
    characterName: actor.name,
    prompt: question.prompt,
    choices: question.choices.map((c) => ({ id: c.id, text: c.text })),
  });
}

/** The prompt for the question asked after `afterStep`, if there is one. */
export function promptAfterStep(
  scenarioId: string,
  afterStep: number,
  story: BeliefStory,
): PredictionPrompt | null {
  const question = getPredictionQuestion(scenarioId, afterStep);
  return question ? buildPrompt(question, story) : null;
}

/** Does the character's belief state at `afterStep` satisfy everything this choice relies on? */
export function choiceFitsBeliefs(
  question: PredictionQuestion,
  choice: PredictionChoice,
  table: BeliefTable,
): boolean | null {
  if (choice.reliesOn === null) return null; // no basis in the character's information
  const row = table.steps[question.afterStep].actors.find((a) => a.actorId === question.characterId)!;
  return choice.reliesOn.every((r) => row.beliefs[r.proposition] === (r.actorBelieves ? 1 : 0));
}

function participationAt(story: BeliefStory, table: BeliefTable, step: number, actorId: string) {
  const event = story.events[step - 1];
  if (event.type === "communication" && event.speaker === actorId) return "spoke" as const;
  return table.steps[step].actors.find((a) => a.actorId === actorId)!.access;
}

/** Plain-language facts from the engine about what a character believes and how they came to know it. */
export function evidenceLines(
  question: PredictionQuestion,
  story: BeliefStory,
  table: BeliefTable,
  scenario: Scenario,
): string[] {
  const n = question.afterStep;
  const lines: string[] = [];

  for (const ref of question.evidence) {
    const actor = story.actors.find((a) => a.id === ref.actorId)!;
    const text = story.propositions.find((p) => p.id === ref.proposition)!.text;
    const row = table.steps[n].actors.find((a) => a.actorId === ref.actorId)!;
    const belief = row.beliefs[ref.proposition];
    const world = table.steps[n].world[ref.proposition];

    if (belief === 1) {
      lines.push(
        world === 1
          ? `${actor.name} believes: "${text}" (and this is true).`
          : `${actor.name} believes: "${text}", but this is not true right now.`,
      );
    } else {
      lines.push(
        world === 1
          ? `${actor.name} has not seen or been told: "${text}".`
          : `${actor.name} does not currently hold this belief: "${text}".`,
      );
    }

    // How did the character come to have, or not have, this information?
    const cause = ref.cause ?? ref.proposition;
    const touching: number[] = [];
    story.events.slice(0, n).forEach((e, i) => {
      const updates = e.type === "action" ? e.effects : e.assertions;
      if (updates.some((u) => u.proposition === cause)) touching.push(i + 1);
    });

    if (touching.length === 0) {
      lines.push(
        belief === 1
          ? `This was already part of what ${actor.name} believed when the story began.`
          : `Nothing in the story so far has told ${actor.name} this.`,
      );
      continue;
    }
    const withAccess = touching.filter((k) => participationAt(story, table, k, ref.actorId) !== "none");
    const k = withAccess.length > 0 ? withAccess[withAccess.length - 1] : touching[0];
    const how = PARTICIPATION_PHRASE[participationAt(story, table, k, ref.actorId)];
    lines.push(`In step ${k} ("${scenario.steps[k - 1].text}"), ${actor.name} ${how}.`);
  }
  return lines;
}

/** Built only after the student has submitted a choice. */
export function buildReveal(
  question: PredictionQuestion,
  story: BeliefStory,
  table: BeliefTable,
  scenario: Scenario,
  chosen: ChoiceId,
): PredictionReveal {
  const next = question.afterStep + 1;
  return PredictionRevealSchema.parse({
    questionId: question.id,
    kind: question.kind,
    chosenChoiceId: chosen,
    bestChoiceId: question.best,
    matchedBest: question.best === null ? null : chosen === question.best,
    explanation: question.explanation,
    notes: question.choices.map((c) => ({ choiceId: c.id, text: c.note })),
    evidence: evidenceLines(question, story, table, scenario).map((text) => ({ text })),
    nextStep: { number: next, text: scenario.steps[next - 1].text },
  });
}
