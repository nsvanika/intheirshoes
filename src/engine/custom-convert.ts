import { trackBeliefs } from "./engine";
import { BeliefStorySchema, type BeliefStory } from "./schema";
import {
  ExtractionSchema,
  type CustomResponse,
  type Extraction,
  type ExtractionStep,
} from "./custom-schema";
import { buildStepView, type StoryText } from "./view";

/**
 * Turns a parser's structured reading of the user's description into a validated story for the
 * EXISTING belief engine. engine.ts and its research-based rules are not touched.
 *
 * The parser (an AI model, or the built-in demo examples) cannot make anything up, because
 * every claim must be backed by the user's own words and the server checks that:
 *  - every quote really appears in what the user wrote (or in their answers to our questions),
 *  - every character name appears in the user's text,
 *  - a step may use a mental-state word ("thinks", "feels", "wants"...) only if the user's own
 *    quoted words use it, so feelings and private thoughts cannot be invented,
 *  - steps are single sentences, and there are 2-3 characters and 4-6 steps,
 *  - anything that does not say who saw or heard a step becomes a clarification question,
 *  - the result passes the same BeliefStorySchema the 12 built-in stories use.
 * Nothing here can prove the parser READ the text correctly. That is why the user is shown what
 * was understood, next to their own words, before the story is used.
 */

export type InvalidCode =
  | "characters"
  | "steps"
  | "clarification"
  | "ungrounded"
  | "invented_name"
  | "mental_words"
  | "sentence"
  | "story_schema";

export type Conversion =
  | { kind: "ready"; story: BeliefStory; scenarioText: StoryText; response: Extract<CustomResponse, { status: "ready" }> }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "cannot"; message: string }
  | { kind: "invalid"; code: InvalidCode };

export const NOT_ASSUMED = [
  "We did not assume anyone's feelings, intentions, or private thoughts.",
  "Someone only holds a belief here if you said so, or if they saw it or were told it in a step.",
  "If something isn't in your description, it isn't in the story.",
  "What a person says is shown as something they said, not as proof of what they believe.",
];

const DEFAULT_CANNOT =
  "There isn't quite enough here to build a story without guessing. Try describing four to six things that happen, and say who is there to see or hear each one.";

// ---------------------------------------------------------------------------
// Grounding helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Is `quote` really in `source`? Case, spacing and curly quotes are ignored; nothing else is. */
export function isQuoted(source: string, quote: string): boolean {
  const q = normalize(quote).replace(/[.!?,;:]+$/, "");
  return q.length >= 3 && normalize(source).includes(q);
}

const MENTAL_WORDS =
  /\b(think|thinks|thought|believe|believes|believed|feel|feels|felt|want|wants|wanted|hope|hopes|hoped|wonder|wonders|wondered|worry|worries|worried|nervous|sad|angry|mad|upset|happy|excited|embarrassed|jealous|expect|expects|expected|assume|assumes|assumed|suppose|supposes|supposed|guess|guesses|realize|realizes|realized|decide|decides|decided|meant|intend|intends|know|knows|knew|aware|afraid|scared|proud|annoyed|confused|surprised)\b/gi;

/** Mental-state words in `text` that the user's own quoted words do not use. */
export function unsupportedMentalWords(text: string, allowedFrom: string[]): string[] {
  const allowed = normalize(allowedFrom.join(" "));
  const used = new Set((text.match(MENTAL_WORDS) ?? []).map((w) => w.toLowerCase()));
  return [...used].filter((w) => !new RegExp(`\\b${w}\\b`).test(allowed));
}

