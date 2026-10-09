// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBenchmark } from "./runner";
import { scriptedCaller } from "./scripted";
import { summarize } from "./summarize";
import { axeViolations } from "@/test/helpers";

const mocked = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/benchmark/load-results", async () => {
  const actual = await vi.importActual<typeof import("./load-results")>("./load-results");
  return { ...actual, loadLiveResults: () => mocked.value };
});

async function mount() {
  const { default: Page } = await import("@/app/about-the-science/page");
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<Page />);
  document.body.appendChild(container);
  return container;
}

describe("About the Science is accessible", () => {
  afterEach(() => {
    document.body.innerHTML = ""; // never leave a page behind, even when a test fails
  });

  it("with no results yet: no detectable problems, one h1, ordered headings, labelled tables", async () => {
    mocked.value = null;
    const c = await mount();
    expect(await axeViolations(c)).toEqual([]);
    expect(c.querySelectorAll("h1")).toHaveLength(1);
    const levels = [...c.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1); // no skipped levels
    for (const table of c.querySelectorAll("table")) {
      expect(table.querySelector("caption")?.textContent?.length).toBeGreaterThan(5);
      expect(table.querySelectorAll("thead th[scope=col]").length).toBeGreaterThan(0);
    }
    // each scrollable table region is keyboard reachable and named
    for (const region of c.querySelectorAll('[role="region"]')) {
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("aria-label")).toBeTruthy();
    }
    c.remove();
  });

  it("with live results: still no detectable problems", async () => {
    const { file } = await runBenchmark({ call: scriptedCaller("flaky"), mode: "dry-run", model: null, concurrency: 1, settings: { apiRetries: 0 }, retryDelayMs: 0 });
    const live = { ...file, mode: "live" as const, model: "test-model-id" };
    mocked.value = { file: live, summary: summarize(live.records), matchesCurrentBenchmark: true };
    const c = await mount();
    expect(await axeViolations(c)).toEqual([]);
    expect(c.querySelectorAll("table").length).toBeGreaterThanOrEqual(5);
    c.remove();
  });

  it("links to real pages and says what each link is", async () => {
    mocked.value = null;
    const c = await mount();
    const hrefs = [...c.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/scenarios/the-wrong-room");
    expect(hrefs).toContain("/make-your-own");
    for (const a of c.querySelectorAll("a")) expect(a.textContent?.trim().length).toBeGreaterThan(0);
    c.remove();
  });
});
