// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClearProgressButton from "@/components/ClearProgressButton";
import MakeYourOwn from "@/components/MakeYourOwn";
import ProgressBadge from "@/components/ProgressBadge";
import ScenarioLens from "@/components/ScenarioLens";
import { predictionQuestions } from "@/data/predictions";
import { demoExamples } from "@/data/custom-examples";
import { scenarios } from "@/data/scenarios";
import { beliefStories } from "@/engine/stories";
import { PROGRESS_KEY, saveScenarioProgress } from "@/lib/progress";
import { SETTINGS_KEY } from "@/lib/settings";
import { axeViolations, initialViewFor, installFetch, resetBrowserState } from "@/test/helpers";

const WRONG_ROOM = "the-wrong-room";
const saved = () => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Next Step/ }));

function lens(scenarioId = WRONG_ROOM) {
  return render(<ScenarioLens scenarioId={scenarioId} initialView={initialViewFor(scenarioId)} persist />);
}

/** Plays the Wrong Room to step 3: past the question after step 2 (answered "The usual classroom"). */
async function playToStep3(user: ReturnType<typeof userEvent.setup>) {
  await next(user);
  await screen.findByText(/Step 2 of 5/);
  await next(user); // asks the question
  await user.click(await screen.findByRole("radio", { name: "The usual classroom" }));
  await user.click(screen.getByRole("button", { name: "Submit my prediction" }));
  await user.click(await screen.findByRole("button", { name: "Continue Story" }));
  await screen.findByText(/Step 3 of 5/);
}

beforeEach(() => {
  resetBrowserState();
  installFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saving progress", () => {
  it("saves the step as the student moves, as ids and numbers only", async () => {
    const user = userEvent.setup();
    lens();
    await act(async () => {});
    expect(saved()).toBeNull(); // visiting step 1 saves nothing
    await next(user);
    await screen.findByText(/Step 2 of 5/);
    expect(saved()).toEqual({ scenarios: { [WRONG_ROOM]: { step: 2, total: 5, answers: {} } } });
  });

  it("saves which prediction question was answered, and with which choice", async () => {
    const user = userEvent.setup();
    lens();
    await playToStep3(user);
    expect(saved()).toEqual({
      scenarios: { [WRONG_ROOM]: { step: 3, total: 5, answers: { "wrong-room-ben-monday": "a" } } },
    });
  });

  it("never stores story text, names, explanations or choice wording", async () => {
    const user = userEvent.setup();
    lens();
    await playToStep3(user);
    const everything = JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage));
    const story = scenarios.find((s) => s.id === WRONG_ROOM)!;
    const q = predictionQuestions.find((x) => x.scenarioId === WRONG_ROOM)!;
    for (const text of [
      ...story.steps.map((s) => s.text),
      ...story.characters.map((c) => c.name),
      ...beliefStories.flatMap((s) => s.propositions.map((p) => p.text)),
      q.prompt,
      q.explanation,
      ...q.choices.map((c) => c.text),
    ]) {
      expect(everything).not.toContain(text);
    }
    expect(Object.keys(localStorage)).toEqual([PROGRESS_KEY]);
  });
});

