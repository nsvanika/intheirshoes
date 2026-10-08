"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChoiceId, PredictionPrompt, PredictionReveal } from "@/engine/prediction-schema";

/**
 * "Predict, Then Reveal". Before submitting, the card holds only the question and three
 * neutral choices (that is all the browser has been sent). After submitting, the server's
 * reveal arrives and the card turns into a gentle review: no red, no crosses, no scores.
 */

const TAG =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export default function PredictionCard({
  prompt,
  reveal,
  submitting,
  error,
  nudge,
  focusOnMount,
  onSubmit,
  onContinue,
  canContinue,
}: {
  prompt: PredictionPrompt;
  reveal: PredictionReveal | null;
  submitting: boolean;
  error: string | null;
  /** The student pressed Next Step before answering: show a friendly reminder. */
  nudge: boolean;
  focusOnMount: boolean;
  onSubmit: (choice: ChoiceId) => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  const [selected, setSelected] = useState<ChoiceId | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealHeadingRef = useRef<HTMLHeadingElement>(null);
  const hintId = useId();
  const interpretation = prompt.kind === "interpretation";

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    if (reveal) revealHeadingRef.current?.focus();
  }, [reveal]);

  useEffect(() => {
    if (nudge) headingRef.current?.focus();
  }, [nudge]);

  const choiceText = (id: ChoiceId) => prompt.choices.find((c) => c.id === id)!.text;

  return (
    <section
      aria-labelledby="prediction-heading"
      className="mt-6 rounded-xl border-2 border-sky-600 bg-sky-50/60 p-4 sm:p-5 dark:border-sky-400 dark:bg-sky-950/30"
    >
      <h2
        id="prediction-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-offset-4"
      >
        {interpretation ? "A question about feelings" : "Predict before you read on"}
      </h2>

      {interpretation ? (
        <p className="mt-2 rounded-lg border border-sky-600 bg-white p-3 text-slate-900 dark:border-sky-400 dark:bg-slate-900 dark:text-slate-100">
          <span className="font-semibold">This is an interpretation.</span> We can&apos;t know for
          sure how anyone feels, and different people could feel differently. There is no single right
          answer, so choose whichever seems most reasonable to you.
        </p>
      ) : (
        <p className="mt-1 text-slate-700 dark:text-slate-300">
          Think about what {prompt.characterName} has seen and been told. Take your best guess; every
          guess helps you think it through.
        </p>
      )}

      {!reveal ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected && !submitting) onSubmit(selected);
          }}
        >
          <fieldset disabled={submitting}>
            <legend className="text-lg font-medium leading-relaxed">{prompt.prompt}</legend>
            <div className="mt-3 space-y-3">
              {prompt.choices.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-400 bg-white p-4 text-lg has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 hover:border-teal-700 dark:border-slate-500 dark:bg-slate-900 dark:has-[:checked]:border-teal-400 dark:has-[:checked]:bg-teal-950 dark:hover:border-teal-400"
                >
                  <input
                    type="radio"
                    name={`prediction-${prompt.id}`}
                    value={c.id}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                    className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
                  />
                  <span>{c.text}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {nudge && (
            <p role="status" className="mt-3 rounded-lg border border-sky-600 bg-white p-3 dark:border-sky-400 dark:bg-slate-900">
              Pick the answer that seems most likely, then press Submit. Then the story will continue.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-500 bg-amber-50 p-3 text-amber-950">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!selected || submitting}
              aria-describedby={hintId}
              className="min-h-12 rounded-lg bg-teal-700 px-5 py-2 text-base font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            >
              {submitting ? "Checking…" : "Submit my prediction"}
            </button>
            <p id={hintId} className="text-sm text-slate-700 dark:text-slate-300">
              {selected ? "Ready when you are." : "Choose one answer to continue."}
            </p>
          </div>
        </form>
      ) : (
        <div className="mt-4" aria-live="polite">
          <p className="text-lg font-medium leading-relaxed">{prompt.prompt}</p>

          <h3
            ref={revealHeadingRef}
            tabIndex={-1}
            className="mt-4 rounded-lg border-l-4 border-teal-700 bg-white p-3 text-lg font-semibold outline-offset-4 dark:border-teal-400 dark:bg-slate-900"
          >
            {reveal.matchedBest === null
              ? "There isn't one right answer here."
              : reveal.matchedBest
                ? "Your prediction matches the evidence. Nicely reasoned!"
                : "That's a reasonable thought. Here is what the evidence points to."}
          </h3>

          <ul className="mt-4 space-y-3">
            {reveal.notes.map((n) => {
              const isBest = reveal.bestChoiceId === n.choiceId;
              const isChosen = reveal.chosenChoiceId === n.choiceId;
              return (
                <li
                  key={n.choiceId}
                  className={`rounded-lg border p-4 ${
                    isBest
                      ? "border-teal-600 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/60"
                      : isChosen
                        ? "border-sky-600 bg-white dark:border-sky-400 dark:bg-slate-900"
                        : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                  }`}
                >
                  <p className="text-lg">{choiceText(n.choiceId)}</p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    {isBest && (
                      <span className={`${TAG} border-teal-600 bg-white text-teal-950 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-50`}>
                        <span aria-hidden="true">✓</span> Best supported by the evidence
                      </span>
                    )}
                    {isChosen && (
                      <span className={`${TAG} border-sky-600 bg-sky-50 text-sky-950 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-50`}>
                        Your prediction
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-slate-800 dark:text-slate-200">{n.text}</p>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Why
            </h4>
            <p className="mt-1 leading-relaxed">{reveal.explanation}</p>
            {reveal.evidence.length > 0 && (
              <>
                <h4 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  What the belief tracker shows
                </h4>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {reveal.evidence.map((e, i) => (
                    <li key={i}>{e.text}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="mt-4 rounded-lg border-l-4 border-slate-500 bg-white p-4 dark:border-slate-400 dark:bg-slate-900">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              {reveal.matchedBest === null ? "In this story" : "What happens next"} (step{" "}
              {reveal.nextStep.number})
            </h4>
            <p className="mt-1 text-lg leading-relaxed">{reveal.nextStep.text}</p>
          </div>

          {canContinue && (
            <p className="mt-4">
              <button
                type="button"
                onClick={onContinue}
                className="min-h-12 rounded-lg bg-teal-700 px-5 py-2 text-base font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
              >
                Continue Story <span aria-hidden="true">&rarr;</span>
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
