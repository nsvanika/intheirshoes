# Proof It Works: evaluation protocol (version 1.0)

This file was written, and committed to git, **before any live model run**. Its purpose is to fix the
measure and the rules in advance so they cannot be chosen after the results are seen. If anything
changes later, the change is listed under "Deviations" at the bottom, with the reason and the date.

## Question

On the same questions, with the same model and the same settings, does asking a model to write an
**explicit, time-indexed belief-state table** before answering (Method B) change its accuracy compared
with asking it to **answer directly** (Method A)?

There is no prediction that B will win. The paper this project builds on ("Beyond Final Answers:
Explicit Belief-State Tracking in Compact Instruction-Tuned Language Models", Doddavarapu & Tomar)
found that two small open models scored poorly at producing complete belief tables, and that a
"copy the real state of the world" rule scored 0% where a character's belief differs from reality.
The model used here is different (larger, newer, and not one the paper tested), so the paper's
numbers are **context, not a forecast**. A null or a negative result will be reported exactly as
prominently as a positive one.

## The benchmark

- **26 cases in 17 story families.** 6 classic tasks (Sally-Anne, Maxi and the chocolate, and an
  unexpected-contents task, each with a control) and 20 cases adapted from the project's 12 library
  scenarios and 2 Make Your Own examples.
- **Families.** Cases that share a story lineage share a family id and are **not independent
  evidence**. All confidence intervals resample whole families (the paper's approach). A similarity
  check rejects near-duplicate stories filed under different families.
- **Mix.** 10 genuine false-belief cases, 8 missing-information cases, 8 true-belief controls. A
  false-belief case is one where the character's belief differs from reality and a "copy the world"
  answer is wrong.
- **Every case has** a complete story, one question about a character's belief, a gold answer, an
  explanation, a family id, and a validation record.
- **Gold answers** are computed by the project's deterministic belief engine (the paper's symbolic
  oracle) from a structured version of the story, never typed by hand, and then recomputed by a
  separately written backward-scanning reference implementation. A case is rejected unless both agree.
- **Self-contained.** No case depends on hidden starting beliefs: everything the answer needs, including
  how each character came or failed to know something, is in the sentences.
- **Not independently human-audited.** As in the paper, the gold labels come from a deterministic
  engine and have not been annotated by a second person. This is a limitation.

## The two methods

Both receive the same model call, the same system prompt, and the same user prompt up to the final
instruction: the belief rule ("believes something only if they saw it, were told it, or overheard
it"), the numbered story, the character list, the statement vocabulary, the definition of time steps,
the question, and the options. This mirrors the paper, whose two prompt conditions both supplied the
narrative, actors, vocabulary, time steps and a belief definition.

- **Method A (plain prompting).** "Answer directly" with `{"final_answer": "<letter>"}`.
- **Method B (explicit belief tracking).** First return a table with one row per time step, character
  and statement (`belief` 1 or 0), then `final_answer`, as one JSON object.

**The one documented difference** is the `table` that Method B must produce before it answers.

## Model and settings (identical for both methods)

| Setting | Value |
| --- | --- |
| Model | `claude-haiku-5-5` (a low-cost model), unless the `ANTHROPIC_MODEL` variable names another; the exact id is stored with the results |
| Output limit | 8,000 tokens |
| Hidden reasoning | **disabled** for both, so the only visible difference is the table. With it left on, plain prompting would also reason, just out of sight, and the comparison would not be about explicit tracking |
| Reasoning effort | low |
| Sampling | model defaults. This model does not allow changing them, so replies are not perfectly repeatable. `--runs` repeats every question |
| Runs | 1 per question unless stated with the results |
| Retries | a request that **fails at the API level** is retried up to 2 times with the identical prompt. A bad *answer* is never retried: it is a result |

## Scoring (the same strict rule for both methods)

**Primary metric, "correct".** The reply is valid for the format that method asked for **and** the
final answer equals the gold answer. For Method B, valid includes a complete table: every required
row exactly once, none extra, none unknown. This follows the paper's strict rule that missing,
duplicate, extra or malformed rows count as incorrect.

**Every other request counts as a failure**, whatever the reason, and none is dropped:
`api_error`, `refusal`, `truncated`, `unparseable`, `malformed`, `invalid_answer`,
`incomplete_table` (Method B only), or `wrong` (everything valid, answer not the gold answer).

**API failures are reported separately from the model's own errors.** They count as failures in the
primary metric (the denominator is every question asked), and a second figure that leaves them out
is shown beside it.

**Secondary metrics**, reported alongside and never in place of the primary:

1. *Answer-only accuracy:* the final answer is correct whenever one letter can be read, even if the
   table was incomplete. It separates "could not reason it out" from "could not format it", and it
   addresses the fact that Method B has more ways to fail on format.
2. *Row accuracy* (Method B): the share of required table rows that match the engine's table.
3. *Table consistency* (Method B): whether the final answer agrees with the model's own table.
4. *Divergence accuracy:* accuracy on questions where the gold belief differs from reality (the paper's metric).
5. Breakdowns by category and by source.

**Model-free baselines** on the same cases: random guessing, always the most common answer letter,
copying the real state of the world, and the engine itself.

## Statistics

- Accuracy with a Wilson 95% interval (treats questions as independent, so it is too narrow) **and** a
  family-clustered bootstrap 95% interval (2,000 resamples, fixed seed), which is the one to read.
- Paired comparison of A and B on identical questions: counts of both-correct, A-only, B-only and
  neither; an exact two-sided McNemar test; and the B-minus-A difference with a family-clustered interval.
- With 26 questions the intervals are wide. The write-up must say so.

## Rules for the analysis

1. The protocol, the cases and the prompts are fixed before the run. Each stored result carries a
   fingerprint of the cases and the prompt version.
2. The run is made once as specified. If a run has to be repeated (for example, the key was wrong
   and nothing was recorded), say so. Do not run until a favorable result appears.
3. No case, family, or request is removed after seeing results.
4. If the results are discouraging, the About page shows them as they are.

## What a result can and cannot show

It can show how one model behaved on these 26 questions under these two prompts. It cannot show that
explicit belief tracking "works" in general, say anything about other models, or establish
human-like theory of mind. The paper is explicit about the same limits.

## How to run

```bash
npm run benchmark                                  # rehearsal: checks the benchmark, shows the cost estimate, spends nothing
npm run benchmark -- --dry-run oracle              # free test of the pipeline with a scripted stand-in; NOT a result
ANTHROPIC_API_KEY=... npm run benchmark -- --confirm-spend --publish   # the live run
```

A live run costs a few cents with the default model. `--publish` copies the results to
`src/data/benchmark-results.json`, which the About the Science page reads at build time.

## Deviations

None so far.
