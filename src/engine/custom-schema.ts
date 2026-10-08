import { z } from "zod";
import { StepViewSchema } from "./view";

/**
 * Shapes for "Make Your Own".
 *
 *  - ExtractionSchema: what a parser (an AI model, or the built-in demo examples) must hand
 *    back after reading the user's description. It is deliberately close to the existing
 *    structured story format, and every claim carries the user's own words as a `quote` so the
 *    server can check it was not invented. It never contains feelings, intentions or anything
 *    the user did not write.
 *  - CustomRequestSchema / CustomResponseSchema: the browser <-> server contract.
 *
 * This file holds no secrets and no engine logic; the browser imports the response types.
 */

export const MAX_TEXT_CHARS = 1500;
export const MAX_ANSWER_CHARS = 200;

const Slug = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, "ids are lowercase letters, digits, _ or -");
const Quote = z.string().min(3).max(300);

const Change = z.strictObject({ proposition: Slug, value: z.boolean() });

export const ExtractionStepSchema = z.strictObject({
  /** One sentence that uses only facts from the description. */
  text: z.string().min(1).max(220),
  /** The user's exact words this step comes from. */
  quote: Quote,
  type: z.enum(["action", "communication"]),
  speaker: Slug.optional(),
  /** World changes (action) or what is said (communication). May be empty. */
  changes: z.array(Change).max(6).default([]),
  observers: z.array(Slug).max(3).default([]),
  recipients: z.array(Slug).max(3).default([]),
  overhearers: z.array(Slug).max(3).default([]),
  /** The user's exact words showing who saw or heard this step, or that nobody did. */
  accessQuotes: z.array(Quote).max(3).default([]),
  /** True when the description does not say who saw or heard this step. */
  accessUnclear: z.boolean().default(false),
});

export const ExtractionSchema = z.strictObject({
  status: z.enum(["ok", "needs_clarification", "cannot_process"]),
  /** For cannot_process: a short, kind explanation of what is missing. */
  message: z.string().max(300).optional(),
  /** For needs_clarification: ONE simple question with 2-4 short options. */
  clarification: z
    .strictObject({
      question: z.string().min(1).max(200),
      options: z.array(z.string().min(1).max(80)).min(2).max(4),
    })
    .nullable()
    .default(null),
  characters: z.array(z.strictObject({ id: Slug, name: z.string().min(1).max(40) })).max(3).default([]),
  propositions: z
    .array(z.strictObject({ id: Slug, text: z.string().min(1).max(160), quote: Quote }))
    .max(12)
    .default([]),
  exclusiveGroups: z.array(z.array(Slug).min(2).max(4)).max(4).default([]),
  /** Facts that are true before the first step, each with the user's words that say so. */
  initialWorld: z.array(z.strictObject({ proposition: Slug, quote: Quote })).max(12).default([]),
  /** Beliefs the user explicitly stated ("Luz thinks ..."), with their words. */
  initialBeliefs: z
    .array(z.strictObject({ actorId: Slug, proposition: Slug, quote: Quote }))
    .max(8)
    .default([]),
  steps: z.array(ExtractionStepSchema).max(6).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractionStep = z.infer<typeof ExtractionStepSchema>;

// ---------------------------------------------------------------------------
// Browser <-> server
// ---------------------------------------------------------------------------

export const CustomRequestSchema = z.strictObject({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  /** Demo mode only: which example the text is, so the server can confirm it matches. */
  exampleId: z.string().max(40).optional(),
  /** Answers to earlier clarification questions (at most two rounds). */
  clarifications: z
    .array(
      z.strictObject({
        question: z.string().min(1).max(MAX_ANSWER_CHARS),
        answer: z.string().min(1).max(MAX_ANSWER_CHARS),
      }),
    )
    .max(2)
    .default([]),
});
export type CustomRequest = z.infer<typeof CustomRequestSchema>;

export const ReviewSchema = z.strictObject({
  characters: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  steps: z.array(
    z.strictObject({
      number: z.number().int().min(1),
      text: z.string(),
      /** The user's own words this step came from. */
      youWrote: z.string(),
      /** Who saw or heard it, as the engine will treat it. */
      whoSawOrHeard: z.string(),
      /** The user's own words about who saw or heard it. */
      yourWordsAboutIt: z.array(z.string()),
    }),
  ),
  /** Things the app deliberately did not do. */
  notAssumed: z.array(z.string()),
});

export const CustomResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    review: ReviewSchema,
    /** Every step view, already built by the existing engine. No predictions are attached. */
    views: z.array(StepViewSchema).min(4).max(6),
  }),
  z.strictObject({
    status: z.literal("needs_clarification"),
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
  }),
  z.strictObject({ status: z.literal("demo_unsupported"), message: z.string() }),
  z.strictObject({ status: z.literal("cannot_process"), message: z.string() }),
  z.strictObject({ status: z.literal("private_info_warning"), message: z.string() }),
]);
export type CustomResponse = z.infer<typeof CustomResponseSchema>;

export const CustomConfigSchema = z.strictObject({
  mode: z.enum(["demo", "ai"]),
  maxChars: z.number().int(),
  /** Set when AI mode was requested but cannot run (for example no key is configured). */
  note: z.string().nullable(),
  examples: z.array(z.strictObject({ id: z.string(), title: z.string(), text: z.string() })),
});
export type CustomConfig = z.infer<typeof CustomConfigSchema>;
