"use client";

import Link from "next/link";
import { useState } from "react";
import PredictionCard from "@/components/PredictionCard";
import {
  PredictionRevealSchema,
  type ChoiceId,
  type PredictionReveal,
} from "@/engine/prediction-schema";
import { StepViewSchema, type StepView } from "@/engine/view";

/**
 * The Two-Lens View. The left lens shows what is actually true at the current step;
 * the right lens shows what each character believes. Both come from the belief engine
 * through POST /api/belief-tracking, one step at a time. The next step is requested only
 * when the student presses Next Step, so later events never reach the browser early.
 *
 * Predict, Then Reveal: on a step that has a question, Next Step first pauses and asks it.
 * The step data holds only the question and three neutral choices; the answer, explanation
 * and next event are fetched from the server only after the student submits a prediction.
 */

const PARTICIPATION_LABEL: Record<StepView["characters"][number]["participation"], string> = {
  spoke: "Said it",
  observed: "Saw it happen",
  told: "Was told",
  overheard: "Overheard it",
  none: "Did not see or hear this step",
};

const TAG =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

function NewTag() {
  return (
    <span
      className={`${TAG} border-slate-400 bg-white text-slate-800 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100`}
    >
      New
    </span>
  );
}

function MatchTag() {
  return (
    <span
      className={`${TAG} border-teal-600 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-50`}
    >
      <span aria-hidden="true">✓</span> Matches reality
    </span>
  );
}

function DiffTag() {
  return (
    <span
      className={`${TAG} border-amber-600 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50`}
    >
      <span aria-hidden="true">≠</span> Differs from reality
    </span>
  );
}

function Legend() {
  return (
    <ul
      aria-label="What the labels mean"
      className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700 dark:text-slate-300"
    >
      <li className="flex items-center gap-2">
        <MatchTag /> <span>Their belief is true right now</span>
      </li>
      <li className="flex items-center gap-2">
        <DiffTag /> <span>Their belief is not true right now</span>
      </li>
      <li className="flex items-center gap-2">
        <span
          className={`${TAG} border-sky-600 bg-sky-50 text-sky-950 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-50`}
        >
          <span aria-hidden="true">○</span> Not known right now
        </span>
        <span>They have not seen or been told it. This is not a mistake.</span>
      </li>
    </ul>
  );
}

