import { vi } from "vitest";
import axe from "axe-core";
import { scenarios } from "@/data/scenarios";
import { handleCustomRequest, getCustomConfig } from "@/engine/custom-handler";
import { handleBeliefRequest } from "@/engine/handler";
import { trackBeliefs } from "@/engine/engine";
import { promptAfterStep } from "@/engine/prediction";
import { getBeliefStory } from "@/engine/stories";
import { buildStepView } from "@/engine/view";

/** Routes the app's own fetch calls to the REAL server handlers, with no network involved. */
export function installFetch() {
  const calls: { url: string; method: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : "" });
    const request = new Request(`http://localhost${url}`, init);
    if (url.startsWith("/api/belief-tracking")) return handleBeliefRequest(request, {});
    if (url.startsWith("/api/custom-scenario")) {
      return method === "POST" ? handleCustomRequest(request, {}) : Response.json(getCustomConfig({}));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return calls;
}

/** The server-rendered first view of a built-in scenario (step 1), as the page passes it in. */
export function initialViewFor(scenarioId: string) {
  const story = getBeliefStory(scenarioId)!;
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  return buildStepView(story, trackBeliefs(story), scenario, 1, promptAfterStep(scenarioId, 1, story));
}

export class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

/** A stand-in for the browser's speech engine that records what it was asked to do. */
export function installSpeech() {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speaking: false,
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
      synth.speaking = true;
    }),
    cancel: vi.fn(() => {
      synth.speaking = false;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [],
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true, writable: true });
  return {
    synth,
    spoken,
    /** The browser starts speaking the first chunk. */
    start: () => spoken[0]?.onstart?.(),
    /** The browser finishes every queued chunk. */
    finish: () => {
      spoken.forEach((u) => u.onstart?.());
      spoken.forEach((u) => u.onend?.());
      synth.speaking = false;
    },
    uninstall: () => {
      delete (window as unknown as Record<string, unknown>).speechSynthesis;
      delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
    },
  };
}

/**
 * Runs the axe accessibility checker over a rendered part of the page. jsdom has no layout, so
 * colour contrast cannot be computed here; it is measured in a real browser instead.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")})`);
}

export function resetBrowserState() {
  localStorage.clear();
  sessionStorage.clear();
  for (const a of ["data-font", "data-large", "data-contrast"]) document.documentElement.removeAttribute(a);
}
