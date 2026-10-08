import { readJson, removeKey, writeJson } from "./storage";

/**
 * Scenario progress, saved in this browser only (localStorage). There are no accounts, no
 * database and no server-side progress.
 *
 * What is saved, per built-in scenario: the current step, the total number of steps, and for each
 * prediction question the student has answered, the id of the choice they picked (a, b or c).
 * That is all. The scenario ids and question ids are fixed, public identifiers.
 *
 * What is NEVER saved: anything a person typed, names, generated stories, or any story text.
 * "Make Your Own" stories are not saved at all (their id is refused below).
 */

export const PROGRESS_KEY = "intheirshoes:progress:v1";
export const PROGRESS_CLEARED_EVENT = "intheirshoes:progress-cleared";
export const PROGRESS_CHANGED_EVENT = "intheirshoes:progress-changed";

/** The id used for user-made stories. It is never written to storage. */
export const CUSTOM_SCENARIO_ID = "custom-scenario";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SCENARIOS = 50;
const MAX_ANSWERS = 20;

export type SavedChoice = "a" | "b" | "c";

export interface ScenarioProgress {
  step: number;
  total: number;
  answers: Record<string, SavedChoice>;
}

export interface ProgressStore {
  scenarios: Record<string, ScenarioProgress>;
}

const isChoice = (v: unknown): v is SavedChoice => v === "a" || v === "b" || v === "c";

function parseScenario(raw: unknown): ScenarioProgress | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const { step, total } = o;
  if (!Number.isInteger(step) || !Number.isInteger(total)) return null;
  if ((total as number) < 1 || (total as number) > 50) return null;
  if ((step as number) < 1 || (step as number) > (total as number)) return null;

  const answers: Record<string, SavedChoice> = {};
  if (typeof o.answers === "object" && o.answers !== null) {
    for (const [id, choice] of Object.entries(o.answers as Record<string, unknown>).slice(0, MAX_ANSWERS)) {
      if (ID.test(id) && isChoice(choice)) answers[id] = choice;
    }
  }
  return { step: step as number, total: total as number, answers };
}

/** Defensive: anything unexpected is dropped, so corrupt storage can never crash or inject. */
export function parseProgress(raw: unknown): ProgressStore {
  const scenarios: Record<string, ScenarioProgress> = {};
  const source =
    typeof raw === "object" && raw !== null ? (raw as { scenarios?: unknown }).scenarios : undefined;
  if (typeof source === "object" && source !== null) {
    for (const [id, value] of Object.entries(source as Record<string, unknown>).slice(0, MAX_SCENARIOS)) {
      if (!ID.test(id) || id === CUSTOM_SCENARIO_ID) continue;
      const parsed = parseScenario(value);
      if (parsed) scenarios[id] = parsed;
    }
  }
  return { scenarios };
}

export function loadProgress(): ProgressStore {
  return parseProgress(readJson(PROGRESS_KEY));
}

export function getScenarioProgress(scenarioId: string): ScenarioProgress | null {
  return loadProgress().scenarios[scenarioId] ?? null;
}

/** Returns false when nothing was saved (storage unavailable, or the id is not allowed). */
export function saveScenarioProgress(scenarioId: string, progress: ScenarioProgress): boolean {
  if (!ID.test(scenarioId) || scenarioId === CUSTOM_SCENARIO_ID) return false;
  const clean = parseScenario(progress);
  if (!clean) return false;
  const store = loadProgress();
  store.scenarios[scenarioId] = clean;
  const saved = writeJson(PROGRESS_KEY, store);
  if (saved && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT));
  return saved;
}

export function removeScenarioProgress(scenarioId: string): boolean {
  const store = loadProgress();
  if (!(scenarioId in store.scenarios)) return true;
  delete store.scenarios[scenarioId];
  const saved = writeJson(PROGRESS_KEY, store);
  if (saved && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT));
  return saved;
}

/**
 * Removes all saved progress and tells every open piece of the interface to reset, even if
 * storage turned out to be unavailable (the on-screen state is still cleared).
 */
export function clearProgress(): boolean {
  const removed = removeKey(PROGRESS_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_CLEARED_EVENT));
  return removed;
}