function sentenceCount(text: string): number {
  const cleaned = text.replace(/\b(Mr|Mrs|Ms|Dr)\./g, "$1");
  return (cleaned.match(/[.!?]+["')\]]*(\s|$)/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Privacy: keep obvious private details from being processed or sent anywhere
// ---------------------------------------------------------------------------

/**
 * A gentle check for things that look like private details. It is a safety net, not a
 * guarantee (it cannot recognise a real name), so the form also asks people to use made-up ones.
 */
export function findPrivateInfo(text: string): string | null {
  const found: string[] = [];
  if (/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(text)) found.push("an email address");
  if (/https?:\/\/|www\./i.test(text)) found.push("a web address");
  const digitRuns = text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [];
  if (digitRuns.some((run) => run.replace(/\D/g, "").length >= 7)) found.push("a phone number");
  if (
    /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,2}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct)\b/i.test(
      text,
    )
  ) {
    found.push("a street address");
  }
  if (
    /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:Elementary|Middle|High|Academy|Prep|University|College)(?:\sSchool)?\b/.test(
      text,
    )
  ) {
    found.push("a school name");
  }
  if (found.length === 0) return null;
  return `This might include ${found.join(", ")}. Please replace it with something made up, so no private details are used or sent anywhere.`;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function listNames(ids: string[], names: Map<string, string>): string {
  return ids.map((id) => names.get(id) ?? id).join(", ");
}

function whoSawOrHeard(step: ExtractionStep, names: Map<string, string>): string {
  if (step.type === "action") {
    return step.observers.length > 0
      ? `Saw it happen: ${listNames(step.observers, names)}`
      : "Nobody in the story saw it happen";
  }
  const parts: string[] = [];
  if (step.speaker) parts.push(`Said by ${listNames([step.speaker], names)}`);
  parts.push(
    step.recipients.length > 0
      ? `Received it: ${listNames(step.recipients, names)}`
      : "Nobody in the story received it",
  );
  if (step.overhearers.length > 0) parts.push(`Overheard it: ${listNames(step.overhearers, names)}`);
  return parts.join(". ");
}

function fallbackQuestion(step: ExtractionStep, number: number, ext: Extraction) {
  return {
    question: `Step ${number} says: "${step.text}" Who saw or heard it?`,
    options: [
      "Everyone in the story",
      ...ext.characters.slice(0, 2).map((c) => `Only ${c.name}`),
      "Nobody else",
    ].slice(0, 4),
  };
}

/**
 * Validates `raw` (a parser's output) against what the user actually wrote, and, if it holds
 * up, builds the validated story and the Two-Lens views from the existing engine.
 */
export function convertExtraction(raw: unknown, source: string): Conversion {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid", code: "story_schema" };
  const ext = parsed.data;

  if (ext.status === "cannot_process") {
    return { kind: "cannot", message: ext.message?.trim() || DEFAULT_CANNOT };
  }
  if (ext.status === "needs_clarification") {
    return ext.clarification
      ? { kind: "clarify", question: ext.clarification.question, options: ext.clarification.options }
      : { kind: "invalid", code: "clarification" };
  }

  // --- characters
  if (ext.characters.length < 2 || ext.characters.length > 3) return { kind: "invalid", code: "characters" };
  if (new Set(ext.characters.map((c) => c.id)).size !== ext.characters.length) {
    return { kind: "invalid", code: "characters" };
  }
  for (const c of ext.characters) {
    if (!isQuoted(source, c.name)) return { kind: "invalid", code: "invented_name" };
  }

  // --- steps
  if (ext.steps.length < 4 || ext.steps.length > 6) return { kind: "invalid", code: "steps" };

  // --- everything must be grounded in the user's own words
  for (const p of ext.propositions) {
    if (!isQuoted(source, p.quote)) return { kind: "invalid", code: "ungrounded" };
    if (unsupportedMentalWords(p.text, [p.quote]).length > 0) return { kind: "invalid", code: "mental_words" };
  }
  for (const w of ext.initialWorld) if (!isQuoted(source, w.quote)) return { kind: "invalid", code: "ungrounded" };
  for (const b of ext.initialBeliefs) if (!isQuoted(source, b.quote)) return { kind: "invalid", code: "ungrounded" };

  let firstUnclear = -1;
  for (const [i, step] of ext.steps.entries()) {
    if (!isQuoted(source, step.quote)) return { kind: "invalid", code: "ungrounded" };
    if (step.accessQuotes.some((q) => !isQuoted(source, q))) return { kind: "invalid", code: "ungrounded" };
    if (sentenceCount(step.text) > 1) return { kind: "invalid", code: "sentence" };
    if (unsupportedMentalWords(step.text, [step.quote, ...step.accessQuotes]).length > 0) {
      return { kind: "invalid", code: "mental_words" };
    }
    if (step.accessUnclear) {
      if (firstUnclear < 0) firstUnclear = i;
    } else if (step.accessQuotes.length === 0) {
      // Nothing in the user's words says who saw or heard it: ask, never guess.
      if (firstUnclear < 0) firstUnclear = i;
    }
  }

  // --- not enough information about who saw or heard what: ask one simple question
  if (firstUnclear >= 0) {
    if (ext.clarification) {
      return { kind: "clarify", question: ext.clarification.question, options: ext.clarification.options };
    }
    return { kind: "clarify", ...fallbackQuestion(ext.steps[firstUnclear], firstUnclear + 1, ext) };
  }

  // --- build the story in the same structured format as the built-in scenarios
  const beliefsByActor: Record<string, string[]> = {};
  for (const b of ext.initialBeliefs) (beliefsByActor[b.actorId] ??= []).push(b.proposition);

  const built = BeliefStorySchema.safeParse({
    scenarioId: "custom-scenario",
    actors: ext.characters,
    propositions: ext.propositions.map((p) => ({ id: p.id, text: p.text })),
    exclusiveGroups: ext.exclusiveGroups,
    initialWorld: ext.initialWorld.map((w) => w.proposition),
    initialBeliefs: beliefsByActor,
    events: ext.steps.map((s, i) => {
      const base = { id: `e${i + 1}`, t: i + 1, description: s.text };
      return s.type === "action"
        ? { type: "action", ...base, effects: s.changes, observers: s.observers }
        : {
            type: "communication",
            ...base,
            speaker: s.speaker,
            assertions: s.changes,
            recipients: s.recipients,
            overhearers: s.overhearers,
          };
    }),
  });
  if (!built.success) return { kind: "invalid", code: "story_schema" };
  const story = built.data;

  // --- run the existing engine and build the same step views as the built-in scenarios
  const scenarioText: StoryText = { title: "Your scenario", steps: ext.steps.map((s) => ({ text: s.text })) };
  const table = trackBeliefs(story);
  const views = story.events.map((_, i) => buildStepView(story, table, scenarioText, i + 1, null));

  const names = new Map(ext.characters.map((c) => [c.id, c.name]));
  return {
    kind: "ready",
    story,
    scenarioText,
    response: {
      status: "ready",
      review: {
        characters: ext.characters,
        steps: ext.steps.map((s, i) => ({
          number: i + 1,
          text: s.text,
          youWrote: s.quote,
          whoSawOrHeard: whoSawOrHeard(s, names),
          yourWordsAboutIt: s.accessQuotes,
        })),
        notAssumed: NOT_ASSUMED,
      },
      views,
    },
  };
}
