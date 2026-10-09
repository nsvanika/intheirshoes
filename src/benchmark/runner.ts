import { z } from "zod";
import { benchmarkCases, casesFingerprint, type BenchmarkCase } from "./build";
import { evaluateReply, type RawReply } from "./evaluate";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildPrompt, type Method } from "./prompts";
import type { RequestRecord } from "./summarize";
import { validateBenchmark, validateEach } from "./validate";

/**
 * Runs both methods on every case with the SAME model and the SAME settings, scores every reply
 * with the same strict rules, and keeps every request, including failed ones.
 */

export interface ModelReply {
  text: string;
  stopReason: string | null;
  inputTokens?: number;
  outputTokens?: number;
}
/** Sends one request. Throws if the request itself fails. */
export type ModelCall = (system: string, user: string) => Promise<ModelReply>;

export interface RunSettings {
  maxTokens: number;
  thinking: string;
  effort: string;
  /** Sampling settings are left at the model's defaults for both methods (the model does not allow changing them). */
  sampling: string;
  runs: number;
  /** How many times a request that FAILED AT THE API LEVEL is retried (identical request). */
  apiRetries: number;
}

export const DEFAULT_SETTINGS: RunSettings = {
  maxTokens: 8000,
  thinking: "disabled (no hidden reasoning; the only visible difference between methods is the table)",
  effort: "low",
  sampling: "model defaults, identical for both methods",
  runs: 1,
  apiRetries: 2,
};

export const RecordSchema = z.object({
  caseId: z.string(),
  method: z.enum(["A", "B"]),
  run: z.number().int().min(1),
  outcome: z.enum(["correct", "wrong", "api_error", "refusal", "truncated", "unparseable", "malformed", "invalid_answer", "incomplete_table"]),
  answer: z.enum(["A", "B", "C"]).nullable(),
  primaryCorrect: z.boolean(),
  answerOnlyCorrect: z.boolean(),
  rowAccuracy: z.number().nullable(),
  tableConsistent: z.boolean().nullable(),
  attempts: z.number().int().min(1),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
});

export const ResultsFileSchema = z.object({
  schemaVersion: z.literal(1),
  /** "live" = a real model was called. "dry-run" = a scripted stand-in; NEVER presented as a result. */
  mode: z.enum(["live", "dry-run"]),
  dryRunKind: z.string().optional(),
  createdAt: z.string(),
  model: z.string().nullable(),
  promptVersion: z.string(),
  casesFingerprint: z.string(),
  settings: z.object({
    maxTokens: z.number(),
    thinking: z.string(),
    effort: z.string(),
    sampling: z.string(),
    runs: z.number(),
    apiRetries: z.number(),
  }),
  records: z.array(RecordSchema),
});
export type ResultsFile = z.infer<typeof ResultsFileSchema>;

export interface RawText {
  caseId: string;
  method: Method;
  run: number;
  text: string;
}

export interface RunOptions {
  call: ModelCall;
  mode: "live" | "dry-run";
  model: string | null;
  dryRunKind?: string;
  cases?: BenchmarkCase[];
  settings?: Partial<RunSettings>;
  concurrency?: number;
  retryDelayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runBenchmark(opts: RunOptions): Promise<{ file: ResultsFile; raw: RawText[] }> {
  const cases = opts.cases ?? benchmarkCases;
  // The full benchmark must satisfy every rule; a deliberately chosen subset still must be valid case by case.
  const issues = opts.cases ? validateEach(cases) : validateBenchmark(cases);
  if (issues.length > 0) throw new Error(`The benchmark is not valid, so it will not be run:\n- ${issues.join("\n- ")}`);

  const settings: RunSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const jobs: { c: BenchmarkCase; method: Method; run: number }[] = [];
  for (let run = 1; run <= settings.runs; run++) {
    for (const c of cases) for (const method of ["A", "B"] as const) jobs.push({ c, method, run });
  }

  const records: RequestRecord[] = new Array(jobs.length);
  const raw: RawText[] = [];
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < jobs.length) {
      const index = next++;
      const { c, method, run } = jobs[index];
      const prompt = buildPrompt(method, c);
      let reply: RawReply;
      let usage: Pick<ModelReply, "inputTokens" | "outputTokens"> = {};
      let attempts = 0;
      for (;;) {
        attempts++;
        try {
          const r = await opts.call(SYSTEM_PROMPT, prompt);
          reply = { text: r.text, stopReason: r.stopReason };
          usage = { inputTokens: r.inputTokens, outputTokens: r.outputTokens };
          break;
        } catch (err) {
          // Only the API request is retried. A bad ANSWER is never retried: it is a result.
          if (attempts > settings.apiRetries) {
            reply = { error: err instanceof Error ? err.name : "error" };
            break;
          }
          await sleep((opts.retryDelayMs ?? 1000) * attempts);
        }
      }
      const ev = evaluateReply(method, c, reply);
      if (reply.text !== undefined) raw.push({ caseId: c.id, method, run, text: reply.text });
      records[index] = {
        caseId: c.id,
        method,
        run,
        outcome: ev.outcome,
        answer: ev.answer,
        primaryCorrect: ev.primaryCorrect,
        answerOnlyCorrect: ev.answerOnlyCorrect,
        rowAccuracy: ev.rowAccuracy,
        tableConsistent: ev.tableConsistent,
        attempts,
        ...usage,
      };
      opts.onProgress?.(++done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, worker));

  return {
    file: {
      schemaVersion: 1,
      mode: opts.mode,
      dryRunKind: opts.dryRunKind,
      createdAt: new Date().toISOString(),
      model: opts.model,
      promptVersion: PROMPT_VERSION,
      casesFingerprint: casesFingerprint(cases),
      settings,
      records,
    },
    raw,
  };
}
