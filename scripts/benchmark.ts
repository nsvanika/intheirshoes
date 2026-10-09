/**
 * "Proof It Works" runner.
 *
 *   npm run benchmark                                   rehearsal: validates, shows the cost, spends nothing
 *   npm run benchmark -- --dry-run oracle|reality|random|flaky   free pipeline test (NOT a result)
 *   npm run benchmark -- --confirm-spend [--runs N] [--publish]   the live run (needs ANTHROPIC_API_KEY)
 *
 * Nothing is sent to any model unless --confirm-spend is given AND a key is set. The key is read from
 * the environment only and is never printed or written anywhere.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { benchmarkCases } from "../src/benchmark/build";
import { BENCHMARK_MODEL, liveCaller } from "../src/benchmark/live";
import { estimateCost, formatSummary } from "../src/benchmark/report";
import { DEFAULT_SETTINGS, runBenchmark, type ResultsFile } from "../src/benchmark/runner";
import { scriptedCaller, type ScriptKind } from "../src/benchmark/scripted";
import { summarize } from "../src/benchmark/summarize";
import { describeBenchmark, validateBenchmark } from "../src/benchmark/validate";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const issues = validateBenchmark(benchmarkCases);
  const d = describeBenchmark(benchmarkCases);
  console.log(`Benchmark: ${d.cases} cases in ${d.families} families (${JSON.stringify(d.byCategory)})`);
  if (issues.length > 0) {
    console.error("The benchmark is NOT valid:\n- " + issues.join("\n- "));
    process.exit(1);
  }
  console.log("Benchmark validation: passed (every gold answer checked against an independent reference).");

  const runs = Math.max(1, Number(value("runs") ?? 1));
  const settings = { ...DEFAULT_SETTINGS, runs };
  const dir = join(process.cwd(), "docs", "benchmark");

  const dry = value("dry-run") as ScriptKind | undefined;
  if (dry) {
    if (!["oracle", "reality", "random", "flaky"].includes(dry)) throw new Error("--dry-run must be oracle, reality, random or flaky");
    const { file } = await runBenchmark({ call: scriptedCaller(dry), mode: "dry-run", model: null, dryRunKind: dry, settings, retryDelayMs: 0 });
    const path = join(dir, `dry-run-${dry}.json`);
    writeFileSync(path, JSON.stringify(file, null, 1));
    console.log("\n=== DRY RUN with a scripted stand-in. This is NOT a result about any AI model. ===\n");
    console.log(formatSummary(summarize(file.records)));
    console.log(`\nWritten to ${path} (git-ignored). The About page never shows dry runs.`);
    return;
  }

  const model = process.env.ANTHROPIC_MODEL || BENCHMARK_MODEL;
  const cost = estimateCost(benchmarkCases, runs);
  console.log(
    `\nLive run plan: model ${model}, ${cost.requests} requests (${benchmarkCases.length} cases x 2 methods x ${runs} run(s)), ` +
      `about ${cost.inputTokens.toLocaleString()} input and ${cost.outputTokens.toLocaleString()} output tokens, ` +
      `roughly $${cost.dollars.toFixed(2)} (an estimate).`,
  );

  if (!flag("confirm-spend")) {
    console.log("\nNothing was sent. To run it for real, add --confirm-spend (and set ANTHROPIC_API_KEY).");
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("\nANTHROPIC_API_KEY is not set, so nothing was sent. Set it in your own terminal; never paste a key into a chat or a file in this repo.");
    process.exit(1);
  }

  let last = 0;
  const { file, raw } = await runBenchmark({
    call: liveCaller(apiKey, model, settings),
    mode: "live",
    model,
    settings,
    onProgress: (done, total) => {
      if (done - last >= 10 || done === total) {
        last = done;
        console.log(`  ${done}/${total} requests finished`);
      }
    },
  });

  mkdirSync(join(dir, "results"), { recursive: true });
  const stamp = file.createdAt.replace(/[:.]/g, "-");
  const full = join(dir, "results", `live-${stamp}.json`);
  writeFileSync(full, JSON.stringify({ ...file, raw }, null, 1));
  console.log("\n" + formatSummary(summarize(file.records)));
  console.log(`\nFull record, including every reply, written to ${full}`);

  if (flag("publish")) {
    const published: ResultsFile = file; // scores only; no reply text
    writeFileSync(join(process.cwd(), "src", "data", "benchmark-results.json"), JSON.stringify(published, null, 1));
    console.log("Published to src/data/benchmark-results.json. Rebuild the site to show it on the About the Science page.");
  } else {
    console.log("Not published. Add --publish to show these results on the About the Science page.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
