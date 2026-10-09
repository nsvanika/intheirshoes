import type { BenchmarkCase } from "./build";

/**
 * Checks the benchmark itself, so a bad or misleading case cannot slip in. Used by the tests and
 * by the runner (which refuses to run an invalid benchmark).
 */

const STOP = new Set(["the", "and", "that", "this", "with", "for", "his", "her", "their", "she", "him", "they", "who", "was", "were", "has", "have", "not", "but", "from", "into", "than", "then", "when", "while"]);

function words(c: BenchmarkCase): Set<string> {
  return new Set(
    c.sentences
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

export interface SimilarityReport {
  /** Highest word overlap between two cases from DIFFERENT families (these must look independent). */
  maxAcrossFamilies: { a: string; b: string; value: number };
  /** Highest word overlap between two cases in the SAME family (expected to be high; they are not independent). */
  maxWithinFamily: { a: string; b: string; value: number };
}

export function similarityReport(cases: BenchmarkCase[]): SimilarityReport {
  const w = new Map(cases.map((c) => [c.id, words(c)]));
  const best = {
    across: { a: "", b: "", value: 0 },
    within: { a: "", b: "", value: 0 },
  };
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const value = jaccard(w.get(cases[i].id)!, w.get(cases[j].id)!);
      const slot = cases[i].familyId === cases[j].familyId ? best.within : best.across;
      if (value > slot.value) Object.assign(slot, { a: cases[i].id, b: cases[j].id, value });
    }
  }
  return { maxAcrossFamilies: best.across, maxWithinFamily: best.within };
}

/** Two cases from different families must overlap less than this, or they are near-duplicates. */
export const MAX_CROSS_FAMILY_SIMILARITY = 0.5;
export const MAX_CASES_PER_FAMILY = 3;

/** Checks every case on its own. Always applied, including when only some cases are run. */
export function validateEach(cases: BenchmarkCase[]): string[] {
  const issues: string[] = [];
  const add = (m: string) => issues.push(m);

  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) add(`${c.id}: duplicate id`);
    ids.add(c.id);

    if (c.sentences.length < 2) add(`${c.id}: story is too short`);
    if (c.sentences.some((s) => !s.trim())) add(`${c.id}: empty sentence`);
    if (!c.familyId) add(`${c.id}: no family id`);
    if (!c.question.text.includes(c.question.targetCharacterName)) add(`${c.id}: question does not name the character`);
    if (!c.sentences.join(" ").includes(c.question.targetCharacterName)) add(`${c.id}: the character is not in the story`);

    const letters = c.question.options.map((o) => o.letter);
    if (c.question.options.length < 2 || c.question.options.length > 3) add(`${c.id}: needs 2 or 3 options`);
    if (new Set(c.question.options.map((o) => o.key)).size !== c.question.options.length) add(`${c.id}: repeated option`);
    if (!letters.includes(c.gold.answer)) add(`${c.id}: gold answer is not one of the options`);
    if (!c.gold.explanation.trim()) add(`${c.id}: no explanation`);

    const v = c.gold.validation;
    if (!v.independentCheck.agrees) add(`${c.id}: the independent reference disagrees with the engine`);
    if (!v.selfContained) add(`${c.id}: story depends on hidden starting beliefs or facts`);
    if (!v.schemaValid) add(`${c.id}: structured story fails the schema`);
    if (!v.declaredCategoryMatchesDerived) add(`${c.id}: the declared category does not match the engine's`);

    if (c.category === "false_belief" && !c.gold.divergence) add(`${c.id}: a false-belief case must differ from reality`);
    if (c.category === "true_belief_control" && c.gold.divergence) add(`${c.id}: a control must match reality`);
    if (c.category === "false_belief" && c.gold.realityCopyAnswer === c.gold.answer) {
      add(`${c.id}: copying the world state would already answer a false-belief case`);
    }
    if (c.source === "classic" && !c.citation) add(`${c.id}: a classic task needs its attribution`);
  }
  return issues;
}

/** Checks the benchmark as a whole: its mix, its families, and that it really is independent. */
export function validateComposition(cases: BenchmarkCase[]): string[] {
  const issues: string[] = [];
  const add = (m: string) => issues.push(m);

  // genuine false beliefs, not only missing information
  const fb = cases.filter((c) => c.category === "false_belief").length;
  if (fb < 8) add(`only ${fb} genuine false-belief cases (need at least 8)`);
  if (cases.filter((c) => c.category === "missing_information").length < 4) add("too few missing-information cases");
  if (cases.filter((c) => c.category === "true_belief_control").length < 4) add("too few true-belief controls");

  // Sally-Anne must be present, with attribution
  const sally = cases.find((c) => c.familyId === "classic-sally-anne" && c.category === "false_belief");
  if (!sally) add("no Sally-Anne false-belief case");
  else if (!/Baron-Cohen/.test(sally.citation ?? "") || !/Wimmer/.test(sally.citation ?? "")) add("Sally-Anne is not properly attributed");

  // 20 adapted cases from the existing library and its examples, plus the classic tasks
  const adapted = cases.filter((c) => c.source !== "classic").length;
  if (adapted !== 20) add(`expected 20 adapted cases, found ${adapted}`);

  // family structure: related stories must not be counted as independent evidence
  const byFamily = new Map<string, BenchmarkCase[]>();
  for (const c of cases) byFamily.set(c.familyId, [...(byFamily.get(c.familyId) ?? []), c]);
  for (const [family, members] of byFamily) {
    if (members.length > MAX_CASES_PER_FAMILY) add(`family ${family} has ${members.length} cases`);
  }
  if (byFamily.size >= cases.length) add("every case is its own family, so families are not being tracked");
  const sim = similarityReport(cases);
  if (sim.maxAcrossFamilies.value >= MAX_CROSS_FAMILY_SIMILARITY) {
    add(`near-duplicate stories in different families: ${sim.maxAcrossFamilies.a} and ${sim.maxAcrossFamilies.b} (${sim.maxAcrossFamilies.value.toFixed(2)})`);
  }

  // the answer letters should not give the answer away by position
  const count = (l: string) => cases.filter((c) => c.gold.answer === l).length;
  for (const l of ["A", "B", "C"]) if (count(l) < 3) add(`answer ${l} is the gold answer in only ${count(l)} cases`);
  if (Math.max(count("A"), count("B"), count("C")) / cases.length > 0.55) add("one answer letter is the gold answer too often");

  return issues;
}

/** Everything: each case, then the whole set. */
export function validateBenchmark(cases: BenchmarkCase[]): string[] {
  return [...validateEach(cases), ...validateComposition(cases)];
}

export function describeBenchmark(cases: BenchmarkCase[]) {
  const by = <K extends string>(f: (c: BenchmarkCase) => K) => {
    const out = {} as Record<K, number>;
    for (const c of cases) out[f(c)] = (out[f(c)] ?? 0) + 1;
    return out;
  };
  return {
    cases: cases.length,
    families: new Set(cases.map((c) => c.familyId)).size,
    byCategory: by((c) => c.category),
    bySource: by((c) => c.source),
    divergenceCases: cases.filter((c) => c.gold.divergence).length,
    adaptedCases: cases.filter((c) => c.source !== "classic").length,
    similarity: similarityReport(cases),
  };
}
