import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { benchmarkCases, casesFingerprint } from "./build";
import { RESULTS_PATH, type LoadedResults } from "./load-results";
import { PROMPT_VERSION } from "./prompts";
import { runBenchmark } from "./runner";
import { scriptedCaller } from "./scripted";
import { summarize } from "./summarize";
import { describeBenchmark } from "./validate";

const mocked = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/benchmark/load-results", async () => {
  const actual = await vi.importActual<typeof import("./load-results")>("./load-results");
  return { ...actual, loadLiveResults: () => mocked.value };
});

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const fast = { retryDelayMs: 0 };

async function page() {
  const { default: Page } = await import("@/app/about-the-science/page");
  return renderToStaticMarkup(<Page />);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, (m) => ({ "&#x27;": "'", "&amp;": "&", "&quot;": '"', "&rsquo;": "'", "&ldquo;": '"', "&rdquo;": '"' })[m] ?? " ").replace(/\s+/g, " ");

async function fakeLive(kind: "oracle" | "reality" | "flaky", over: Partial<LoadedResults["file"]> = {}): Promise<LoadedResults> {
  const { file } = await runBenchmark({ call: scriptedCaller(kind), mode: "dry-run", model: null, concurrency: 1, settings: { apiRetries: 0 }, ...fast });
  const live = { ...file, mode: "live" as const, model: "test-model-id", ...over };
  return { file: live, summary: summarize(live.records), matchesCurrentBenchmark: true };
}

