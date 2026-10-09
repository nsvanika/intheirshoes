import type { Metadata } from "next";
import Link from "next/link";
import { benchmarkCases, getCase } from "@/benchmark/build";
import { scoringExamples } from "@/benchmark/demo";
import { loadLiveResults } from "@/benchmark/load-results";
import { DEFAULT_SETTINGS } from "@/benchmark/runner";
import { baselineAccuracies, type MethodSummary } from "@/benchmark/summarize";
import { describeBenchmark } from "@/benchmark/validate";

export const metadata: Metadata = {
  title: "About the Science | InTheirShoes",
  description: "The research behind InTheirShoes, and an honest test of whether tracking beliefs step by step helps an AI.",
};

const H2 = "mt-10 text-2xl font-semibold";
const H3 = "mt-6 text-xl font-semibold";
const P = "mt-3 leading-relaxed";
const LIST = "mt-3 list-disc space-y-2 pl-6 leading-relaxed";
const CALLOUT =
  "mt-4 rounded-xl border-2 border-sky-600 bg-sky-50/70 p-4 leading-relaxed dark:border-sky-400 dark:bg-sky-950/30";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div
      role="region"
      aria-label={`${caption} (scrolls sideways on a small screen)`}
      tabIndex={0}
      className="mt-4 overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-700"
    >
      <table className="w-full border-collapse text-left">
        <caption className="p-3 text-left font-semibold">{caption}</caption>
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            {head.map((h) => (
              <th key={h} scope="col" className="p-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-200 last:border-0 dark:border-slate-800">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="p-3 font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="p-3">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function methodRow(label: string, m: MethodSummary) {
  const failures = Object.entries(m.failures)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k.replace(/_/g, " ")}: ${n}`)
    .join(", ");
  return [
    label,
    m.total,
    `${m.correct} of ${m.total}`,
    pct(m.accuracy),
    `${pct(m.familyBootstrap95.low)} to ${pct(m.familyBootstrap95.high)}`,
    pct(m.answerOnlyAccuracy),
    failures || "none",
    m.apiFailures,
  ];
}

export default function AboutTheSciencePage() {
  const sally = getCase("classic-sally-anne");
  const d = describeBenchmark(benchmarkCases);
  const baselines = baselineAccuracies();
  const loaded = loadLiveResults();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300">
        &larr; All scenarios
      </Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">About the Science</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
        InTheirShoes is built on research about how to keep track of what different people know. This page
        explains that research in plain words, shows what it found, and describes a test of our own, including
        what that test can and cannot tell us.
      </p>

      <h2 className={H2}>The idea: what someone believes is not always what is true</h2>
      <p className={P}>
        Psychologists have studied this for decades with a classic puzzle, the <strong>false-belief task</strong>.
        In a version of the Sally&ndash;Anne task, one person watches a marble being put in a basket and then leaves
        the room. While she is away, someone moves the marble to a box. When she returns, where will she look?
      </p>
      <blockquote className="mt-4 rounded-xl border-l-4 border-teal-700 bg-slate-50 p-4 leading-relaxed dark:border-teal-400 dark:bg-slate-900">
        {sally.sentences.map((s) => (
          <span key={s} className="block">
            {s}
          </span>
        ))}
        <span className="mt-2 block font-semibold">{sally.question.text}</span>
        <ul className="mt-1 space-y-1">
          {sally.question.options.map((o) => (
            <li key={o.letter}>
              {o.letter}. {o.text}
            </li>
          ))}
        </ul>
      </blockquote>
      <p className={P}>
        She will look in the <strong>basket</strong>, because that is the last thing she saw. The marble is really in
        the box, so her belief is a <strong>false belief</strong>. It is not a mistake or a failure. It is exactly what
        you would expect from someone who was not there when things changed. Seeing this clearly means keeping two
        things apart: <em>what is true</em>, and <em>what each person has seen or been told</em>. That is what the
        Two-Lens View in this app shows, one step at a time.
      </p>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        The wording above is original to this project. The task design comes from Baron-Cohen, Leslie &amp; Frith (1985),
        which adapted the change-of-location task of Wimmer &amp; Perner (1983). See the sources at the bottom.
      </p>

      <h2 className={H2}>The research behind the app</h2>
      <p className={P}>
        The belief engine in this app follows a research paper, &ldquo;Beyond Final Answers: Explicit Belief-State
        Tracking in Compact Instruction-Tuned Language Models&rdquo; (Doddavarapu &amp; Tomar). Instead of asking an AI
        one question about a story, the paper asked it to write out a full table of <em>who believes what, at every
        step</em>, and checked every row.
      </p>
      <p className={P}>The engine&rsquo;s rules are the ones the paper states:</p>
      <ul className={LIST}>
        <li>A person who sees something happen can update what they believe.</li>
        <li>A person who was not there keeps believing what they last saw or were told.</li>
        <li>A message reaches only the people it was sent to, or who overheard it.</li>
        <li>Two statements that cannot both be true cannot both be believed about the same thing.</li>
      </ul>

      <h3 className={H3}>What the paper found</h3>
      <p className={P}>
        The paper tested two small open AI models (about 1.5 to 1.7 billion parameters) on 36 held-out stories
        (538 required table rows, from 24 independent story families). These are the paper&rsquo;s own numbers:
      </p>
      <Table
        caption="Results reported in the paper (held-out test)"
        head={["What was measured", "Result in the paper"]}
        rows={[
          ["Strict row accuracy, the four AI conditions", "13.94% to 25.28%"],
          ["Whole stories with every row correct", "0% for all four conditions"],
          ["Replies that failed the required table format", "63.89% to 97.22%"],
          ["A rule that always picks the most common answer", "53.72% row accuracy"],
          ["A rule that copies the real state of the world", "84.76% row accuracy overall, but 0% on rows where a belief differs from reality"],
          ["The engine that follows the stated rules (an upper bound, not an AI)", "100% on everything"],
        ]}
      />
      <p className={P}>
        The last two rows are the key lesson. A rule that just copies the world scores well overall, because most
        beliefs match reality. But it gets <em>every</em> false belief wrong. So a high overall score can hide a complete
        failure at the thing that matters. That is why this project reports false-belief cases separately.
      </p>
      <p className={P}>
        The paper is careful about its own limits. It calls its results <strong>preliminary</strong>: the benchmark is
        small and mostly synthetic, a second person has not yet independently checked the gold labels, and it does not
        claim to show or to rule out human-like understanding. We repeat those limits here.
      </p>

      <h2 className={H2}>Our test: does writing a belief table help?</h2>
      <p className={P}>
        We built a small test of our own to ask a narrower question: <strong>on the same questions, with the same AI
        model, does being made to write a belief table before answering change how often it gets the answer right?</strong>
      </p>

      <h3 className={H3}>How the test was built</h3>
      <ul className={LIST}>
        <li>
          <strong>{d.cases} questions, but only {d.families} different story families.</strong> We have 12 library
          stories, so we made extra versions (for example, one where the character <em>does</em> see the change). Related
          versions share a family, and the statistics treat a family as one piece of evidence, not several.
        </li>
        <li>
          <strong>Real false beliefs, not just missing information:</strong> {d.byCategory.false_belief} false-belief
          questions, {d.byCategory.missing_information} where a character simply was not told, and{" "}
          {d.byCategory.true_belief_control} control questions where the character&rsquo;s belief is correct.
        </li>
        <li>
          <strong>Classic tasks:</strong> Sally&ndash;Anne, Maxi and the chocolate, and an unexpected-contents task, each
          with a control. The wording is ours; the task designs are credited below.
        </li>
        <li>
          <strong>Every question has</strong> a full story, a question about what someone believes, a checked answer, an
          explanation, a family label, and a record of how the answer was checked.
        </li>
        <li>
          <strong>How answers were checked:</strong> the belief engine worked each answer out from the story, and a
          second, separately written program re-computed every belief. A question was only kept if the two agreed. A
          person also read each story to make sure it states everything needed. <em>That is not an independent human
          audit,</em> which is a limitation, as in the paper.
        </li>
      </ul>

      <h3 className={H3}>The two methods</h3>
      <Table
        caption="The two prompts: identical except for one step"
        head={["What is compared", "Method A: plain prompting", "Method B: explicit belief tracking"]}
        rows={[
          ["Same for both", "Same model, settings, story, characters, statements, question, options, and answer format", "Same as A"],
          ["What the AI must do", "Give the answer directly", "First write a table of who believes each statement at every step, then answer"],
          ["Counted as correct", "A valid reply with the right answer", "A valid reply with the right answer and a complete table"],
        ]}
      />
      <p className={P}>
        The strict rule is the same for both: a reply that is wrong, missing, cut off, in the wrong format, or that fails
        to arrive counts as a failure. Nothing is quietly dropped. Failures to reach the AI at all are reported
        separately from the AI&rsquo;s own mistakes. We also report a second number, <em>answer-only accuracy</em>, that
        gives credit for the right answer even if the table was incomplete, so we can tell &ldquo;couldn&rsquo;t work it
        out&rdquo; apart from &ldquo;couldn&rsquo;t format it.&rdquo; The full plan was written down before any run, in{" "}
        <code>docs/benchmark/PROTOCOL.md</code>.
      </p>

      <h3 className={H3}>Results</h3>
      {loaded ? (
        <>
          <div className={CALLOUT}>
            <p>
              <strong>Live run.</strong> Model <code>{loaded.file.model}</code>, run on{" "}
              {new Date(loaded.file.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })},{" "}
              {loaded.file.settings.runs} run{loaded.file.settings.runs === 1 ? "" : "s"} per question, reasoning switched off
              for both methods. These numbers come from {loaded.summary.questionsPerMethod} questions per method in{" "}
              {loaded.summary.families} families, so <strong>they are preliminary and the uncertainty is large</strong>.
            </p>
            {!loaded.matchesCurrentBenchmark && (
              <p className="mt-2 font-semibold">
                Note: the test questions or prompts have changed since this run, so these results describe an earlier
                version of the test.
              </p>
            )}
          </div>
          <Table
            caption="Results by method (primary, strict scoring)"
            head={["Method", "Questions", "Correct", "Accuracy", "95% interval (by family)", "Answer-only accuracy", "Failures", "API failures"]}
            rows={[
              methodRow("A: plain prompting", loaded.summary.methods.A),
              methodRow("B: belief table", loaded.summary.methods.B),
            ]}
          />
          <p className={P}>
            On identical questions: both right {loaded.summary.paired.bothCorrect}, only Method A right{" "}
            {loaded.summary.paired.onlyA}, only Method B right {loaded.summary.paired.onlyB}, neither{" "}
            {loaded.summary.paired.neither}. Exact paired test p = {loaded.summary.paired.mcnemarP.toFixed(3)}. Method B minus
            Method A: {(loaded.summary.paired.difference * 100).toFixed(1)} percentage points (95% interval{" "}
            {(loaded.summary.paired.differenceBootstrap95.low * 100).toFixed(1)} to{" "}
            {(loaded.summary.paired.differenceBootstrap95.high * 100).toFixed(1)}).
          </p>
          <Table
            caption="Correct answers by kind of question"
            head={["Kind of question", "Questions", "Method A correct", "Method B correct"]}
            rows={[
              ...loaded.summary.byCategory.map((g) => [g.label, g.questions, g.a, g.b]),
              [loaded.summary.divergence.label + " (the paper's key measure)", loaded.summary.divergence.questions, loaded.summary.divergence.a, loaded.summary.divergence.b],
            ]}
          />
          {loaded.summary.methods.B.meanRowAccuracy !== null && (
            <p className={P}>
              Method B&rsquo;s tables matched the engine&rsquo;s table on {pct(loaded.summary.methods.B.meanRowAccuracy)} of rows
              on average, and its final answer agreed with its own table {pct(loaded.summary.methods.B.tableConsistency ?? 0)} of
              the time.
            </p>
          )}
        </>
      ) : (
        <>
          <div className={CALLOUT} role="note">
            <p className="font-semibold">No live comparison has been run yet, so there are no results to show.</p>
            <p className="mt-2">
              This project uses no paid AI service, so it has not tested a real AI model, and{" "}
              <strong>it makes no claim that either method is better</strong>. The test, the two methods, the scoring and
              the statistics are built and checked, and are ready to run if someone with access to a model chooses to. We
              would rather show an empty space than a made-up number.
            </p>
          </div>
          <h4 className="mt-6 text-lg font-semibold">Demonstration: how a reply is scored (not an AI evaluation)</h4>
          <p className={P}>
            To show the scoring working without any AI, we wrote a few <strong>stand-in replies by hand</strong> to the
            Sally&ndash;Anne question and ran them through the real scorer. These are made-up replies, not an AI&rsquo;s
            answers, so this table says nothing about how well any AI does.
          </p>
          <Table
            caption="Hand-written stand-in replies and how the scorer counts them (a demonstration, not results)"
            head={["Stand-in reply", "Method", "Scorer's verdict", "Counted as"]}
            rows={scoringExamples().map((x) => [
              x.reply,
              x.method,
              x.outcome === "correct" ? "correct" : x.outcome.replace(/_/g, " "),
              x.counted,
            ])}
          />
          <p className={P}>
            The same scorer also ran over the whole 26-question test with scripted stand-ins during development,
            including some that deliberately fail in every way listed above, to check that every kind of failure is
            counted and none is hidden. Those rehearsal runs are kept out of the website on purpose.
          </p>
        </>
      )}

      <h3 className={H3}>What simple rules score on these same questions</h3>
      <p className={P}>
        These are not AI results. They show how much of the test can be passed without understanding anyone&rsquo;s
        beliefs, so you can see what a result would need to beat.
      </p>
      <Table
        caption="Model-free baselines on the same questions"
        head={["Rule", "Correct", "Why it matters"]}
        rows={baselines.map((b) => [b.name, `${b.correct} of ${b.total}`, b.note])}
      />

      <h3 className={H3}>What we can and cannot conclude</h3>
      <ul className={LIST}>
        <li>
          <strong>It is one AI model, tested on about two dozen questions.</strong> Even a big difference could be
          chance, and the intervals are wide. A result would be a first look, not a proof.
        </li>
        <li>
          <strong>It cannot show that belief tracking &ldquo;works&rdquo; in general,</strong> that another model would
          behave the same way, or that an AI understands people the way a person does. Neither does the paper claim this.
        </li>
        <li>
          <strong>Method B has more ways to fail on format,</strong> because it must return a long table. That is why
          answer-only accuracy is shown next to the strict score.
        </li>
        <li>
          <strong>Many of the questions share one structure</strong> (someone was away when something changed), so the
          test does not cover every kind of social situation. Feelings and second-order beliefs
          (&ldquo;what A thinks B believes&rdquo;) are not tested.
        </li>
        <li>
          <strong>The answers come from the same rules the method uses,</strong> checked by a second program and a
          careful read, but not yet by independent people. A reader who disagrees with a rule would disagree with the
          answers.
        </li>
      </ul>

      <h2 className={H2}>Try it</h2>
      <p className={P}>
        See the idea for yourself in <Link className="text-teal-800 underline underline-offset-4 dark:text-teal-300" href="/scenarios/the-wrong-room">The Wrong Room</Link>, or{" "}
        <Link className="text-teal-800 underline underline-offset-4 dark:text-teal-300" href="/make-your-own">make your own scenario</Link>. In the
        Two-Lens View, the left side is what is true and the right side is what each person believes.
      </p>

      <h2 className={H2}>Sources</h2>
      <ul className={LIST}>
        <li>
          Doddavarapu, S., &amp; Tomar, A. <em>Beyond Final Answers: Explicit Belief-State Tracking in Compact
          Instruction-Tuned Language Models.</em> (The research paper behind this app.)
        </li>
        <li>
          Wimmer, H., &amp; Perner, J. (1983). Beliefs about beliefs: Representation and constraining function of wrong
          beliefs in young children&rsquo;s understanding of deception. <em>Cognition, 13</em>(1), 103&ndash;128.
        </li>
        <li>
          Baron-Cohen, S., Leslie, A. M., &amp; Frith, U. (1985). Does the autistic child have a &ldquo;theory of
          mind&rdquo;? <em>Cognition, 21</em>(1), 37&ndash;46.
        </li>
        <li>
          Perner, J., Leekam, S. R., &amp; Wimmer, H. (1987). Three-year-olds&rsquo; difficulty with false belief: The
          case for a conceptual deficit. <em>British Journal of Developmental Psychology, 5</em>, 125&ndash;137.
        </li>
        <li>
          Gopnik, A., &amp; Astington, J. W. (1988). Children&rsquo;s understanding of representational change and its
          relation to the understanding of false belief and the appearance-reality distinction.{" "}
          <em>Child Development, 59</em>, 26&ndash;37.
        </li>
      </ul>
      <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">
        Test settings for the comparison: model <code>claude-haiku-5-5</code> (unless stated with a run), at most{" "}
        {DEFAULT_SETTINGS.maxTokens.toLocaleString()} tokens per reply, hidden reasoning off for both methods.
        InTheirShoes is a practice tool, not therapy or diagnosis.
      </p>
    </main>
  );
}
