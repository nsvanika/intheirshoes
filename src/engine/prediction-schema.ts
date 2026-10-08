import { z } from "zod";

/**
 * Shapes exchanged with the browser for "Predict, Then Reveal".
 *
 * Two deliberately separate payloads, so nothing about the answer travels early:
 *  - PredictionPrompt: what the student sees BEFORE answering. Question text and three
 *    neutral choices only. No best answer, no explanation, no evidence, no next event.
 *  - PredictionReveal: returned only after the student submits a choice.
 *
 * This file contains no question data; the answers live in src/data/predictions.ts and are
 * only ever imported by server code.
 */

export const ChoiceIdSchema = z.enum(["a", "b", "c"]);
export type ChoiceId = z.infer<typeof ChoiceIdSchema>;

const Text = z.string().min(1).max(600);

const PromptChoiceSchema = z.strictObject({ id: ChoiceIdSchema, text: z.string().min(1).max(200) });

export const PredictionPromptSchema = z.strictObject({
  id: z.string().min(1).max(64),
  /** "interpretation" questions are about feelings and have no single right answer. */
  kind: z.enum(["belief", "interpretation"]),
  characterName: z.string().min(1).max(100),
  prompt: Text,
  /** Exactly three choices. */
  choices: z.tuple([PromptChoiceSchema, PromptChoiceSchema, PromptChoiceSchema]),
});
export type PredictionPrompt = z.infer<typeof PredictionPromptSchema>;

const NoteSchema = z.strictObject({ choiceId: ChoiceIdSchema, text: Text });

export const PredictionRevealSchema = z.strictObject({
  questionId: z.string().min(1).max(64),
  kind: z.enum(["belief", "interpretation"]),
  chosenChoiceId: ChoiceIdSchema,
  /** null for interpretation questions: there is no single best answer. */
  bestChoiceId: ChoiceIdSchema.nullable(),
  /** null for interpretation questions. */
  matchedBest: z.boolean().nullable(),
  explanation: Text,
  /** A short, kind note about every choice. */
  notes: z.tuple([NoteSchema, NoteSchema, NoteSchema]),
  /** Facts from the belief engine: what the character believes and how they came to know it. */
  evidence: z.array(z.strictObject({ text: Text })).max(8),
  /** The story step that follows; revealed only now. */
  nextStep: z.strictObject({ number: z.number().int().min(1), text: Text }),
});
export type PredictionReveal = z.infer<typeof PredictionRevealSchema>;