describe("coming back after a refresh", () => {
  it("restores the saved step, shows the earlier answered question's review, and Previous works", async () => {
    const user = userEvent.setup();
    const first = lens();
    await playToStep3(user);
    first.unmount(); // refresh: a new page, nothing but localStorage remains

    const fetchCalls = installFetch();
    lens();
    // the first render is exactly what the server sent: step 1
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    await screen.findByText(/Step 3 of 5/);
    expect(fetchCalls.some((c) => JSON.parse(c.body || "{}").step === 3)).toBe(true);
    // it asked the server only for the saved step, never for later ones
    expect(fetchCalls.every((c) => (JSON.parse(c.body || "{}").step ?? 0) <= 3)).toBe(true);

    await user.click(screen.getByRole("button", { name: /Previous/ })); // loads an earlier step on demand
    await screen.findByText(/Step 2 of 5/);
    // the question answered earlier is shown as already answered
    const review = await screen.findByRole("region", { name: "Predict before you read on" });
    await waitFor(() => expect(review.textContent).toContain("Your prediction"));
    expect(screen.getByText("Your prediction")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue Story" })).toBeTruthy();

    // going forward again does not ask the same question twice
    await next(user);
    await screen.findByText(/Step 3 of 5/);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("a saved place on the last step is restored too, and the story can be restarted", async () => {
    saveScenarioProgress(WRONG_ROOM, { step: 5, total: 5, answers: {} });
    const user = userEvent.setup();
    lens();
    await screen.findByText(/Step 5 of 5/);
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    await waitFor(() => expect(saved()).toEqual({ scenarios: {} }));
  });

  it("ignores saved data that does not fit (wrong total, impossible step, garbage)", async () => {
    for (const bad of [
      { scenarios: { [WRONG_ROOM]: { step: 3, total: 9, answers: {} } } },
      { scenarios: { [WRONG_ROOM]: { step: 99, total: 5, answers: {} } } },
      { scenarios: { [WRONG_ROOM]: { step: "3", total: 5 } } },
      "garbage",
      [1, 2, 3],
    ]) {
      localStorage.setItem(PROGRESS_KEY, typeof bad === "string" ? bad : JSON.stringify(bad));
      const view = lens();
      await act(async () => {});
      expect(screen.getByText("Step 1 of 5")).toBeTruthy();
      view.unmount();
    }
    localStorage.setItem(PROGRESS_KEY, "{not even json");
    expect(() => lens()).not.toThrow();
  });

  it("starts at step 1 if the saved step cannot be fetched, and does NOT wipe the saved place", async () => {
    saveScenarioProgress(WRONG_ROOM, { step: 3, total: 5, answers: { "wrong-room-ben-monday": "a" } });
    const before = localStorage.getItem(PROGRESS_KEY);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    lens();
    await act(async () => {});
    await waitFor(() => expect(screen.queryByText(/Picking up where you left off/)).toBeNull());
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Next Step/ })).toBeTruthy();
    // a temporary problem must not lose the student's place
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(before);
  });

  it("just visiting a scenario writes nothing to storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    lens();
    await act(async () => {});
    await act(async () => {});
    const writes = setItem.mock.calls.filter(([key]) => key !== "intheirshoes:probe");
    expect(writes).toEqual([]);
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it("a scenario rendered without saving switched on never writes progress, even for a built-in scenario", async () => {
    const user = userEvent.setup();
    render(<ScenarioLens scenarioId={WRONG_ROOM} initialView={initialViewFor(WRONG_ROOM)} />);
    await next(user);
    await screen.findByText(/Step 2 of 5/);
    expect(localStorage.length).toBe(0);
  });
});

describe("Clear My Progress", () => {
  it("removes the saved progress and resets the scenario on screen", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClearProgressButton />
        <ScenarioLens scenarioId={WRONG_ROOM} initialView={initialViewFor(WRONG_ROOM)} persist />
      </>,
    );
    await playToStep3(user);
    expect(saved().scenarios[WRONG_ROOM].step).toBe(3);

    await user.click(screen.getByRole("button", { name: "Clear My Progress" }));
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByText("Your saved progress was cleared.")).toBeTruthy();
    // the question is no longer treated as answered
    await act(async () => {});
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it("does not remove the accessibility settings", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ readingFont: false, largeText: true, highContrast: false }));
    saveScenarioProgress(WRONG_ROOM, { step: 2, total: 5, answers: {} });
    const user = userEvent.setup();
    render(<ClearProgressButton />);
    await user.click(screen.getByRole("button", { name: "Clear My Progress" }));
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).largeText).toBe(true);
  });

  it("the card badge disappears when progress is cleared", async () => {
    saveScenarioProgress(WRONG_ROOM, { step: 3, total: 5, answers: {} });
    const user = userEvent.setup();
    render(
      <>
        <ProgressBadge scenarioId={WRONG_ROOM} />
        <ClearProgressButton />
      </>,
    );
    expect(await screen.findByText("Saved: step 3 of 5")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear My Progress" }));
    expect(screen.queryByText(/Saved: step/)).toBeNull();
  });
});

describe("when localStorage is unavailable or disabled", () => {
  function block() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
  }

  it("the scenario still works from start to finish, including a prediction", async () => {
    block();
    const user = userEvent.setup();
    lens();
    await playToStep3(user);
    await next(user);
    await screen.findByText(/Step 4 of 5/);
    await next(user);
    await screen.findByText(/Step 5 of 5/);
    expect(screen.getByText("That is the end of this story.")).toBeTruthy();
  });

  it("the badge and Clear My Progress do not crash", async () => {
    block();
    const user = userEvent.setup();
    render(
      <>
        <ProgressBadge scenarioId={WRONG_ROOM} />
        <ClearProgressButton />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Clear My Progress" }));
    expect(screen.getByText(/isn.t saving anything/)).toBeTruthy();
  });

  it("window.localStorage throwing outright is survived", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const user = userEvent.setup();
    lens();
    await next(user);
    await screen.findByText(/Step 2 of 5/);
  });
});

