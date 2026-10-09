import type { BenchmarkCase } from "./build";

/**
 * The two prompts. They are built from the SAME pieces so the only difference is what the model is
 * asked to produce before it answers:
 *
 *   Method A (plain prompting):  answer directly.
 *   Method B (explicit tracking): first write a time-indexed belief-state table, then answer.
 *
 * Everything else is identical: the instructions about what belief means, the story, the character
 * list, the statement vocabulary, the time-step definition, the question, the options, the answer
 * format (JSON with "final_answer"), the model, and the settings. This mirrors the paper, whose
 * two prompt conditions both gave the narrative, actors, proposition vocabulary, time steps and a
 * belief definition (Sec. IV-C). The one documented difference is the "table" field in Method B.
 */

export type Method = "A" | "B";

export const SYSTEM_PROMPT =
  "You are a careful reader. You answer questions about what the characters in a short story believe. You reply with one JSON object and nothing else.";

export const PROMPT_VERSION = "1.0";

/** Number of rows Method B must return: every time step, every character, every statement. */
export function requiredRowCount(c: BenchmarkCase): number {
  return c.sentences.length * c.characters.length * c.statements.length;
}

function common(c: BenchmarkCase): string {
  const letters = c.question.options.map((o) => o.letter).join(", ");
  return [
    "Read the story and answer the question about what a character believes.",
    "",
    "How to decide what a character believes:",
    "- A character believes something only if they saw it happen, were told it, or overheard it.",
    "- A character who was not there, or who was not told, does not know about it. They keep believing whatever they last saw or were told.",
    "- What a character believes can be different from what is actually true.",
    "",
    `STORY (time step 0 is before the story; time step k is the moment right after sentence k):`,
    ...c.sentences.map((s, i) => `${i + 1}. ${s}`),
    "",
    `CHARACTERS: ${c.characters.map((x) => x.name).join("; ")}`,
    `STATEMENTS (used to talk about beliefs): ${c.statements.map((s) => `${s.id}: ${s.text}`).join(" | ")}`,
    "",
    `QUESTION: ${c.question.text}`,
    "OPTIONS:",
    ...c.question.options.map((o) => `${o.letter}. ${o.text}`),
    "",
    `The answer letter must be one of: ${letters}.`,
  ].join("\n");
}

export function buildPrompt(method: Method, c: BenchmarkCase): string {
  const letters = c.question.options.map((o) => o.letter).join(" or ");
  if (method === "A") {
    return [
      common(c),
      "",
      "Answer directly. Reply with ONLY this JSON object and nothing else:",
      `{"final_answer": "<${letters}>"}`,
    ].join("\n");
  }
  const n = c.sentences.length;
  return [
    common(c),
    "",
    "Before you answer, build a belief-state table.",
    `For every time step t from 1 to ${n}, for every character, and for every statement, write belief = 1 if that character believes the statement right after sentence t, otherwise belief = 0.`,
    `The table must have exactly ${requiredRowCount(c)} rows (${n} time steps x ${c.characters.length} characters x ${c.statements.length} statements), each once. Use the character names and statement ids exactly as listed above.`,
    "Then give your final answer, using your table.",
    "Reply with ONLY this JSON object and nothing else:",
    `{"table": [{"t": 1, "character": "<name>", "statement": "S1", "belief": 0}, ...], "final_answer": "<${letters}>"}`,
  ].join("\n");
}
