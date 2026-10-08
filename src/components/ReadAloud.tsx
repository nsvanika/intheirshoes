"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { splitForSpeech } from "@/lib/speech-text";

/**
 * Read Aloud, using the browser's built-in speech (window.speechSynthesis). There is no paid
 * voice service, and nothing is sent by this app. Depending on the browser and device, some
 * voices may be provided by an online service run by the browser or device maker; the Privacy
 * page says so.
 *
 *  - Speech starts ONLY when the person presses Read Aloud. Never automatically.
 *  - `text` is whatever is visible right now. When it changes (the student moves to another
 *    step, the card changes) speech stops, and it stops when leaving the page or this component.
 *  - Play, Pause/Resume and Stop are real buttons; a status line announces what is happening.
 *  - If the browser cannot speak, a clear message says so instead of a silent failure.
 */

type Speech = { text: string; state: "idle" | "speaking" | "paused"; message: string };

/** Which ReadAloud is speaking, so one never cancels another's speech by accident. */
let currentOwner: string | null = null;
/** Lets a reader that has been taken over by another one reset its own buttons. */
const resetters = new Map<string, () => void>();

function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

const BTN =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-400 bg-white px-4 py-2 text-base font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700";

export default function ReadAloud({ text, what }: { text: string; what: string }) {
  const id = useId();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const run = useRef(0);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State belongs to the text it was started for; if the text changes, it is simply idle again.
  const active = speech && speech.text === text ? speech : null;
  const state = active?.state ?? "idle";
  const message = active?.message ?? "";

  useEffect(() => {
    resetters.set(id, () => setSpeech((s) => (s ? { ...s, state: "idle", message: "" } : s)));
    return () => {
      resetters.delete(id);
    };
  }, [id]);

  useEffect(() => {
    // Detect support after mount, so the server and browser render the same first HTML.
    const timer = setTimeout(() => setSupported(speechSupported()), 0);
    return () => clearTimeout(timer);
  }, []);

  const halt = useCallback(() => {
    run.current += 1;
    if (startTimer.current) clearTimeout(startTimer.current);
    if (currentOwner === id) {
      currentOwner = null;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* nothing to stop */
      }
    }
  }, [id]);

  // Stop when the visible text changes, when the page is left, and when this unmounts.
  useEffect(() => {
    const onHide = () => halt();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      halt();
    };
  }, [text, halt]);

  function play() {
    if (!speechSupported() || !text.trim()) return;
    const synth = window.speechSynthesis;
    if (currentOwner && currentOwner !== id) resetters.get(currentOwner)?.(); // another reader was speaking
    synth.cancel(); // clear anything already queued, from here or another Read Aloud
    currentOwner = id;
    const mine = ++run.current;
    const chunks = splitForSpeech(text);
    let started = false;

    setSpeech({ text, state: "speaking", message: "" });

    chunks.forEach((chunk, i) => {
      const utterance = new window.SpeechSynthesisUtterance(chunk);
      utterance.lang = document.documentElement.lang || "en-US";
      utterance.rate = 0.95;
      utterance.onstart = () => {
        started = true;
      };
      utterance.onend = () => {
        if (run.current !== mine || i !== chunks.length - 1) return;
        currentOwner = null;
        setSpeech({ text, state: "idle", message: "Finished reading." });
      };
      utterance.onerror = (event) => {
        if (run.current !== mine) return;
        const reason = (event as SpeechSynthesisErrorEvent).error;
        if (reason === "canceled" || reason === "interrupted") return;
        run.current += 1;
        synth.cancel();
        currentOwner = null;
        setSpeech({
          text,
          state: "idle",
          message: "Sorry, reading aloud stopped because of a problem with this device's voice.",
        });
      };
      synth.speak(utterance);
    });

    // If nothing begins, this device may have no voice. Say so instead of waiting forever.
    startTimer.current = setTimeout(() => {
      if (run.current === mine && !started && !synth.speaking) {
        run.current += 1;
        currentOwner = null;
        setSpeech({
          text,
          state: "idle",
          message: "Nothing was read aloud. This device may not have a voice available for it.",
        });
      }
    }, 4000);
  }

  function pause() {
    window.speechSynthesis.pause();
    setSpeech({ text, state: "paused", message: "" });
  }

  function resume() {
    window.speechSynthesis.resume();
    setSpeech({ text, state: "speaking", message: "" });
  }

  function stop() {
    halt();
    setSpeech({ text, state: "idle", message: "Stopped." });
  }

  const unsupported = supported === false;
  const status =
    state === "speaking" ? "Reading aloud…" : state === "paused" ? "Paused." : message;
  const describedBy = `${id}-help`;

  return (
    <div role="group" aria-label={`Read aloud: ${what}`} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={play}
        disabled={unsupported || !text.trim()}
        aria-describedby={describedBy}
        className={BTN}
      >
        <span aria-hidden="true">▶</span> Read Aloud
      </button>
      <button
        type="button"
        onClick={state === "paused" ? resume : pause}
        disabled={unsupported || state === "idle"}
        className={BTN}
      >
        <span aria-hidden="true">{state === "paused" ? "▶" : "❚❚"}</span>{" "}
        {state === "paused" ? "Resume" : "Pause"}
      </button>
      <button type="button" onClick={stop} disabled={unsupported || state === "idle"} className={BTN}>
        <span aria-hidden="true">■</span> Stop
      </button>

      <span id={describedBy} className="sr-only">
        Reads {what} out loud using your browser&apos;s built-in voice.
      </span>
      <span role="status" aria-live="polite" className="text-sm text-slate-700 dark:text-slate-300">
        {unsupported
          ? "Read Aloud isn't available in this browser. Try a recent version of Chrome, Edge, Safari or Firefox."
          : status}
      </span>
    </div>
  );
}
