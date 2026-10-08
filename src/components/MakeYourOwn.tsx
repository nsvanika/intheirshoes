"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ScenarioLens from "@/components/ScenarioLens";
import {
  CustomConfigSchema,
  CustomResponseSchema,
  type CustomConfig,
  type CustomResponse,
} from "@/engine/custom-schema";

/**
 * Make Your Own. A student, parent or teacher describes a situation; the server turns it into
 * structured events for the existing belief engine; the result is explored in the same Two-Lens
 * View as the 12 built-in scenarios. Nothing is stored. In demo mode nothing is sent to any AI
 * service and only the example situations are recognised, and the page says so.
 */

type Ready = Extract<CustomResponse, { status: "ready" }>;
type Stage = "form" | "clarify" | "review" | "lens";
type Notice = { tone: "info" | "care"; text: string };
type Clarification = { question: string; answer: string };

const PRIVACY_WARNING =
  "Please use made-up names. Do not enter real names, school names, addresses, phone numbers, or private information.";

const BTN =
  "min-h-12 rounded-lg px-5 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BTN} bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300`;
const SECONDARY = `${BTN} border border-slate-400 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700`;

export default function MakeYourOwn() {
  const [config, setConfig] = useState<CustomConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [text, setText] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [question, setQuestion] = useState<{ question: string; options: string[] } | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    fetch("/api/custom-scenario")
      .then((r) => r.json())
      .then((data) => setConfig(CustomConfigSchema.parse(data)))
      .catch(() => setConfigError(true));
  }, []);

  // Move focus to the new section's heading when the stage changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stage]);

  const ai = config?.mode === "ai";
  const exampleId = config?.examples.find((e) => e.text === text.trim())?.id;
  const canGenerate = !loading && text.trim().length > 0 && (!ai || understood);

  function startOver() {
    setText("");
    setUnderstood(false);
    setStage("form");
    setClarifications([]);
    setQuestion(null);
    setChoice(null);
    setReady(null);
    setNotice(null);
    setError(null);
  }

  async function generate(asked: Clarification[]) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/custom-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, exampleId, clarifications: asked }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }
      const r = CustomResponseSchema.parse(data);
      switch (r.status) {
        case "ready":
          setReady(r);
          setQuestion(null);
          setStage("review");
          break;
        case "needs_clarification":
          setClarifications(asked);
          setQuestion({ question: r.question, options: r.options });
          setChoice(null);
          setStage("clarify");
          break;
        case "demo_unsupported":
          setStage("form");
          setNotice({ tone: "info", text: r.message });
          break;
        case "cannot_process":
          setStage("form");
          setNotice({ tone: "info", text: r.message });
          break;
        case "private_info_warning":
          setStage("form");
          setNotice({ tone: "care", text: r.message });
          break;
      }
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function pickExample(id: string) {
    const ex = config?.examples.find((e) => e.id === id);
    if (!ex) return;
    setText(ex.text);
    setNotice(null);
    setError(null);
    setClarifications([]);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300">
          &larr; All scenarios
        </Link>
        <button type="button" onClick={startOver} className={SECONDARY}>
          Start over
        </button>
      </div>

      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Make Your Own</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300">
        Describe a situation with two or three people, and explore what each person knows at every
        step, in the same Two-Lens View as the other scenarios.
      </p>

      {configError && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-3 text-amber-950">
          We couldn&apos;t load this page&apos;s settings. Please refresh and try again.
        </p>
      )}

      {stage === "form" && (
        <section aria-labelledby="form-heading" className="mt-6">
          <h2 id="form-heading" ref={headingRef} tabIndex={-1} className="sr-only outline-offset-4">
            Describe your situation
          </h2>

          <p
            role="note"
            className="rounded-xl border-2 border-amber-600 bg-amber-50 p-4 text-lg font-semibold leading-relaxed text-amber-950 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-50"
          >
            {PRIVACY_WARNING}
          </p>

          {config && !ai && (
            <div className="mt-4 rounded-xl border border-sky-600 bg-sky-50/70 p-4 dark:border-sky-400 dark:bg-sky-950/30">
              <p className="font-semibold">Demo mode: examples only</p>
              <p className="mt-1 leading-relaxed">
                This version can&apos;t read your own words yet. It only recognises the example
                situations below, so pick one to see how it works. Reading any description you write
                needs an AI service, which the site owner has not set up. Nothing you type here is sent
                to an AI service.
              </p>
              {config.note && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{config.note}</p>}
            </div>
          )}

          {config && ai && (
            <div className="mt-4 rounded-xl border border-sky-600 bg-sky-50/70 p-4 dark:border-sky-400 dark:bg-sky-950/30">
              <p className="font-semibold">Before you generate: your text goes to an AI service</p>
              <p className="mt-1 leading-relaxed">
                When you press Generate, your description is sent over the internet to an outside AI
                provider (Anthropic) so it can be turned into a structured story. We don&apos;t save it
                or write it to our logs, but we can&apos;t control what the provider does with it, and it
                does not stay only on your device. Don&apos;t include anything you wouldn&apos;t want
                processed there.
              </p>
            </div>
          )}

          {config && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold">Try an example</h3>
              <ul className="mt-2 grid gap-3 sm:grid-cols-3">
                {config.examples.map((e) => (
                  <li key={e.id} className="flex">
                    <button
                      type="button"
                      onClick={() => pickExample(e.id)}
                      aria-pressed={exampleId === e.id}
                      className="flex w-full flex-col rounded-xl border border-slate-300 bg-white p-4 text-left hover:border-teal-700 hover:bg-teal-50 aria-pressed:border-teal-700 aria-pressed:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-400 dark:hover:bg-slate-800 dark:aria-pressed:border-teal-400 dark:aria-pressed:bg-teal-950"
                    >
                      <span className="font-semibold">{e.title}</span>
                      <span className="mt-1 text-sm text-slate-700 dark:text-slate-300">Fills in the box below</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (canGenerate) void generate([]);
            }}
          >
            <label htmlFor="description" className="block text-lg font-semibold">
              Describe what happens
            </label>
            <p id="description-hint" className="mt-1 text-slate-700 dark:text-slate-300">
              Say what happens, in order, with two or three made-up people. Say who is there to see or
              hear each thing, and who misses something. Please leave out guesses about feelings.
            </p>
            <textarea
              id="description"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={config?.maxChars ?? 1500}
              rows={9}
              aria-describedby="description-hint description-count"
              placeholder="Write what happens here…"
              className="mt-2 w-full rounded-xl border border-slate-400 bg-white p-4 text-lg leading-relaxed text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
            />
            <p id="description-count" className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {text.length} of {config?.maxChars ?? 1500} characters
            </p>

            {ai && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-400 bg-white p-4 dark:border-slate-500 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
                />
                <span>I understand that my description will be sent to an AI service.</span>
              </label>
            )}

            {notice && (
              <p
                role="status"
                className={`mt-4 rounded-lg border p-4 leading-relaxed ${
                  notice.tone === "care"
                    ? "border-amber-600 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-50"
                    : "border-sky-600 bg-sky-50 text-slate-900 dark:border-sky-400 dark:bg-sky-950/30 dark:text-slate-100"
                }`}
              >
                {notice.text}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-4 text-amber-950">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!canGenerate} aria-busy={loading} className={PRIMARY}>
                {loading ? "Working on it…" : "Generate my scenario"}
              </button>
              {ai && !understood && (
                <p className="text-sm text-slate-700 dark:text-slate-300">Tick the box above to continue.</p>
              )}
              {loading && (
                <p role="status" className="text-slate-700 dark:text-slate-300">
                  Reading your description…
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      {stage === "clarify" && question && (
        <section aria-labelledby="clarify-heading" className="mt-6 rounded-xl border-2 border-sky-600 bg-sky-50/60 p-4 sm:p-5 dark:border-sky-400 dark:bg-sky-950/30">
          <h2 id="clarify-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-offset-4">
            One quick question
          </h2>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            Your description doesn&apos;t say this, and we don&apos;t want to guess.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (choice && !loading) void generate([...clarifications, { question: question.question, answer: choice }]);
            }}
          >
            <fieldset disabled={loading}>
              <legend className="text-lg font-medium leading-relaxed">{question.question}</legend>
              <div className="mt-3 space-y-3">
                {question.options.map((o) => (
                  <label
                    key={o}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-400 bg-white p-4 text-lg has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 hover:border-teal-700 dark:border-slate-500 dark:bg-slate-900 dark:has-[:checked]:border-teal-400 dark:has-[:checked]:bg-teal-950"
                  >
                    <input
                      type="radio"
                      name="clarification"
                      value={o}
                      checked={choice === o}
                      onChange={() => setChoice(o)}
                      className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
                    />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-4 text-amber-950">
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="submit" disabled={!choice || loading} aria-busy={loading} className={PRIMARY}>
                {loading ? "Working on it…" : "Continue"}
              </button>
              <button type="button" onClick={() => { setStage("form"); setClarifications([]); }} className={SECONDARY}>
                Edit my description
              </button>
            </div>
          </form>
        </section>
      )}

      {stage === "review" && ready && (
        <section aria-labelledby="review-heading" className="mt-6">
          <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-offset-4">
            Here&apos;s what we understood
          </h2>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            Each step comes from your own words, shown beside it. If something looks off, edit your
            description and generate again.
          </p>

          <p className="mt-4 text-lg">
            <span className="font-semibold">People:</span> {ready.review.characters.map((c) => c.name).join(", ")}
          </p>

          <ol className="mt-4 space-y-3">
            {ready.review.steps.map((s) => (
              <li key={s.number} className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Step {s.number}
                </p>
                <p className="mt-1 text-lg leading-relaxed">{s.text}</p>
                <dl className="mt-3 space-y-2 text-slate-800 dark:text-slate-200">
                  <div>
                    <dt className="inline font-semibold">You wrote: </dt>
                    <dd className="inline">&ldquo;{s.youWrote}&rdquo;</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Who saw or heard it: </dt>
                    <dd className="inline">{s.whoSawOrHeard}</dd>
                  </div>
                  {s.yourWordsAboutIt.length > 0 && (
                    <div>
                      <dt className="inline font-semibold">In your words: </dt>
                      <dd className="inline">{s.yourWordsAboutIt.map((q) => `“${q}”`).join(" and ")}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold">What we did not assume</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {ready.review.notAssumed.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => setStage("lens")} className={PRIMARY}>
              Start the Two-Lens View
            </button>
            <button type="button" onClick={() => { setStage("form"); setReady(null); setClarifications([]); }} className={SECONDARY}>
              Edit my description
            </button>
          </div>
        </section>
      )}

      {stage === "lens" && ready && (
        <section aria-labelledby="lens-heading" className="mt-6">
          <h2 id="lens-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-offset-4">
            Your scenario
          </h2>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            This story comes only from your description. Feelings and private thoughts are not part of it.
          </p>
          <p className="mt-3">
            <button type="button" onClick={() => setStage("review")} className={SECONDARY}>
              Back to what we understood
            </button>
          </p>
          <ScenarioLens
            scenarioId="custom-scenario"
            initialView={ready.views[0]}
            preloadedViews={ready.views}
            endAction={{ label: "Make another scenario", onClick: startOver }}
          />
        </section>
      )}
    </main>
  );
}
