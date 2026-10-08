"use client";

import { useSyncExternalStore } from "react";
import {
  PROGRESS_CHANGED_EVENT,
  PROGRESS_CLEARED_EVENT,
  getScenarioProgress,
} from "@/lib/progress";

/**
 * A small "where you left off" note on a scenario card. It reads this browser's saved progress
 * after the page loads (the server always renders nothing here, so there is no hydration
 * mismatch) and updates if progress changes or is cleared.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(PROGRESS_CHANGED_EVENT, onChange);
  window.addEventListener(PROGRESS_CLEARED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PROGRESS_CHANGED_EVENT, onChange);
    window.removeEventListener(PROGRESS_CLEARED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function ProgressBadge({ scenarioId }: { scenarioId: string }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getScenarioProgress(scenarioId)),
    () => "null",
  );
  const progress = JSON.parse(snapshot) as { step: number; total: number } | null;
  if (!progress) return null;

  const finished = progress.step >= progress.total;
  return (
    <span className="mt-3 inline-flex w-fit rounded-full border border-slate-500 bg-white px-2 py-0.5 text-xs font-medium text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50">
      {finished ? "Finished" : `Saved: step ${progress.step} of ${progress.total}`}
    </span>
  );
}
