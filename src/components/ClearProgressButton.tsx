"use client";

import { useState } from "react";
import { clearProgress } from "@/lib/progress";

/**
 * "Clear My Progress": removes the saved place in every scenario from this browser and resets
 * any scenario that is open on screen. It does not touch accessibility settings.
 */
export default function ClearProgressButton({ className }: { className?: string }) {
  const [message, setMessage] = useState("");

  function onClick() {
    const removed = clearProgress();
    setMessage(
      removed
        ? "Your saved progress was cleared."
        : "This browser isn't saving anything, so there was nothing to clear. The screen was reset.",
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={
          className ??
          "min-h-12 rounded-lg border border-slate-400 bg-white px-5 py-2 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
        }
      >
        Clear My Progress
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        {message}
      </p>
    </div>
  );
}