describe("About the Science: before any live run, it shows no results", () => {
  it("the published results file is an empty placeholder (null): there is no data, and nothing pretends there is", () => {
    expect(existsSync(join(ROOT, RESULTS_PATH))).toBe(true);
    expect(JSON.parse(read("src", "data", "benchmark-results.json"))).toBeNull();
  });

  it("says plainly that no live comparison has been run, and shows no accuracy for either method", async () => {
    mocked.value = null;
    const t = text(await page());
    expect(t).toContain("No live comparison has been run yet, so there are no results to show.");
    expect(t).toMatch(/rather show an empty space than a made-up number/);
    expect(t).not.toContain("Results by method");
    expect(t).not.toMatch(/Method A: plain prompting\s+\d+\s+\d+ of/);
    expect(t).not.toContain("Live run.");
  });

  it("labels the free scoring demonstration as NOT an AI evaluation, with no accuracy figure and no winner", async () => {
    mocked.value = null;
    const t = text(await page());
    expect(t).toContain("Demonstration: how a reply is scored (not an AI evaluation)");
    expect(t).toMatch(/made-up replies, not an AI.s\s+answers/);
    expect(t).toMatch(/makes no claim that either method is better/);
    expect(t).not.toMatch(/service key|costs about a cent/i);
    const { scoringExamples } = await import("./demo");
    const ex = scoringExamples();
    expect(ex.map((x) => x.outcome)).toEqual(["correct", "wrong", "unparseable", "correct", "incomplete_table"]);
    expect(ex.map((x) => x.counted)).toEqual(["correct", "not correct", "not correct", "correct", "not correct"]);
  });

  it("still explains the science: the idea, the paper's real findings, the test design and its limits", async () => {
    mocked.value = null;
    const t = text(await page());
    expect(t).toContain("About the Science");
    expect(t).toMatch(/false belief/);
    expect(t).toContain("Sally");
    // the paper's own published numbers, all verified against the PDF
    for (const n of ["13.94% to 25.28%", "0% for all four conditions", "63.89% to 97.22%", "53.72%", "84.76%", "0% on rows where a belief differs from reality"]) {
      expect(t, n).toContain(n);
    }
    expect(t).toMatch(/preliminary/);
    expect(t).toMatch(/not an independent human audit/);
  });

  it("describes the benchmark with the real counts, and does not pretend 26 questions are 26 independent stories", async () => {
    mocked.value = null;
    const d = describeBenchmark(benchmarkCases);
    const t = text(await page());
    expect(t).toContain(`${d.cases} questions, but only ${d.families} different story families`);
    expect(t).toContain(`${d.byCategory.false_belief} false-belief questions`);
    expect(t).toMatch(/one piece of evidence, not several/);
  });

  it("shows the model-free baselines, which are computed facts about the cases and not model results", async () => {
    mocked.value = null;
    const t = text(await page());
    expect(t).toContain("What simple rules score on these same questions");
    expect(t).toContain("Copying the real state of the world");
    expect(t).toMatch(/not AI results/);
    expect(t).toMatch(/Copying the real state of the world\s+8 of 26/);
    expect(t).toMatch(/The belief engine \(oracle\)\s+26 of 26/);
  });

  it("credits the classic tasks and the sources, and never overclaims", async () => {
    mocked.value = null;
    const t = text(await page());
    for (const s of ["Baron-Cohen", "Wimmer", "Perner", "Gopnik", "Doddavarapu"]) expect(t, s).toContain(s);
    expect(t).toMatch(/wording above is original to this project/);
    expect(t).not.toMatch(/\bproves?\b|\bproven\b|significantly outperform|beats the paper|solved|human-level|understands people like/i);
    expect(t).toMatch(/cannot show that belief tracking .?works.? in general/);
  });

  it("uses accessible tables: captions, column and row headers, and a scrollable labelled region", async () => {
    mocked.value = null;
    const html = await page();
    expect((html.match(/<caption/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('role="region"');
    expect(html).toMatch(/tabindex="0"/i);
    expect(html).not.toMatch(/whitespace-nowrap/);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });
});

describe("About the Science: when a genuine live run is published", () => {
  it("shows exactly the numbers in the records, with the model, the date, the uncertainty and the caveats", async () => {
    const live = await fakeLive("flaky");
    mocked.value = live;
    const t = text(await page());
    const a = live.summary.methods.A;
    const b = live.summary.methods.B;
    expect(t).toContain("Live run.");
    expect(t).toContain("test-model-id");
    expect(t).toContain("they are preliminary and the uncertainty is large");
    expect(t).toContain("Results by method");
    expect(t).toContain(`${a.correct} of ${a.total}`);
    expect(t).toContain(`${b.correct} of ${b.total}`);
    expect(t).toContain((a.accuracy * 100).toFixed(1) + "%");
    expect(t).toContain((b.accuracy * 100).toFixed(1) + "%");
    expect(t).toContain(`${live.summary.questionsPerMethod} questions per method in ${live.summary.families} families`);
    expect(t).not.toContain("No live comparison has been run yet");
    // failures are all listed, API failures in their own column
    expect(t).toMatch(/API failures/);
    expect(t).toMatch(/api error: \d+/);
    expect(t).toMatch(/Answer-only accuracy/);
  });

  it("reports a null or discouraging result just as plainly (a reader that only copies the world)", async () => {
    mocked.value = await fakeLive("reality");
    const t = text(await page());
    expect(t).toContain("30.8%");
    expect(t).toMatch(/Belief differs from reality[^.]*key measure[^0-9]*18\s+0\s+0/);
    expect(t).toContain("Method B minus Method A: 0.0 percentage points");
    expect(t).not.toMatch(/improv|better than/i);
  });

  it("warns when the benchmark has changed since the results were produced", async () => {
    const live = await fakeLive("oracle");
    mocked.value = { ...live, matchesCurrentBenchmark: false };
    expect(text(await page())).toMatch(/the test questions or prompts have changed since this run/);
  });
});

// The page tests above replace the loader with a stand-in. These tests need the REAL one.
const realModule = () => vi.importActual<typeof import("./load-results")>("./load-results");

describe("only genuine live results can ever be displayed", () => {
  it("accepts a valid live run, and recomputes the summary from the records (ignoring any claimed summary)", async () => {
    const { parseLiveResults } = await realModule();
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "live", model: "m", concurrency: 1, ...fast });
    const got = parseLiveResults({ ...file, summaryClaim: "100% BEST" });
    expect(got).not.toBeNull();
    expect(got!.summary.methods.A.correct).toBe(26);
    expect(got!.matchesCurrentBenchmark).toBe(true);
    expect(got!.file.casesFingerprint).toBe(casesFingerprint());
    expect(got!.file.promptVersion).toBe(PROMPT_VERSION);
  });

  it("refuses a dry run, however it is labelled", async () => {
    const { parseLiveResults } = await realModule();
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "dry-run", model: null, dryRunKind: "oracle", ...fast });
    expect(parseLiveResults(file)).toBeNull();
    // a dry run edited to look live, but with no model named, is also refused
    expect(parseLiveResults({ ...file, mode: "live" })).toBeNull();
  });

  it("refuses empty, corrupt and malformed data without crashing", async () => {
    const { parseLiveResults } = await realModule();
    expect(parseLiveResults(null)).toBeNull(); // the committed placeholder
    expect(parseLiveResults(undefined)).toBeNull();
    expect(parseLiveResults("{not json")).toBeNull();
    expect(parseLiveResults([])).toBeNull();
    expect(parseLiveResults({ mode: "live", model: "m" })).toBeNull();
  });

  it("the committed placeholder gives no results to the page", async () => {
    const { loadLiveResults } = await realModule();
    expect(loadLiveResults()).toBeNull();
  });

  it("flags results made with different cases or prompts", async () => {
    const { parseLiveResults } = await realModule();
    const { file } = await runBenchmark({ call: scriptedCaller("oracle"), mode: "live", model: "m", concurrency: 1, ...fast });
    expect(parseLiveResults({ ...file, casesFingerprint: "00000000" })!.matchesCurrentBenchmark).toBe(false);
    expect(parseLiveResults({ ...file, promptVersion: "0.1" })!.matchesCurrentBenchmark).toBe(false);
  });

  it("dry-run outputs are git-ignored, so a rehearsal cannot be committed by accident", () => {
    expect(read(".gitignore")).toMatch(/docs\/benchmark\/dry-run-\*\.json/);
  });
});

