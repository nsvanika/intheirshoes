import { benchmarkCases, getCase, type BenchmarkCase, type Letter } from "./build";
import { FAILURE_OUTCOMES, type Outcome } from "./evaluate";
import type { Method } from "./prompts";
import { clusterBootstrap, mcnemarExact, seededRandom, wilson } from "./stats";

/**
 * Turns the per-request records of a run into the numbers the About page reports. The page
 * recomputes this from the raw records every time, so a stored summary can never disagree with them.
 */

export interface RequestRecord {
  caseId: string;
  method: Method;
  run: number;
  outcome: Outcome;
  answer: Letter | null;
  primaryCorrect: boolean;
  answerOnlyCorrect: boolean;
  rowAccuracy: number | null;
  tableConsistent: boolean | null;
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Interval {
  low: number;
  high: number;
}

export interface MethodSummary {
  method: Method;
  /** Every request made. Nothing is dropped. */
  total: number;
  /** PRIMARY: valid for the requested format and equal to the gold answer. */
  correct: number;
  accuracy: number;
  wilson95: Interval;
  /** Family-clustered bootstrap 95% interval (the paper's approach). */
  familyBootstrap95: Interval;
  /** SECONDARY: final answer correct whenever a letter could be read. */
  answerOnlyCorrect: number;
  answerOnlyAccuracy: number;
  failures: Record<string, number>;
  apiFailures: number;
  /** Failures that are the model's own (everything except api_error). */
  modelFailures: number;
  /** Accuracy among requests that did not fail at the API level. */
  accuracyExcludingApiErrors: number | null;
  meanRowAccuracy: number | null;
  tableConsistency: number | null;
}

export interface GroupSummary {
  label: string;
  questions: number;
  a: number;
  b: number;
}

export interface Summary {
  questionsPerMethod: number;
  cases: number;
  families: number;
  runs: number;
  methods: Record<Method, MethodSummary>;
  paired: {
    bothCorrect: number;
    onlyA: number;
    onlyB: number;
    neither: number;
    mcnemarP: number;
    /** B minus A, in accuracy points, with a family-clustered interval. */
    difference: number;
    differenceBootstrap95: Interval;
  };
  byCategory: GroupSummary[];
  bySource: GroupSummary[];
  divergence: GroupSummary;
  /** Answers a model-free rule would get, on the same cases. Not model results. */
  baselines: { name: string; correct: number; total: number; note: string }[];
}

const key = (r: RequestRecord) => `${r.caseId}#${r.run}`;

export function baselineAccuracies(cases: BenchmarkCase[] = benchmarkCases) {
  const rand = seededRandom(7);
  const letterCounts = new Map<string, number>();
  for (const c of cases) letterCounts.set(c.gold.answer, (letterCounts.get(c.gold.answer) ?? 0) + 1);
  const majority = [...letterCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const chanceExpected = cases.reduce((s, c) => s + 1 / c.question.options.length, 0);
  void rand;
  return [
    {
      name: "Guessing at random",
      correct: Math.round(chanceExpected * 10) / 10,
      total: cases.length,
      note: "Expected number correct if every answer were a coin flip or a three-way guess.",
    },
    {
      name: `Always answering "${majority}"`,
      correct: cases.filter((c) => c.gold.answer === majority).length,
      total: cases.length,
      note: "The most common correct letter in this benchmark.",
    },
    {
      name: "Copying the real state of the world",
      correct: cases.filter((c) => c.gold.realityCopyAnswer === c.gold.answer).length,
      total: cases.length,
      note: "Answers as if every character knew what is really true. It only works when no one is mistaken or uninformed, so it fails every false-belief case, as in the paper.",
    },
    {
      name: "The belief engine (oracle)",
      correct: cases.length,
      total: cases.length,
      note: "The deterministic rule engine that produced the gold answers. It is the reference, not a competitor.",
    },
  ];
}

function methodSummary(method: Method, records: RequestRecord[]): MethodSummary {
  const total = records.length;
  const correct = records.filter((r) => r.primaryCorrect).length;
  const failures: Record<string, number> = {};
  for (const o of FAILURE_OUTCOMES) failures[o] = records.filter((r) => r.outcome === o).length;
  const apiFailures = failures.api_error ?? 0;
  const answerOnlyCorrect = records.filter((r) => r.answerOnlyCorrect).length;
  const [wl, wh] = wilson(correct, total);
  const boot = clusterBootstrap(
    records.map((r) => ({ family: getCase(r.caseId).familyId, value: r.primaryCorrect ? 1 : 0 })),
  );
  const rows = records.filter((r) => r.rowAccuracy !== null);
  const consistent = records.filter((r) => r.tableConsistent !== null);
  return {
    method,
    total,
    correct,
    accuracy: total ? correct / total : 0,
    wilson95: { low: wl, high: wh },
    familyBootstrap95: { low: boot.low, high: boot.high },
    answerOnlyCorrect,
    answerOnlyAccuracy: total ? answerOnlyCorrect / total : 0,
    failures,
    apiFailures,
    modelFailures: total - correct - apiFailures,
    accuracyExcludingApiErrors: total - apiFailures > 0 ? correct / (total - apiFailures) : null,
    meanRowAccuracy: rows.length ? rows.reduce((s, r) => s + (r.rowAccuracy ?? 0), 0) / rows.length : null,
    tableConsistency: consistent.length ? consistent.filter((r) => r.tableConsistent).length / consistent.length : null,
  };
}

function group(label: string, ids: Set<string>, A: RequestRecord[], B: RequestRecord[]): GroupSummary {
  const a = A.filter((r) => ids.has(r.caseId));
  const b = B.filter((r) => ids.has(r.caseId));
  return {
    label,
    questions: a.length,
    a: a.filter((r) => r.primaryCorrect).length,
    b: b.filter((r) => r.primaryCorrect).length,
  };
}

export function summarize(records: RequestRecord[], cases: BenchmarkCase[] = benchmarkCases): Summary {
  const A = records.filter((r) => r.method === "A");
  const B = records.filter((r) => r.method === "B");
  const runs = Math.max(0, ...records.map((r) => r.run));

  const aByKey = new Map(A.map((r) => [key(r), r]));
  let bothCorrect = 0;
  let onlyA = 0;
  let onlyB = 0;
  let neither = 0;
  const diffs: { family: string; value: number }[] = [];
  for (const b of B) {
    const a = aByKey.get(key(b));
    if (!a) continue;
    if (a.primaryCorrect && b.primaryCorrect) bothCorrect++;
    else if (a.primaryCorrect) onlyA++;
    else if (b.primaryCorrect) onlyB++;
    else neither++;
    diffs.push({ family: getCase(b.caseId).familyId, value: (b.primaryCorrect ? 1 : 0) - (a.primaryCorrect ? 1 : 0) });
  }
  const diffBoot = clusterBootstrap(diffs);

  const idsWhere = (f: (c: BenchmarkCase) => boolean) => new Set(cases.filter(f).map((c) => c.id));
  const categories: [string, string][] = [
    ["false_belief", "Genuine false belief"],
    ["missing_information", "Missing information"],
    ["true_belief_control", "True belief (control)"],
  ];
  const sources: [string, string][] = [
    ["classic", "Classic tasks"],
    ["library", "Adapted from the scenario library"],
    ["variant", "Variants and Make Your Own examples"],
  ];

  return {
    questionsPerMethod: A.length,
    cases: cases.length,
    families: new Set(cases.map((c) => c.familyId)).size,
    runs,
    methods: { A: methodSummary("A", A), B: methodSummary("B", B) },
    paired: {
      bothCorrect,
      onlyA,
      onlyB,
      neither,
      mcnemarP: mcnemarExact(onlyA, onlyB),
      difference: diffs.length ? diffs.reduce((s, d) => s + d.value, 0) / diffs.length : 0,
      differenceBootstrap95: { low: diffBoot.low, high: diffBoot.high },
    },
    byCategory: categories.map(([k, label]) => group(label, idsWhere((c) => c.category === k), A, B)),
    bySource: sources.map(([k, label]) => group(label, idsWhere((c) => c.source === k), A, B)),
    divergence: group("Belief differs from reality", idsWhere((c) => c.gold.divergence), A, B),
    baselines: baselineAccuracies(cases),
  };
}