describe("no hydration errors", () => {
  it("server markup matches the first browser render even with saved progress", async () => {
    saveScenarioProgress(WRONG_ROOM, { step: 3, total: 5, answers: { "wrong-room-ben-monday": "a" } });
    const element = <ScenarioLens scenarioId={WRONG_ROOM} initialView={initialViewFor(WRONG_ROOM)} persist />;
    const server = renderToString(element);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = server;
    render(element, { container, hydrate: true });
    expect(screen.getByText("Step 1 of 5")).toBeTruthy(); // same as the server, no mismatch
    await screen.findByText(/Step 3 of 5/); // then the saved place appears
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });

  it("the progress badge renders nothing on the server and nothing wrong on hydration", async () => {
    saveScenarioProgress(WRONG_ROOM, { step: 2, total: 5, answers: {} });
    expect(renderToString(<ProgressBadge scenarioId={WRONG_ROOM} />)).toBe("");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(<ProgressBadge scenarioId={WRONG_ROOM} />, { container, hydrate: true });
    expect(await screen.findByText("Saved: step 2 of 5")).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });
});

describe("Make Your Own is never saved", () => {
  it("no description, name, step or generated text reaches any browser storage", async () => {
    const user = userEvent.setup();
    render(<MakeYourOwn />);
    const example = demoExamples.find((e) => e.id === "room-change-text")!;
    await user.click(await screen.findByRole("button", { name: /room-change text/ }));
    await user.click(screen.getByRole("button", { name: "Generate my scenario" }));
    await screen.findByRole("heading", { name: "Here's what we understood" });
    await user.click(screen.getByRole("button", { name: "Start the Two-Lens View" }));
    await screen.findByText(/Step 1 of 5/);
    for (let i = 2; i <= 5; i++) {
      await next(user);
      await screen.findByText(new RegExp(`Step ${i} of 5`));
    }
    expect(screen.getByText("That is the end of this story.")).toBeTruthy();

    // nothing at all was written: not progress, not settings, not text
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(Object.entries(localStorage))).not.toMatch(/Mina|Dev|Luz|Room 12|club meeting/);
    expect(JSON.stringify(example)).toContain("Mina"); // (the example really does contain those words)
  });

  it("typing a description writes nothing either", async () => {
    const user = userEvent.setup();
    render(<MakeYourOwn />);
    await user.type(await screen.findByLabelText("Describe what happens"), "Pat gives Quinn a note in class.");
    await user.click(screen.getByRole("button", { name: "Generate my scenario" }));
    await screen.findByText(/Nothing you typed was sent anywhere/);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("settings are the only thing that can be saved while using it", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ readingFont: false, largeText: true, highContrast: false }));
    const user = userEvent.setup();
    render(<MakeYourOwn />);
    await user.click(await screen.findByRole("button", { name: /moved notebook/ }));
    await user.click(screen.getByRole("button", { name: "Generate my scenario" }));
    await screen.findByRole("heading", { name: "Here's what we understood" });
    expect(Object.keys(localStorage)).toEqual([SETTINGS_KEY]);
  });

  it("the progress layer refuses the custom-story id outright", () => {
    expect(saveScenarioProgress("custom-scenario", { step: 2, total: 5, answers: {} })).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});

describe("the interface is accessible", () => {
  it("the Two-Lens View, with a prediction card showing, has no detectable problems", async () => {
    const user = userEvent.setup();
    const { container } = lens("the-missing-jacket");
    expect(await axeViolations(container)).toEqual([]);
    await next(user);
    await screen.findByRole("region", { name: "Predict before you read on" });
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole("radio", { name: "On the usual hook" }));
    await user.click(screen.getByRole("button", { name: "Submit my prediction" }));
    await screen.findByRole("button", { name: "Continue Story" });
    expect(await axeViolations(container)).toEqual([]);
  });

  it("every stage of Make Your Own has no detectable problems", async () => {
    const user = userEvent.setup();
    const { container } = render(<MakeYourOwn />);
    await screen.findByRole("button", { name: /moved notebook/ });
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: /trip day/ }));
    await user.click(screen.getByRole("button", { name: "Generate my scenario" }));
    await screen.findByText("One quick question");
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole("radio", { name: "Yes, Theo heard it" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Here's what we understood" });
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Start the Two-Lens View" }));
    await screen.findByText(/Step 1 of 4/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the whole lens is keyboard-operable: Tab reaches Read Aloud, then the step buttons, and Enter advances", async () => {
    const user = userEvent.setup();
    lens("the-lunch-table-seat");
    const reachable: string[] = [];
    for (let i = 0; i < 12; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      if (el === document.body) break; // focus left the page content
      reachable.push(el.textContent?.trim() ?? "");
    }
    expect(reachable.some((t) => /Read Aloud/.test(t))).toBe(true);
    // Previous, Pause and Stop are disabled right now, so they are correctly not tab stops
    expect(reachable.some((t) => /Previous|Pause|Stop/.test(t))).toBe(false);
    expect(reachable.some((t) => /Next Step/.test(t))).toBe(true);
    (screen.getByRole("button", { name: /Next Step/ }) as HTMLButtonElement).focus();
    await user.keyboard("{Enter}");
    await screen.findByText(/Step 2 of 6/);
  });
});
