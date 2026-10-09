import { z } from "zod";
import type { BenchmarkCase, Letter } from "./build";
import type { Method } from "./prompts";

/**
 * Strict scoring, identical for both methods.
 *
 * PRIMARY metric ("correct"): the reply is valid for the format that condition asked for AND the
 * final answer equals the gold answer. Every other request counts as a failure, whatever the reason:
 *   - api_error        the request itself failed (network, auth, rate limit...) after retries
 *   - refusal          the model declined
 *   - truncated        the reply hit the length limit
 *   - unparseable      no JSON object could be read
 *   - malformed        JSON, but not the requested shape (missing or extra fields, wrong types)
 *   - invalid_answer   the final answer is not one of the offered letters
 *   - incomplete_table (Method B only) the belief table is missing rows, repeats rows, or has
 *                      rows that are not asked for; this mirrors the paper's strict rule that
 *                      missing, duplicate, extra or malformed rows are incorrect
 *   - wrong            everything was valid, and the answer is simply not the gold answer
 *
 * API failures are real failures under the primary metric, but they are NOT model mistakes, so the
 * report always lists them separately. Nothing is silently dropped.
 *
 * SECONDARY metric ("answer only"): the final answer is correct whenever one letter can be read,
 * even if a table was incomplete. It separates "could not reason it out" from "could not format it".
 */

export type Outcome =
  | "correct"
  | "wrong"
  | "api_error"
  | "refusal"
  | "truncated"
  | "unparseable"
  | "malformed"
  | "invalid_answer"
  | "incomplete_table";

export const FAILURE_OUTCOMES: Outcome[] = [
  "wrong",
  "api_error",
  "refusal",
  "truncated",
  "unparseable",
  "malformed",
  "invalid_answer",
  "incomplete_table",
];

export interface RawReply {
  text?: string;
  stopReason?: string | null;
  /** Set when the request itself failed. */
  error?: string;
}

export interface Evaluation {
  outcome: Outcome;
  answer: Letter | null;
  primaryCorrect: boolean;
  answerOnlyCorrect: boolean;
  /** Method B: share of the required table rows that match the engine's table (missing rows count as wrong). */
  rowAccuracy: number | null;
  /** Method B: does the final answer agree with the model's own table? */
  tableConsistent: boolean | null;
}

const LetterSchema = z.enum(["A", "B", "C"]);
const AnswerOnlySchema = z.strictObject({ final_answer: LetterSchema });
const RowSchema = z.strictObject({
  t: z.number().int(),
  character: z.string(),
  statement: z.string(),
  belief: z.union([z.literal(0), z.literal(1)]),
});
const TableReplySchema = z.strictObject({ table: z.array(RowSchema), final_answer: LetterSchema });

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

const fail = (outcome: Outcome, extra: Partial<Evaluation> = {}): Evaluation => ({
  outcome,
  answer: null,
  primaryCorrect: false,
  answerOnlyCorrect: false,
  rowAccuracy: null,
  tableConsistent: null,
  ...extra,
});

/** The final letter, if one can be read even from a reply that is otherwise malformed. */
function salvageLetter(parsed: unknown, c: BenchmarkCase): Letter | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const v = (parsed as Record<string, unknown>).final_answer;
  const ok = typeof v === "string" && ["A", "B", "C"].includes(v) && c.question.options.some((o) => o.letter === v);
  return ok ? (v as Letter) : null;
}

/** Scores the table against the engine's table, the paper's row-level metric. */
export function scoreTable(
  table: z.infer<typeof RowSchema>[],
  c: BenchmarkCase,
): { rowAccuracy: number; complete: boolean; impliedAnswer: Letter | null } {
  const idByName = new Map(c.characters.map((x) => [x.name.trim().toLowerCase(), x.id]));
  const gold = new Map(c.gold.rows.map((r) => [`${r.t}|${r.characterId}|${r.statementId}`, r.belief]));
  const seen = new Map<string, 0 | 1>();
  let duplicates = 0;
  let unknown = 0;
  for (const row of table) {
    const characterId = idByName.get(row.character.trim().toLowerCase());
    const key = `${row.t}|${characterId}|${row.statement.trim()}`;
    if (!characterId || !gold.has(key)) {
      unknown++;
      continue;
    }
    if (seen.has(key)) duplicates++;
    else seen.set(key, row.belief);
  }
  let correct = 0;
  for (const [key, belief] of gold) if (seen.get(key) === belief) correct++;
  const complete = seen.size === gold.size && duplicates === 0 && unknown === 0;

  // what the model's own table says about the question, at the last time step
  const n = c.sentences.length;
  const believes = (statementId: string) =>
    seen.get(`${n}|${c.question.targetCharacterId}|${statementId}`) === 1;
  let impliedKey: string | null = null;
  const target = c.question;
  if (target.kind === "yes_no") {
    impliedKey = target.targetStatementId && believes(target.targetStatementId) ? "yes" : "no";
  } else {
    const held = target.options.find((o) => o.key !== "none" && believes(c.statements.find((s) => s.propId === o.key)!.id));
    impliedKey = held ? held.key : "none";
  }
  const impliedAnswer = c.question.options.find((o) => o.key === impliedKey)?.letter ?? null;
  return { rowAccuracy: gold.size === 0 ? 0 : correct / gold.size, complete, impliedAnswer };
}

export function evaluateReply(method: Method, c: BenchmarkCase, reply: RawReply): Evaluation {
  if (reply.error !== undefined) return fail("api_error");
  if (reply.stopReason === "refusal") return fail("refusal");
  if (reply.stopReason === "max_tokens") return fail("truncated");
  if (!reply.text || !reply.text.trim()) return fail("unparseable");

  let parsed: unknown;
  try {
    parsed = extractJson(reply.text);
  } catch {
    return fail("unparseable");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail("unparseable");

  const salvaged = salvageLetter(parsed, c);
  const answerOnlyCorrect = salvaged !== null && salvaged === c.gold.answer;

  if (method === "A") {
    const ok = AnswerOnlySchema.safeParse(parsed);
    if (!ok.success) return fail("malformed", { answer: salvaged, answerOnlyCorrect });
    if (!c.question.options.some((o) => o.letter === ok.data.final_answer)) {
      return fail("invalid_answer", { answer: null });
    }
    const correct = ok.data.final_answer === c.gold.answer;
    return {
      outcome: correct ? "correct" : "wrong",
      answer: ok.data.final_answer,
      primaryCorrect: correct,
      answerOnlyCorrect: correct,
      rowAccuracy: null,
      tableConsistent: null,
    };
  }

  const ok = TableReplySchema.safeParse(parsed);
  if (!ok.success) return fail("malformed", { answer: salvaged, answerOnlyCorrect });
  if (!c.question.options.some((o) => o.letter === ok.data.final_answer)) {
    return fail("invalid_answer", { rowAccuracy: scoreTable(ok.data.table, c).rowAccuracy });
  }
  const t = scoreTable(ok.data.table, c);
  const correct = ok.data.final_answer === c.gold.answer;
  const base = {
    answer: ok.data.final_answer,
    answerOnlyCorrect: correct,
    rowAccuracy: t.rowAccuracy,
    tableConsistent: t.impliedAnswer === ok.data.final_answer,
  };
  if (!t.complete) return { outcome: "incomplete_table", primaryCorrect: false, ...base };
  return { outcome: correct ? "correct" : "wrong", primaryCorrect: correct, ...base };
}
