import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scenarios } from "@/data/scenarios";
import { predictionQuestions } from "@/data/predictions";
import { trackBeliefs } from "@/engine/engine";
import { buildReveal, buildPrompt, promptAfterStep } from "@/engine/prediction";
import { beliefStories, getBeliefStory } from "@/engine/stories";
import { buildStepView } from "@/engine/view";
import {
  CUSTOM_SCENARIO_ID,
  PROGRESS_KEY,
  parseProgress,
  type ProgressStore,
} from "@/lib/progress";
import { DEFAULT_SETTINGS, NO_FLASH_SCRIPT, SETTINGS_KEY, parseSettings } from "@/lib/settings";
import {
  describePrompt,
  describeReveal,
  describeStepView,
  splitForSpeech,
} from "@/lib/speech-text";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "fonts" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !path.includes(`${join("src", "test")}`)
      ? [path]
      : [];
  });
}
const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => path.slice(SRC.length + 1).replace(/\\/g, "/");

const viewFor = (id: string, n: number) => {
  const story = getBeliefStory(id)!;
  const scenario = scenarios.find((s) => s.id === id)!;
  return buildStepView(story, trackBeliefs(story), scenario, n, promptAfterStep(id, n, story));
};

describe("Read Aloud text: only what is visible, in words", () => {
  it("reads the current step and every character's panel, and never a later step", () => {
    for (const sc of scenarios) {
      for (let n = 1; n <= sc.steps.length; n++) {
        const view = viewFor(sc.id, n);
        const text = describeStepView(view);
        expect(text, `${sc.id} ${n}`).toContain(`Step ${n} of ${sc.steps.length}.`);
        expect(text).toContain(sc.steps[n - 1].text);
        for (const c of view.characters) expect(text).toContain(c.name);
        sc.steps.slice(n).forEach((later) => expect(text, `${sc.id} step ${n} reads a later step`).not.toContain(later.text));
      }
    }
  });

  it("turns symbols and colours into words", () => {
    for (const s of beliefStories) {
      for (let n = 1; n <= s.events.length; n++) {
        const text = describeStepView(viewFor(s.scenarioId, n));
        expect(text).not.toMatch(/[✓≠○↻]/);
        const view = viewFor(s.scenarioId, n);
        const hasDiffers = view.characters.some((c) => c.believes.some((b) => b.status === "differs"));
        if (hasDiffers) expect(text).toContain("differs from reality");
        const hasLacks = view.characters.some((c) => c.notKnown.length > 0);
        if (hasLacks) expect(text).toContain("does not have right now");
      }
    }
  });

  it("the question is read without its answer; the explanation only after a submission", () => {
    for (const q of predictionQuestions) {
      const story = getBeliefStory(q.scenarioId)!;
      const scenario = scenarios.find((s) => s.id === q.scenarioId)!;
      const prompt = buildPrompt(q, story);
      const before = describePrompt(prompt);
      expect(before).toContain(q.prompt);
      for (const c of q.choices) expect(before).toContain(c.text);
      expect(before).not.toContain(q.explanation);
      for (const c of q.choices) expect(before).not.toContain(c.note);
      expect(before).not.toContain(scenario.steps[q.afterStep].text); // the next event

      const reveal = buildReveal(q, story, trackBeliefs(story), scenario, "a");
      const after = describeReveal(prompt, reveal);
      expect(after).toContain(q.explanation);
      expect(after).toContain(scenario.steps[q.afterStep].text);
    }
  });

  it("splits long text into short, sentence-sized chunks without losing words", () => {
    const text = "One short sentence. Another one here! A third? " + "word ".repeat(120) + "End.";
    const chunks = splitForSpeech(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " ").trim());
    expect(splitForSpeech("")).toEqual([]);
    expect(splitForSpeech("No punctuation here")).toEqual(["No punctuation here"]);
  });
});