function CharacterPanel({ character }: { character: StepView["characters"][number] }) {
  const headingId = `char-${character.id}`;
  const nothing =
    character.believes.length === 0 &&
    character.notKnown.length === 0 &&
    character.updated.length === 0;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {character.name}
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          This step: {PARTICIPATION_LABEL[character.participation]}
        </p>
      </div>

      {nothing && (
        <p className="mt-3 text-slate-700 dark:text-slate-300">
          Nothing to show for {character.name} yet.
        </p>
      )}

      {character.believes.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Believes
          </h4>
          <ul className="mt-2 space-y-2">
            {character.believes.map((b) => (
              <li
                key={b.id}
                className={`rounded-lg border p-3 ${
                  b.status === "differs"
                    ? "border-amber-400 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-950/50"
                    : "border-teal-300 bg-teal-50/60 dark:border-teal-700 dark:bg-teal-950/40"
                }`}
              >
                <p>{b.text}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  {b.status === "differs" ? <DiffTag /> : <MatchTag />}
                  {b.isNew && <NewTag />}
                </p>
                {b.status === "differs" && (
                  <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                    This is not true right now.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {character.updated.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Updated this step
          </h4>
          <ul className="mt-2 space-y-2">
            {character.updated.map((u) => (
              <li
                key={u.id}
                className="rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800"
              >
                <p>
                  <span aria-hidden="true">↻ </span>No longer believes: {u.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {character.notKnown.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Information {character.name} does not have right now
          </h4>
          <ul className="mt-2 space-y-2">
            {character.notKnown.map((k) => (
              <li
                key={k.id}
                className="rounded-lg border border-sky-300 bg-sky-50/70 p-3 dark:border-sky-700 dark:bg-sky-950/40"
              >
                <p>
                  <span aria-hidden="true">○ </span>
                  {k.text}
                </p>
                {k.isNew && (
                  <p className="mt-2">
                    <NewTag />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function ScenarioLens({
  scenarioId,
  initialView,
}: {
  scenarioId: string;
  initialView: StepView;
}) {
  const [views, setViews] = useState<Record<number, StepView>>({
    [initialView.stepNumber]: initialView,
  });
  const [current, setCurrent] = useState(initialView.stepNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Predict, Then Reveal state
  const [answers, setAnswers] = useState<Record<string, PredictionReveal>>({});
  const [asking, setAsking] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const view = views[current];
  const total = initialView.totalSteps;
  const atEnd = current >= total;
  const question = view.prediction;
  const reveal = question ? (answers[question.id] ?? null) : null;
  // Show the card while a question is being asked, and keep showing the review for answered ones.
  const showPrediction = question !== null && (asking || reveal !== null);

  function goNext() {
    if (atEnd || loading) return;
    // Pause for the question before showing the next step.
    if (question && !answers[question.id]) {
      setNudge(asking); // already open? gently remind the student to answer first
      setAsking(true);
      return;
    }
    void advance();
  }

  async function submitPrediction(choice: ChoiceId) {
    if (!question || submitting) return;
    setSubmitting(true);
    setPredictionError(null);
    try {
      const res = await fetch("/api/belief-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, step: current, answer: choice }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const parsed = PredictionRevealSchema.parse(await res.json());
      setAnswers((a) => ({ ...a, [question.id]: parsed }));
      setNudge(false);
    } catch {
      setPredictionError("We couldn't check that just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function advance() {
    if (atEnd || loading) return;
    const next = current + 1;
    setError(null);
    setAsking(false);
    setNudge(false);
    if (views[next]) {
      setCurrent(next);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/belief-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, step: next }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const parsed = StepViewSchema.parse(await res.json());
      setViews((v) => ({ ...v, [next]: parsed }));
      setCurrent(next);
    } catch {
      setError("We couldn't load the next step. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function goPrevious() {
    if (current > 1 && !loading) {
      setError(null);
      setAsking(false);
      setNudge(false);
      setPredictionError(null);
      setCurrent(current - 1);
    }
  }

  const quiet = view.characters.every((c) => c.participation === "none");
  const hasChange =
    view.truths.some((t) => t.isNew) ||
    view.characters.some(
      (c) =>
        c.believes.some((b) => b.isNew) ||
        c.notKnown.some((k) => k.isNew) ||
        c.updated.length > 0,
    );

  const btn =
    "min-h-12 rounded-lg px-5 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300">
        Read one step at a time. The left side shows what is true. The right side shows what each
        character has seen or been told. Only what has happened so far is shown.
      </p>
      <Legend />

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold" id="progress-label">
            Step {view.stepNumber} of {total}
          </p>
        </div>
        <div
          role="progressbar"
          aria-labelledby="progress-label"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={view.stepNumber}
          aria-valuetext={`Step ${view.stepNumber} of ${total}`}
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            className="h-full rounded-full bg-teal-700 transition-[width] duration-500 ease-out dark:bg-teal-400"
            style={{ width: `${(view.stepNumber / total) * 100}%` }}
          />
        </div>
      </div>

      <div key={view.stepNumber} className="lens-fade">
        <div
          className="mt-6 rounded-xl border-l-4 border-teal-700 bg-slate-50 p-4 dark:border-teal-400 dark:bg-slate-900"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Step {view.currentStep.number}
          </p>
          <p className="mt-1 text-xl leading-relaxed">{view.currentStep.text}</p>
        </div>

        {view.earlierSteps.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer rounded-md py-1 text-slate-800 underline underline-offset-4 dark:text-slate-200">
              Earlier steps ({view.earlierSteps.length})
            </summary>
            <ol className="mt-2 space-y-1 pl-5 text-slate-700 dark:text-slate-300">
              {view.earlierSteps.map((s) => (
                <li key={s.number} className="list-decimal">
                  {s.text}
                </li>
              ))}
            </ol>
          </details>
        )}

        {quiet && (
          <p className="mt-4 rounded-lg border border-slate-300 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            No one saw or heard anything new in this step.
          </p>
        )}
        {!quiet && !hasChange && (
          <p className="mt-4 rounded-lg border border-slate-300 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            This step does not change what is true or what anyone believes.
          </p>
        )}

        {showPrediction && question && (
          <PredictionCard
            key={question.id}
            prompt={question}
            reveal={reveal}
            submitting={submitting}
            error={predictionError}
            nudge={nudge}
            focusOnMount={asking}
            onSubmit={submitPrediction}
            onContinue={() => void advance()}
            canContinue={!atEnd && !loading}
          />
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2 md:items-start">
          <section
            aria-labelledby="truth-heading"
            className="rounded-xl border-2 border-teal-700 bg-white p-4 md:sticky md:top-4 dark:border-teal-400 dark:bg-slate-900"
          >
            <h2 id="truth-heading" className="text-xl font-semibold">
              What Is Actually True
            </h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              The facts of the story so far.
            </p>
            {view.truths.length === 0 ? (
              <p className="mt-3 text-slate-700 dark:text-slate-300">
                Nothing has been established yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {view.truths.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-300 bg-teal-50/60 p-3 dark:border-teal-700 dark:bg-teal-950/40"
                  >
                    <span>{t.text}</span>
                    {t.isNew && <NewTag />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="beliefs-heading">
            <h2 id="beliefs-heading" className="text-xl font-semibold">
              What Each Character Believes
            </h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Based only on what each one has seen or been told.
            </p>
            <div className="mt-3 space-y-4">
              {view.characters.map((c) => (
                <CharacterPanel key={c.id} character={c} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {atEnd && (
        <div className="mt-8 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-lg font-semibold">That is the end of this story.</p>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            Use Previous to look back at any step, or start again.
          </p>
          <p className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking(false);
                setNudge(false);
                setPredictionError(null);
                setAnswers({}); // start fresh, including the predictions
                setCurrent(1);
              }}
              className={`${btn} border border-slate-400 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700`}
            >
              Start over
            </button>
            <Link
              href="/"
              className={`${btn} inline-flex items-center border border-slate-400 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700`}
            >
              Choose another scenario
            </Link>
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-3 text-amber-950">
          {error}
        </p>
      )}

      <nav
        aria-label="Step controls"
        className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-slate-800 dark:bg-slate-950/95"
      >
        <button
          type="button"
          onClick={goPrevious}
          disabled={current <= 1 || loading}
          className={`${btn} border border-slate-400 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700`}
        >
          <span aria-hidden="true">&larr; </span>Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={atEnd || loading}
          aria-busy={loading}
          className={`${btn} bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300`}
        >
          {loading ? "Loading…" : "Next Step"}
          {!loading && <span aria-hidden="true"> &rarr;</span>}
        </button>
      </nav>
    </div>
  );
}
