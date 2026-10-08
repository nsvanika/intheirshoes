// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MakeYourOwn from "@/components/MakeYourOwn";
import ReadAloud from "@/components/ReadAloud";
import ScenarioLens from "@/components/ScenarioLens";
import { describeStepView } from "@/lib/speech-text";
import { axeViolations, initialViewFor, installFetch, installSpeech, resetBrowserState } from "@/test/helpers";

let speech: ReturnType<typeof installSpeech>;

beforeEach(() => {
  resetBrowserState();
  speech = installSpeech();
});
afterEach(() => {
  speech.uninstall();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const TEXT = "Step 1 of 5. Ms. Ortiz says Monday's lesson will be in the library. Ben was packing a bag.";

describe("Read Aloud controls", () => {
  it("never speaks on its own: rendering, re-rendering and waiting say nothing", async () => {
    const { rerender } = render(<ReadAloud text={TEXT} what="this step" />);
    await act(async () => {});
    rerender(<ReadAloud text={TEXT + " More."} what="this step" />);
    await act(async () => {});
    expect(speech.synth.speak).not.toHaveBeenCalled();
  });

  it("has a clearly labelled group with Read Aloud, Pause and Stop buttons, and a status line", () => {
    render(<ReadAloud text={TEXT} what="this step" />);
    expect(screen.getByRole("group", { name: "Read aloud: this step" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read Aloud" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("Read Aloud speaks the visible text, in short chunks, only when pressed", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    expect(speech.synth.speak).toHaveBeenCalled();
    expect(speech.spoken.map((u) => u.text).join(" ").replace(/\s+/g, " ")).toBe(TEXT);
    expect(screen.getByRole("status").textContent).toBe("Reading aloud…");
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Pause and Resume toggle, and Stop cancels", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(speech.synth.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Paused.");
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(speech.synth.resume).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Reading aloud…");

    speech.synth.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(speech.synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Stopped.");
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when it has finished", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    await act(async () => speech.finish());
    expect(screen.getByRole("status").textContent).toBe("Finished reading.");
  });

  it("works from the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read Aloud" }));
    await user.keyboard("{Enter}");
    expect(speech.synth.speak).toHaveBeenCalled();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pause" }));
    await user.keyboard(" ");
    expect(speech.synth.pause).toHaveBeenCalled();
    await user.tab();
    await user.keyboard("{Enter}"); // Stop
    expect(screen.getByRole("status").textContent).toBe("Stopped.");
  });

  it("stops when the visible text changes (the student moved to another step)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    speech.synth.cancel.mockClear();
    rerender(<ReadAloud text="Step 2 of 5. Something else." what="this step" />);
    expect(speech.synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(""); // idle again, not still "Reading"
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
    expect(speech.synth.speak).toHaveBeenCalledTimes(speech.spoken.length); // and did not start anything new
  });

  it("stops when it is removed from the page (navigating away)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    speech.synth.cancel.mockClear();
    unmount();
    expect(speech.synth.cancel).toHaveBeenCalled();
  });

  it("stops when the page is hidden or closed", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    speech.synth.cancel.mockClear();
    window.dispatchEvent(new Event("pagehide"));
    expect(speech.synth.cancel).toHaveBeenCalled();
  });

  it("a reader does not cancel speech that belongs to another reader, and the one it replaces resets", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ReadAloud text="First reader text." what="first" />
        <ReadAloud text="Second reader text." what="second" />
      </>,
    );
    const [firstPlay, secondPlay] = screen.getAllByRole("button", { name: "Read Aloud" });
    await user.click(firstPlay);
    expect(screen.getAllByRole("status")[0].textContent).toBe("Reading aloud…");
    await user.click(secondPlay);
    expect(screen.getAllByRole("status")[1].textContent).toBe("Reading aloud…");
    expect(screen.getAllByRole("status")[0].textContent).toBe(""); // the first one reset itself
  });

  it("tells the person when the device speech engine reports a problem", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    await act(async () => speech.spoken[0].onerror?.({ error: "synthesis-failed" }));
    expect(screen.getByRole("status").textContent).toMatch(/Sorry, reading aloud stopped because of a problem/);
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores the 'canceled' event that its own Stop causes", async () => {
    const user = userEvent.setup();
    render(<ReadAloud text={TEXT} what="this step" />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => speech.spoken[0].onerror?.({ error: "canceled" }));
    expect(screen.getByRole("status").textContent).toBe("Stopped.");
  });

  it("says so if nothing starts (for example, no voice installed)", async () => {
    vi.useFakeTimers();
    render(<ReadAloud text={TEXT} what="this step" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      screen.getByRole("button", { name: "Read Aloud" }).click();
    });
    speech.synth.speaking = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(screen.getByRole("status").textContent).toMatch(/Nothing was read aloud/);
  });

  it("does nothing, harmlessly, for empty text", () => {
    render(<ReadAloud text="   " what="nothing" />);
    expect((screen.getByRole("button", { name: "Read Aloud" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no automatically detectable accessibility problems", async () => {
    const { container } = render(<ReadAloud text={TEXT} what="this step" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("a browser without speech", () => {
  beforeEach(() => speech.uninstall());

  it("shows a clear message and disables the buttons, instead of failing silently", async () => {
    vi.useFakeTimers();
    render(<ReadAloud text={TEXT} what="this step" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("status").textContent).toMatch(/Read Aloud isn.t available in this browser/);
    for (const name of ["Read Aloud", "Pause", "Stop"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("an unsupported browser also needs a missing utterance class to be handled", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "speechSynthesis", { value: { speak() {} }, configurable: true, writable: true });
    render(<ReadAloud text={TEXT} what="this step" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("status").textContent).toMatch(/isn.t available in this browser/);
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
  });
});

describe("what Read Aloud reads in the app", () => {
  it("the Two-Lens View reads the visible step and panels, and stops when the student advances", async () => {
    installFetch();
    const user = userEvent.setup();
    const view = initialViewFor("the-wrong-room");
    render(<ScenarioLens scenarioId="the-wrong-room" initialView={view} />);
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    const spoken = speech.spoken.map((u) => u.text).join(" ").replace(/\s+/g, " ");
    expect(spoken).toBe(describeStepView(view).replace(/\s+/g, " "));
    expect(spoken).toContain("Ben believes");
    expect(spoken).not.toContain("checks the posted schedule"); // a later step

    speech.synth.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: /Next Step/ })); // advancing: step 1 has no question
    await screen.findByText(/Step 2 of 5/);
    expect(speech.synth.cancel).toHaveBeenCalled();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Reading aloud…")).toBe(false);
  });

  it("the prediction card reads the question without the answer, then the explanation after submitting", async () => {
    installFetch();
    const user = userEvent.setup();
    render(<ScenarioLens scenarioId="the-missing-jacket" initialView={initialViewFor("the-missing-jacket")} />);
    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    const card = await screen.findByRole("region", { name: "Predict before you read on" });
    const read = card.querySelector('[role="group"]')!.querySelector("button")!;
    await user.click(read);
    const before = speech.spoken.map((u) => u.text).join(" ");
    expect(before).toContain("Suppose Taylor goes to get the blue jacket");
    expect(before).not.toContain("out of date"); // the explanation
    expect(before).not.toContain("cannot find their blue jacket"); // the next event

    await user.click(screen.getByRole("radio", { name: "On the usual hook" }));
    await user.click(screen.getByRole("button", { name: "Submit my prediction" }));
    await screen.findByRole("button", { name: "Continue Story" });
    speech.spoken.length = 0;
    const after = screen.getByRole("region", { name: "Predict before you read on" });
    await user.click(after.querySelector('[role="group"] button')!);
    const afterText = speech.spoken.map((u) => u.text).join(" ");
    expect(afterText).toContain("out of date");
    expect(afterText).toContain("cannot find their blue jacket");
  });

  it("Make Your Own never reads the text being typed, and speaks nothing until a button is pressed", async () => {
    installFetch();
    const user = userEvent.setup();
    render(<MakeYourOwn />);
    const box = await screen.findByLabelText("Describe what happens");
    await user.type(box, "Pat gives Quinn a private note.");
    await act(async () => {});
    expect(speech.synth.speak).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Read Aloud" })).toBeNull(); // nothing to read yet
  });

  it("Make Your Own reads the generated review and story only when asked", async () => {
    installFetch();
    const user = userEvent.setup();
    render(<MakeYourOwn />);
    await user.click(await screen.findByRole("button", { name: /moved notebook/ }));
    await user.click(screen.getByRole("button", { name: "Generate my scenario" }));
    await screen.findByRole("heading", { name: "Here's what we understood" });
    expect(speech.synth.speak).not.toHaveBeenCalled(); // never automatic
    await user.click(screen.getByRole("button", { name: "Read Aloud" }));
    expect(speech.spoken.map((u) => u.text).join(" ")).toContain("Here is what we understood");

    speech.synth.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: "Start the Two-Lens View" }));
    expect(speech.synth.cancel).toHaveBeenCalled(); // leaving the review stops it
    expect(screen.getByRole("button", { name: "Read Aloud" })).toBeTruthy(); // the story has its own
  });
});
