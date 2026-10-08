import type { CustomResponse } from "@/engine/custom-schema";
import type { PredictionPrompt, PredictionReveal } from "@/engine/prediction-schema";
import type { StepView } from "@/engine/view";

/**
 * Plain-language text for Read Aloud.
 *
 * Each function is given only what is currently VISIBLE on the page (the step view the student
 * has reached, the question card on screen, the reveal they have already received), so it can
 * never read a future event. Symbols and colours become words, so nothing depends on seeing them.
 */

type Review = Extract<CustomResponse, { status: "ready" }>["review"];

const PARTICIPATION = {
  spoke: "said it",
  observed: "saw it happen",
  told: "was told",
  overheard: "overheard it",
  none: "did not see or hear this step",
} as const;

/** Make sure a fragment ends like a sentence so the voice pauses naturally. */
const sentence = (s: string) => (/[.!?]["')]?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function describeStepView(view: StepView): string {
  const parts: string[] = [
    `Step ${view.stepNumber} of ${view.totalSteps}.`,
    sentence(view.currentStep.text),
    "What is actually true.",
    view.truths.length > 0
      ? view.truths.map((t) => sentence(t.text)).join(" ")
      : "Nothing has been established yet.",
    "What each character believes.",
  ];

  for (const c of view.characters) {
    parts.push(`${c.name}. This step, ${c.name} ${PARTICIPATION[c.participation]}.`);
    if (c.believes.length === 0 && c.updated.length === 0 && c.notKnown.length === 0) {
      parts.push(`Nothing to show for ${c.name} yet.`);
    }
    for (const b of c.believes) {
      parts.push(
        `${c.name} believes: ${sentence(b.text)} ${
          b.status === "differs" ? "This belief differs from reality. It is not true right now." : "This belief matches reality."
        }`,
      );
    }
    for (const u of c.updated) parts.push(`${c.name} no longer believes: ${sentence(u.text)}`);
    for (const k of c.notKnown) {
      parts.push(`Information ${c.name} does not have right now: ${sentence(k.text)}`);
    }
  }
  return parts.join(" ");
}

export function describePrompt(prompt: PredictionPrompt): string {
  const intro =
    prompt.kind === "interpretation"
      ? "A question about feelings. This is an interpretation, so there is no single right answer."
      : "Predict before you read on.";
  const letters = ["A", "B", "C"];
  const choices = prompt.choices.map((c, i) => `Choice ${letters[i]}: ${sentence(c.text)}`);
  return [intro, sentence(prompt.prompt), ...choices].join(" ");
}

export function describeReveal(prompt: PredictionPrompt, reveal: PredictionReveal): string {
  const letters = ["A", "B", "C"];
  const heading =
    reveal.matchedBest === null
      ? "There isn't one right answer here."
      : reveal.matchedBest
        ? "Your prediction matches the evidence."
        : "That's a reasonable thought. Here is what the evidence points to.";
  const choices = reveal.notes.map((n, i) => {
    const choice = prompt.choices.find((c) => c.id === n.choiceId)!;
    const tags = [
      reveal.bestChoiceId === n.choiceId ? "Best supported by the evidence." : "",
      reveal.chosenChoiceId === n.choiceId ? "Your prediction." : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `Choice ${letters[i]}: ${sentence(choice.text)} ${tags} ${sentence(n.text)}`.replace(/\s+/g, " ");
  });
  return [
    heading,
    sentence(prompt.prompt),
    ...choices,
    "Why.",
    sentence(reveal.explanation),
    reveal.evidence.length > 0 ? "What the belief tracker shows." : "",
    ...reveal.evidence.map((e) => sentence(e.text)),
    reveal.matchedBest === null ? "In this story." : "What happens next.",
    `Step ${reveal.nextStep.number}. ${sentence(reveal.nextStep.text)}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function describeReview(review: Review): string {
  const steps = review.steps.map((s) =>
    [
      `Step ${s.number}. ${sentence(s.text)}`,
      `You wrote: ${sentence(s.youWrote)}`,
      `Who saw or heard it: ${sentence(s.whoSawOrHeard)}`,
    ].join(" "),
  );
  return [
    "Here is what we understood.",
    `People: ${review.characters.map((c) => c.name).join(", ")}.`,
    ...steps,
    "What we did not assume.",
    ...review.notAssumed.map(sentence),
  ].join(" ");
}

/**
 * Splits text into short chunks at sentence ends. Some browsers cut off or stall on very long
 * utterances, and chunks also let Pause and Stop respond promptly.
 */
export function splitForSpeech(text: string, maxLength = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["')]?\s*|[^.!?]+$/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && (current + s).length > maxLength) {
      chunks.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
