"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ClearProgressButton from "@/components/ClearProgressButton";
import {
  DEFAULT_SETTINGS,
  SERVER_SETTINGS_SNAPSHOT,
  applySettings,
  getSettingsSnapshot,
  parseSettings,
  subscribeSettings,
  updateSettings,
  type A11ySettings,
} from "@/lib/settings";

/**
 * The accessibility settings panel, available from the header of every page.
 *
 *  - A disclosure (a button with aria-expanded) that opens the panel inline in the page flow, so
 *    it never covers content or traps focus, and works at any text size on a phone.
 *  - Real checkboxes with labels and descriptions; Escape closes it and returns focus.
 *  - Choices are saved in this browser only (localStorage) and applied to every page, including
 *    after a refresh. If storage is blocked, the choice still works for this visit and the
 *    panel says it won't be remembered.
 *  - Reduced motion follows the device setting automatically.
 */

function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const CHECK_ROW =
  "flex cursor-pointer items-start gap-3 rounded-lg border border-slate-400 bg-white p-4 dark:border-slate-500 dark:bg-slate-900";
const BUTTON =
  "min-h-12 rounded-lg border border-slate-400 bg-white px-5 py-2 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700";

export default function AccessibilitySettings() {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [notSaved, setNotSaved] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, () => SERVER_SETTINGS_SNAPSHOT);
  const settings = parseSettings(JSON.parse(snapshot));
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  // Make sure the page matches the saved choice (the inline script normally already did this).
  useEffect(() => {
    applySettings(parseSettings(JSON.parse(snapshot)));
  }, [snapshot]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  function change(patch: Partial<A11ySettings>, message: string) {
    const saved = updateSettings({ ...settings, ...patch });
    setNotSaved(!saved);
    setAnnouncement(message);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="accessibility-settings"
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-md px-1 text-teal-800 underline underline-offset-4 dark:text-teal-300"
      >
        Accessibility settings
      </button>

      {/* Always present so screen readers hear changes; empty until a setting changes. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {open && (
        <section
          id="accessibility-settings"
          aria-labelledby="accessibility-settings-heading"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="order-last w-full basis-full rounded-xl border-2 border-teal-700 bg-white p-4 sm:p-5 dark:border-teal-400 dark:bg-slate-900"
        >
          <h2
            id="accessibility-settings-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-offset-4"
          >
            Accessibility settings
          </h2>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            These choices are saved only in this browser and apply to every page.
          </p>

          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Display options</legend>

            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={settings.largeText}
                onChange={(e) =>
                  change({ largeText: e.target.checked }, `Large text is ${e.target.checked ? "on" : "off"}.`)
                }
                aria-describedby="a11y-large-help"
                className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
              />
              <span>
                <span className="block font-semibold">Large text</span>
                <span id="a11y-large-help" className="block text-sm text-slate-700 dark:text-slate-300">
                  Makes text, buttons and labels bigger across the whole site.
                </span>
              </span>
            </label>

            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={settings.readingFont}
                onChange={(e) =>
                  change(
                    { readingFont: e.target.checked },
                    `Reading-friendly font is ${e.target.checked ? "on" : "off"}.`,
                  )
                }
                aria-describedby="a11y-font-help"
                className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
              />
              <span>
                <span className="block font-semibold">Reading-friendly font</span>
                <span id="a11y-font-help" className="block text-sm text-slate-700 dark:text-slate-300">
                  Uses OpenDyslexic, a font designed to be easy to read. Some people find it helps and
                  others don&apos;t; there isn&apos;t proof that it helps everyone, so it&apos;s your choice.
                </span>
              </span>
            </label>

            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) =>
                  change(
                    { highContrast: e.target.checked },
                    `High contrast is ${e.target.checked ? "on" : "off"}.`,
                  )
                }
                aria-describedby="a11y-contrast-help"
                className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
              />
              <span>
                <span className="block font-semibold">High contrast</span>
                <span id="a11y-contrast-help" className="block text-sm text-slate-700 dark:text-slate-300">
                  Uses only black and white, with strong borders. Labels and patterns, not just
                  color, show what matches reality.
                </span>
              </span>
            </label>
          </fieldset>

          <p className="mt-4 text-slate-700 dark:text-slate-300">
            <span className="font-semibold">Reduced motion:</span> this site follows your device&apos;s
            setting automatically. It is currently {reducedMotion ? "on, so animations are off" : "off"}.
          </p>

          {notSaved && (
            <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-3 text-amber-950">
              This browser isn&apos;t letting us save your choices, so they will reset when you leave or
              refresh the page.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => change({ ...DEFAULT_SETTINGS }, "Settings were reset to the defaults.")}
              className={BUTTON}
            >
              Reset these settings
            </button>
            <ClearProgressButton className={BUTTON} />
            <button type="button" onClick={close} className={BUTTON}>
              Close
            </button>
          </div>
        </section>
      )}
    </>
  );
}
