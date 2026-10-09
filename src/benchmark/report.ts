import type { BenchmarkCase } from "./build";
import { buildPrompt, requiredRowCount } from "./prompts";
import type { Summary } from "./summarize";

/** Plain-text report for the command line. The About page presents the same numbers for people. */

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatSummary(s: Summary): string {
  const line = (m: "A" | "B") => {
    const x = s.methods[m];
    return [
      `  Method ${m} (${m === "A" ? "plain prompting" : "explicit belief table"})`,
      `    questions asked          ${x.total}`,
      `    correct (primary)        ${x.correct}  =  ${pct(x.accuracy)}   family-bootstrap 95% CI ${pct(x.familyBootstrap95.low)} to ${pct(x.familyBootstrap95.high)}`,
      `    answer-only (secondary)  ${x.answerOnlyCorrect}  =  ${pct(x.answerOnlyAccuracy)}`,
      `    failures                 ${Object.entries(x.failures).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(", ") || "none"}`,
      `    API failures (separate)  ${x.apiFailures}   model's own failures: ${x.modelFailures}`,
      ...(x.meanRowAccuracy !== null ? [`    table row accuracy       ${pct(x.meanRowAccuracy)}   table agrees with its own answer: ${pct(x.tableConsistency ?? 0)}`] : []),
    ].join("\n");
  };
  return [
    `${s.questionsPerMethod} questions per method, ${s.cases} cases, ${s.families} families, ${s.runs} run(s)`,
    line("A"),
    line("B"),
    `  Paired: both right ${s.paired.bothCorrect}, only A ${s.paired.onlyA}, only B ${s.paired.onlyB}, neither ${s.paired.neither}; exact McNemar p = ${s.paired.mcnemarP.toFixed(4)}`,
    `  B minus A: ${(s.paired.difference * 100).toFixed(1)} points (family-bootstrap 95% CI ${(s.paired.differenceBootstrap95.low * 100).toFixed(1)} to ${(s.paired.differenceBootstrap95.high * 100).toFixed(1)})`,
    "  Where belief differs from reality: " + `A ${s.divergence.a}/${s.divergence.questions}, B ${s.divergence.b}/${s.divergence.questions}`,
    "  Baselines (not model results): " + s.baselines.map((b) => `${b.name} ${b.correct}/${b.total}`).join("; "),
  ].join("\n");
}

/** A rough cost estimate, so nobody spends money without seeing it first. Prices: $0.10 / $0.50 per million tokens. */
export function estimateCost(cases: BenchmarkCase[], runs: number) {
  let input = 0;
  let output = 0;
  for (const c of cases) {
    input += Math.ceil((buildPrompt("A", c).length + 200) / 4) + Math.ceil((buildPrompt("B", c).length + 200) / 4);
    output += 20 + requiredRowCount(c) * 22;
  }
  input *= runs;
  output *= runs;
  const dollars = (input * 0.1 + output * 0.5) / 1_000_000;
  return { requests: cases.length * 2 * runs, inputTokens: input, outputTokens: output, dollars };
}
