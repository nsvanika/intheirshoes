import { getCase } from "./build";
import { evaluateReply, type Outcome } from "./evaluate";
import { tableFor } from "./scripted";

/**
 * A free demonstration of how replies are SCORED, using hand-made stand-in replies to one question.
 * It makes no model call and produces no accuracy figure. It is not an evaluation of any AI.
 */
export interface ScoringExample {
  reply: string;
  method: "A" | "B";
  outcome: Outcome;
  counted: "correct" | "not correct";
}

export function scoringExamples(): ScoringExample[] {
  const c = getCase("classic-sally-anne");
  const wrong = c.question.options.find((o) => o.letter !== c.gold.answer)!.letter;
  const goldTable = tableFor(c, (_t, _a, _p, g) => g);
  const cases: { reply: string; method: "A" | "B"; text: string }[] = [
    { reply: "Gives the checked answer in the right format", method: "A", text: JSON.stringify({ final_answer: c.gold.answer }) },
    { reply: "Gives the other option (what a world-copying rule would say)", method: "A", text: JSON.stringify({ final_answer: wrong }) },
    { reply: "Chats instead of using the required format", method: "A", text: "I think she will probably look in the basket." },
    { reply: "Full belief table and the checked answer", method: "B", text: JSON.stringify({ table: goldTable, final_answer: c.gold.answer }) },
    { reply: "Right answer but a row is missing from the table", method: "B", text: JSON.stringify({ table: goldTable.slice(1), final_answer: c.gold.answer }) },
  ];
  return cases.map((x) => {
    const e = evaluateReply(x.method, c, { text: x.text, stopReason: "end_turn" });
    return { reply: x.reply, method: x.method, outcome: e.outcome, counted: e.primaryCorrect ? "correct" : "not correct" };
  });
}
