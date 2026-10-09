import published from "@/data/benchmark-results.json";
import { casesFingerprint } from "./build";
import { PROMPT_VERSION } from "./prompts";
import { ResultsFileSchema, type ResultsFile } from "./runner";
import { summarize, type Summary } from "./summarize";

/**
 * Reads the published LIVE results for the About the Science page, if there are any.
 *
 * src/data/benchmark-results.json is committed as `null`, an empty placeholder with no data in it. A
 * live run published with `npm run benchmark -- --confirm-spend --publish` replaces it. The page
 * shows results only when the data is valid and was made with mode "live" (a real model). Dry runs,
 * which use scripted stand-ins, are refused here so they can never appear as findings. The summary
 * is always recomputed from the raw per-request records.
 */
export const RESULTS_PATH = "src/data/benchmark-results.json";

export interface LoadedResults {
  file: ResultsFile;
  summary: Summary;
  /** False if the benchmark or prompts have changed since these results were produced. */
  matchesCurrentBenchmark: boolean;
}

/** Validates raw data as live results. Anything else, including a dry run, gives null. */
export function parseLiveResults(raw: unknown): LoadedResults | null {
  const checked = ResultsFileSchema.safeParse(raw);
  if (!checked.success) return null;
  const file = checked.data;
  if (file.mode !== "live" || !file.model) return null; // never show a dry run as a result
  return {
    file,
    summary: summarize(file.records),
    matchesCurrentBenchmark: file.casesFingerprint === casesFingerprint() && file.promptVersion === PROMPT_VERSION,
  };
}

export function loadLiveResults(): LoadedResults | null {
  return parseLiveResults(published);
}
