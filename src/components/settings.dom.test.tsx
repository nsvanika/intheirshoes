// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccessibilitySettings from "@/components/AccessibilitySettings";
import { SETTINGS_KEY, resetSettingsMemory } from "@/lib/settings";
import { axeViolations, resetBrowserState } from "@/test/helpers";

const html = () => document.documentElement;
const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");

beforeEach(() => {
  resetBrowserState();
  resetSettingsMemory();
});
afterEach(() => vi.restoreAllMocks());

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Accessibility settings" }));
  return screen.getByRole("region", { name: "Accessibility settings" });
}

describe("the settings panel", () => {
  it("is a labelled disclosure that starts closed", () => {
    render(<AccessibilitySettings />);
    const trigger = screen.getByRole("button", { name: "Accessibility settings" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe("accessibility-settings");
    expect(screen.queryByRole("region", { name: "Accessibility settings" })).toBeNull();
  });

  it("opens, moves focus to its heading, and exposes three labelled, described checkboxes", async () => {
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    const panel = await open(user);
    expect(screen.getByRole("button", { name: "Accessibility settings" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Accessibility settings" }));
    for (const name of ["Large text", "Reading-friendly font", "High contrast"]) {
      const box = screen.getByRole("checkbox", { name: new RegExp(name) });
      expect(box.getAttribute("aria-describedby")).toBeTruthy();
      expect(panel.contains(box)).toBe(true);
    }
    // the panel offers Clear My Progress and Close too
    expect(screen.getByRole("button", { name: "Clear My Progress" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("each toggle changes the page immediately, is saved, and is announced", async () => {
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    await open(user);

    await user.click(screen.getByRole("checkbox", { name: /Large text/ }));
    expect(html().getAttribute("data-large")).toBe("true");
    // announced politely for screen readers, in a live region
    expect(screen.getByText("Large text is on.").getAttribute("aria-live")).toBe("polite");

    await user.click(screen.getByRole("checkbox", { name: /Reading-friendly font/ }));
    expect(html().getAttribute("data-font")).toBe("reading");

    await user.click(screen.getByRole("checkbox", { name: /High contrast/ }));
    expect(html().getAttribute("data-contrast")).toBe("high");

    expect(saved()).toEqual({ readingFont: true, largeText: true, highContrast: true });

    await user.click(screen.getByRole("checkbox", { name: /Large text/ }));
    expect(html().hasAttribute("data-large")).toBe(false);
    expect(saved().largeText).toBe(false);
  });

  it("choices survive a refresh: a fresh page applies them and the panel shows them", async () => {
    const user = userEvent.setup();
    const first = render(<AccessibilitySettings />);
    await open(user);
    await user.click(screen.getByRole("checkbox", { name: /Large text/ }));
    await user.click(screen.getByRole("checkbox", { name: /High contrast/ }));
    first.unmount();

    // a brand-new page: nothing applied yet, and no in-memory state
    for (const a of ["data-font", "data-large", "data-contrast"]) html().removeAttribute(a);
    resetSettingsMemory();

    render(<AccessibilitySettings />);
    await act(async () => {}); // let the mount effect run
    expect(html().getAttribute("data-large")).toBe("true");
    expect(html().getAttribute("data-contrast")).toBe("high");
    expect(html().hasAttribute("data-font")).toBe(false);

    await open(userEvent.setup());
    expect((screen.getByRole("checkbox", { name: /Large text/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /High contrast/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Reading-friendly font/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("works from the keyboard: Enter opens, Tab reaches a checkbox, Space toggles, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    const trigger = screen.getByRole("button", { name: "Accessibility settings" });
    await user.tab();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await user.tab(); // from the focused heading to the first control
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: /Large text/ }));
    await user.keyboard(" ");
    expect(html().getAttribute("data-large")).toBe("true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Accessibility settings" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Reset puts everything back to the defaults and saves that", async () => {
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    await open(user);
    await user.click(screen.getByRole("checkbox", { name: /Large text/ }));
    await user.click(screen.getByRole("button", { name: "Reset these settings" }));
    expect(html().hasAttribute("data-large")).toBe(false);
    expect(saved()).toEqual({ readingFont: false, largeText: false, highContrast: false });
  });

  it("follows the device's reduced-motion setting and says so", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes("reduce") })) as typeof window.matchMedia;
    render(<AccessibilitySettings />);
    await open(user);
    expect(screen.getByText(/currently on, so animations are off/)).toBeTruthy();
    window.matchMedia = original;
  });

  it("has no automatically detectable accessibility problems, open or closed", async () => {
    const user = userEvent.setup();
    const { container } = render(<AccessibilitySettings />);
    expect(await axeViolations(container)).toEqual([]);
    await open(user);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("when the browser will not let the app save anything", () => {
  function blockStorage() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
  }

  it("the page does not crash; toggles still work for this visit and the panel says they won't be kept", async () => {
    blockStorage();
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    await open(user);
    await user.click(screen.getByRole("checkbox", { name: /Large text/ }));
    expect(html().getAttribute("data-large")).toBe("true");
    expect((screen.getByRole("checkbox", { name: /Large text/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/isn.t letting us save your choices/);
  });

  it("Clear My Progress still works and says there was nothing to clear", async () => {
    blockStorage();
    const user = userEvent.setup();
    render(<AccessibilitySettings />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Clear My Progress" }));
    expect(screen.getByText(/isn.t saving anything/)).toBeTruthy();
  });

  it("window.localStorage itself throwing is survived too", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => render(<AccessibilitySettings />)).not.toThrow();
  });
});

describe("no hydration errors", () => {
  it("renders the same HTML on the server and the first browser render, even with saved settings", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ readingFont: true, largeText: true, highContrast: true }));
    const server = renderToString(<AccessibilitySettings />); // no window, no storage: the defaults
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = server;
    render(<AccessibilitySettings />, { container, hydrate: true });
    await act(async () => {});
    expect(errors).not.toHaveBeenCalled();
    // and the saved choice is then applied
    expect(html().getAttribute("data-large")).toBe("true");
    container.remove();
  });
});