describe("the protocol was written first and matches the benchmark", () => {
  const protocol = read("docs", "benchmark", "PROTOCOL.md");

  it("fixes the primary metric, the failure rules and the settings in advance", () => {
    expect(protocol).toMatch(/written, and committed to git, \*\*before any live model run\*\*/);
    expect(protocol).toMatch(/Primary metric/);
    for (const o of ["api_error", "refusal", "truncated", "unparseable", "malformed", "incomplete_table", "wrong"]) expect(protocol).toContain(o);
    expect(protocol).toMatch(/API failures are reported separately/);
    expect(protocol).toMatch(/No case, family, or request is removed after seeing results/);
    expect(protocol).toMatch(/reported exactly as\s+prominently/);
    expect(protocol).toMatch(/hidden reasoning/i);
    expect(protocol).toContain("8,000 tokens");
    expect(protocol).toMatch(/not.*independent human audit|Not independently human-audited/i);
    expect(protocol).toMatch(/## Deviations\s+None so far\./);
  });

  it("its numbers are the benchmark's numbers", () => {
    const d = describeBenchmark(benchmarkCases);
    expect(protocol).toContain(`**${d.cases} cases in ${d.families} story families.**`);
    expect(protocol).toContain(`${d.byCategory.false_belief} genuine false-belief cases, ${d.byCategory.missing_information} missing-information cases, ${d.byCategory.true_belief_control} true-belief controls`);
  });
});

describe("the command-line runner", () => {
  const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const run = (args: string[], env: Record<string, string | undefined> = {}) =>
    spawnSync(process.execPath, [tsx, join(ROOT, "scripts", "benchmark.ts"), ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, ...env },
      timeout: 60_000,
    });

  it("by default validates and prices the run, and sends nothing", () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Benchmark validation: passed/);
    expect(r.stdout).toMatch(/Live run plan: model claude-haiku-5-5, 52 requests/);
    expect(r.stdout).toMatch(/Nothing was sent/);
  });

  it("will not spend without a key, even with --confirm-spend, and never prints a key", () => {
    const r = run(["--confirm-spend"], { ANTHROPIC_API_KEY: "" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ANTHROPIC_API_KEY is not set, so nothing was sent/);
    expect(r.stdout + r.stderr).not.toMatch(/sk-ant/);
  });

  it("a dry run is clearly labelled as not a result, and is written where git ignores it", () => {
    const r = run(["--dry-run", "oracle"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/DRY RUN with a scripted stand-in\. This is NOT a result about any AI model\./);
    const out = JSON.parse(readFileSync(join(ROOT, "docs", "benchmark", "dry-run-oracle.json"), "utf8"));
    expect(out.mode).toBe("dry-run");
    expect(out.model).toBeNull();
  });

  it("rejects an unknown dry-run kind", () => {
    expect(run(["--dry-run", "fantasy"]).status).toBe(1);
  });

  it("the live code path needs both the flag and a key before anything could be sent", () => {
    const script = read("scripts", "benchmark.ts");
    expect(script.indexOf("--confirm-spend") < script.indexOf("liveCaller(apiKey")).toBe(true);
    expect(script).toMatch(/if \(!flag\("confirm-spend"\)\)/);
    expect(script).toMatch(/if \(!apiKey\)/);
    execFileSync(process.execPath, ["-e", "0"]); // keep execFileSync import used on all platforms
  });
});

describe("the two methods use one model call", () => {
  it("the live caller is a single function for both methods, with reasoning disabled", () => {
    const live = read("src", "benchmark", "live.ts");
    expect((live.match(/messages\.create\(/g) ?? []).length).toBe(1);
    expect(live).toMatch(/thinking: \{ type: "disabled" \}/);
    expect(live).not.toMatch(/temperature|top_p|top_k/);
    expect(live).toMatch(/max_tokens: settings\.maxTokens/);
  });

  it("no source file in the benchmark can read or print a key", () => {
    const dir = join(ROOT, "src", "benchmark");
    for (const f of readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile() && n.endsWith(".ts"))) {
      const code = readFileSync(join(dir, f), "utf8");
      expect(code, f).not.toMatch(/console\.(log|error|info).*apiKey/);
      if (f !== "live.ts") expect(code, f).not.toMatch(/process\.env\.ANTHROPIC/);
    }
  });
});