describe("saved data is parsed defensively", () => {
  it("settings: only real booleans count; anything else falls back to the defaults", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ largeText: "yes", readingFont: 1, highContrast: {} })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ largeText: true, extra: "<script>" })).toEqual({ ...DEFAULT_SETTINGS, largeText: true });
  });

  it("progress: drops corrupt, out-of-range, over-long and custom-story entries", () => {
    const store = parseProgress({
      scenarios: {
        "the-wrong-room": { step: 3, total: 5, answers: { "wrong-room-ben-monday": "a", "bad id!": "a", ok: "z" } },
        "bad step": { step: 1, total: 5, answers: {} },
        "the-missing-jacket": { step: 9, total: 5, answers: {} },
        "the-borrowed-pen": { step: 0, total: 5, answers: {} },
        "the-new-student-hello": { step: 2.5, total: 5, answers: {} },
        [CUSTOM_SCENARIO_ID]: { step: 2, total: 5, answers: {} },
        "the-surprise-party": "not an object",
      },
    });
    expect(Object.keys(store.scenarios)).toEqual(["the-wrong-room"]);
    expect(store.scenarios["the-wrong-room"].answers).toEqual({ "wrong-room-ben-monday": "a" });
    expect(parseProgress(null)).toEqual({ scenarios: {} });
    expect(parseProgress([1, 2, 3])).toEqual({ scenarios: {} });
    expect(parseProgress({ scenarios: "x" })).toEqual({ scenarios: {} });
    // a saved entry has only numbers and choice ids: nothing else survives parsing
    const sample: ProgressStore = parseProgress({ scenarios: { "the-wrong-room": { step: 2, total: 5, answers: {}, note: "private text" } } });
    expect(JSON.stringify(sample)).not.toContain("private text");
  });
});

describe("the inline script that applies settings before the page paints", () => {
  const run = (stored: string | null, throwOnRead = false) => {
    const attrs: Record<string, string> = {};
    const fakeDocument = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const fakeStorage = {
      getItem: (key: string) => {
        if (throwOnRead) throw new Error("blocked");
        return key === SETTINGS_KEY ? stored : null;
      },
    };
    new Function("document", "localStorage", NO_FLASH_SCRIPT)(fakeDocument, fakeStorage);
    return attrs;
  };

  it("sets exactly the attributes the stylesheet looks for", () => {
    expect(run(JSON.stringify({ readingFont: true, largeText: true, highContrast: true }))).toEqual({
      "data-font": "reading",
      "data-large": "true",
      "data-contrast": "high",
    });
    expect(run(JSON.stringify({ largeText: true }))).toEqual({ "data-large": "true" });
    expect(run(null)).toEqual({});
  });

  it("never throws, even with corrupt data or blocked storage", () => {
    expect(() => run("{not json")).not.toThrow();
    expect(run("{not json")).toEqual({});
    expect(() => run(null, true)).not.toThrow();
    expect(run(JSON.stringify({ largeText: "true" }))).toEqual({}); // strings are not booleans
  });

  it("uses the same storage key as the app", () => {
    expect(NO_FLASH_SCRIPT).toContain(JSON.stringify(SETTINGS_KEY));
  });
});

