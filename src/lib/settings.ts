import { readJson, writeJson } from "./storage";

/**
 * Accessibility preferences. Saved in this browser only (localStorage), applied as attributes on
 * <html> so one stylesheet can restyle every page, and applied BEFORE first paint by a tiny
 * inline script (NO_FLASH_SCRIPT) so a refresh never flashes the wrong look.
 */

export interface A11ySettings {
  /** Use the bundled OpenDyslexic font (with a readable system fallback). */
  readingFont: boolean;
  largeText: boolean;
  highContrast: boolean;
}

export const DEFAULT_SETTINGS: A11ySettings = {
  readingFont: false,
  largeText: false,
  highContrast: false,
};

export const SETTINGS_KEY = "intheirshoes:settings:v1";

/** Accepts only real booleans, so corrupt or hand-edited storage can never break the page. */
export function parseSettings(raw: unknown): A11ySettings {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    readingFont: o.readingFont === true,
    largeText: o.largeText === true,
    highContrast: o.highContrast === true,
  };
}

export function loadSettings(): A11ySettings {
  return parseSettings(readJson(SETTINGS_KEY));
}

/** Returns false if the preference could not be saved (it still applies for this visit). */
export function saveSettings(settings: A11ySettings): boolean {
  return writeJson(SETTINGS_KEY, settings);
}

/** Sets or removes the attributes the stylesheet looks for. */
export function applySettings(settings: A11ySettings, root: HTMLElement = document.documentElement): void {
  const set = (name: string, on: boolean, value: string) =>
    on ? root.setAttribute(name, value) : root.removeAttribute(name);
  set("data-font", settings.readingFont, "reading");
  set("data-large", settings.largeText, "true");
  set("data-contrast", settings.highContrast, "high");
}

/**
 * Runs in <head> before the page paints. It must stay tiny, dependency-free and must never
 * throw (private mode, blocked storage). Keep its key and attribute names in step with the
 * functions above; src/lib/settings.test.ts checks that they agree.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY,
)})||"{}");var r=document.documentElement;if(s.readingFont===true)r.setAttribute("data-font","reading");if(s.largeText===true)r.setAttribute("data-large","true");if(s.highContrast===true)r.setAttribute("data-contrast","high");}catch(e){}})();`;

// ---------------------------------------------------------------------------
// A tiny external store, so components can read the current settings without hydration
// mismatches (the server always renders the defaults; the browser then reads real storage).
// If storage is blocked, the choice is kept in memory so the toggles still work for this visit.
// ---------------------------------------------------------------------------

export const SETTINGS_EVENT = "intheirshoes:settings-changed";
let memory: A11ySettings | null = null;

function current(): A11ySettings {
  const stored = readJson(SETTINGS_KEY);
  return stored === null ? (memory ?? DEFAULT_SETTINGS) : parseSettings(stored);
}

/** A string snapshot (stable between calls while nothing changes), for useSyncExternalStore. */
export function getSettingsSnapshot(): string {
  return JSON.stringify(current());
}

export const SERVER_SETTINGS_SNAPSHOT = JSON.stringify(DEFAULT_SETTINGS);

export function subscribeSettings(onChange: () => void): () => void {
  window.addEventListener(SETTINGS_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Applies a change to the page right away, then tries to save it. Returns whether it was saved. */
export function updateSettings(next: A11ySettings): boolean {
  memory = next;
  applySettings(next);
  const saved = saveSettings(next);
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return saved;
}

/** Test helper: forget the in-memory fallback. */
export function resetSettingsMemory(): void {
  memory = null;
}
