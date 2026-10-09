# InTheirShoes

A calm, student-friendly practice tool for seeing a situation through someone else's eyes. Each story shows
two lenses side by side, **what is true** and **what each person believes**, one step at a time. It is built on
the belief-tracking ideas in the research paper "Beyond Final Answers: Explicit Belief-State Tracking in Compact
Instruction-Tuned Language Models" (Doddavarapu & Tomar).

InTheirShoes is a practice tool, not therapy or diagnosis.

## What is in it

- 12 original scenarios with a Two-Lens View and Read Aloud
- "Predict, then reveal" questions (no spoilers before you answer)
- Make Your Own, in a clearly labelled **demo mode** (built-in examples only; nothing is sent anywhere)
- Accessibility settings (large text, high contrast, reading-friendly font), saved only in your browser
- A Privacy page and an About the Science page (the paper's findings, plus an honest, unrun benchmark)

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # automated tests
npm run lint
npm run build
```

## Free by design

No API key is needed or used. With no environment variables set, the app runs entirely in free demo mode.
`.env.example` lists the optional settings; leave them out. The benchmark in `src/benchmark` can be rehearsed for
free (`npm run benchmark`); no live AI evaluation has been run (see `docs/benchmark/PROTOCOL.md`).