describe("privacy: what the source code actually does", () => {
  const files = sourceFiles();

  it("every log line is a fixed phrase (or an error code): never user text, errors or responses", () => {
    const offenders: string[] = [];
    let found = 0;
    for (const file of files) {
      for (const match of read(file).matchAll(/console\.(log|info|warn|error|debug|trace)\s*\(([^)]*)\)/g)) {
        found++;
        const args = match[2].trim();
        if (!/^"[^"$`]*"(\s*,\s*conversion\.code)?$/.test(args)) offenders.push(`${rel(file)}: ${match[0]}`);
      }
    }
    expect(found).toBeGreaterThan(0); // the scan is really looking at something
    expect(offenders).toEqual([]);
  });

  it("localStorage is touched only by the storage layer and the inline settings script", () => {
    // Comments are ignored; any real use of the browser storage APIs counts.
    const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const users = files.filter((f) => /\b(localStorage|sessionStorage)\b|indexedDB|document\.cookie/.test(code(f)));
    expect(users.map(rel).sort()).toEqual(["lib/settings.ts", "lib/storage.ts"]);
  });

  it("only the settings and progress modules ever write to storage", () => {
    const writers = files.filter((f) => /\b(writeJson|removeKey)\(/.test(read(f)) && !/lib\/storage\.ts$/.test(f.replace(/\\/g, "/")));
    expect(writers.map(rel).sort()).toEqual(["lib/progress.ts", "lib/settings.ts"]);
  });

  it("the storage keys are the only two, and custom stories have no key", () => {
    expect([SETTINGS_KEY, PROGRESS_KEY]).toEqual(["intheirshoes:settings:v1", "intheirshoes:progress:v1"]);
    const custom = read(join(SRC, "components", "MakeYourOwn.tsx"));
    expect(custom).not.toMatch(/saveScenarioProgress|writeJson|localStorage/);
    expect(custom).not.toMatch(/persist/); // its ScenarioLens never saves
  });

  it("the app only calls its own server: no third-party fetches, beacons or trackers", () => {
    for (const f of files) {
      const code = read(f);
      expect(code, rel(f)).not.toMatch(/fetch\(\s*["'`]https?:\/\//);
      expect(code, rel(f)).not.toMatch(/sendBeacon|gtag\(|googletagmanager|segment\.com|plausible|posthog/i);
    }
  });

  it("the footer has the exact sentence and a Privacy link, on every page, because it is in the root layout", () => {
    const layout = read(join(SRC, "app", "layout.tsx"));
    expect(layout).toContain("<p>InTheirShoes is a practice tool, not therapy or diagnosis.</p>");
    expect(layout).toMatch(/href="\/privacy"[\s\S]*?Privacy/);
    // no page overrides the layout footer or defines its own root layout
    const layouts = files.filter((f) => /(^|[\\/])layout\.tsx$/.test(f)).map(rel);
    expect(layouts).toEqual(["app/layout.tsx"]);
    expect(files.some((f) => /<footer/.test(read(f)) && rel(f) !== "app/layout.tsx")).toBe(false);
  });

  it("the Privacy page states the behaviours the code really has, without absolute promises", () => {
    const page = read(join(SRC, "app", "privacy", "page.tsx"));
    for (const phrase of [
      "You don&apos;t need an account",
      "saved in your own browser",
      "clear your saved progress",
      "does not intentionally store",
      "Demo mode",
      "<strong>not</strong> sent to an AI provider",
      "Anthropic",
      "only after you",
      "tick a box",
      "real names",
      "The website host and the network",
      "can&apos;t say that nothing is ever sent anywhere",
    ]) {
      expect(page, phrase).toContain(phrase);
    }
    expect(page).not.toMatch(/completely private|100% private|totally private|never leaves|nothing is ever stored/i);
  });

  it("the settings module saves booleans only and the progress module saves numbers and choice ids only", () => {
    const progress = read(join(SRC, "lib", "progress.ts"));
    expect(progress).toContain('export type SavedChoice = "a" | "b" | "c"');
    expect(read(join(SRC, "lib", "settings.ts"))).toMatch(/readingFont: boolean;\s*largeText: boolean;\s*highContrast: boolean;/);
  });
});

describe("the bundled font", () => {
  it("ships with its license and is loaded only from this site", () => {
    const fonts = readdirSync(join(SRC, "fonts"));
    expect(fonts).toContain("OpenDyslexic-OFL-LICENSE.txt");
    expect(fonts.filter((f) => f.endsWith(".woff2")).length).toBe(2);
    expect(read(join(SRC, "fonts", "OpenDyslexic-OFL-LICENSE.txt"))).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    const layout = read(join(SRC, "app", "layout.tsx"));
    expect(layout).toMatch(/localFont\(/);
    expect(layout).toMatch(/preload: false/);
    expect(read(join(SRC, "app", "accessibility.css"))).not.toMatch(/https?:\/\//);
  });

  it("the settings text does not claim the font is proven to help", () => {
    const panel = read(join(SRC, "components", "AccessibilitySettings.tsx"));
    expect(panel).toMatch(/there isn&apos;t proof that it helps everyone/);
    expect(panel).not.toMatch(/proven|clinically|cures?|fixes? dyslexia|helps? everyone with dyslexia\b(?!\.)/i);
  });
});

describe("layout guards (the browser checks measure the real thing; these stop known causes returning)", () => {
  const components = sourceFiles().filter((f) => f.endsWith(".tsx"));

  it("nothing forces text onto a single line: at large text on a phone that pushes the page wider than the screen", () => {
    for (const f of components) expect(read(f), rel(f)).not.toMatch(/whitespace-nowrap/);
  });

  it("rows that put a label pill beside text are allowed to wrap", () => {
    const lens = read(join(SRC, "components", "ScenarioLens.tsx"));
    expect(lens).not.toMatch(/<li className="flex items-center gap-2">/);
    expect(lens).toMatch(/<li className="flex flex-wrap items-center/);
  });

  it("reduced motion is respected: transitions and the step animation are switched off", () => {
    const css = read(join(SRC, "app", "globals.css"));
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toMatch(/transition:\s*none/);
    expect(block).toMatch(/\.lens-fade\s*\{\s*animation:\s*none/);
  });

  it("high contrast keeps a strong, always-visible keyboard focus ring and non-colour status cues", () => {
    const css = read(join(SRC, "app", "accessibility.css"));
    expect(css).toMatch(/html\[data-contrast="high"\] :focus-visible\s*\{[^}]*outline:\s*4px solid/);
    for (const style of ["solid", "dashed", "dotted"]) expect(css).toContain(`border-style: ${style}`);
    expect(css).toMatch(/\[data-status="differs"\]/);
    expect(css).toMatch(/\[data-status="matches"\]/);
    expect(css).toMatch(/\[data-status="unknown"\]/);
  });

  it("every belief and not-known item carries a status attribute for those cues", () => {
    const lens = read(join(SRC, "components", "ScenarioLens.tsx"));
    expect(lens).toMatch(/data-status=\{b\.status\}/);
    expect(lens).toMatch(/data-status="unknown"/);
  });
});
