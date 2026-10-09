import { trackBeliefs } from "@/engine/engine";
import { BeliefStorySchema, type BeliefStory } from "@/engine/schema";
import { accessKind, referenceBelief, referenceWorld, touchingEvents } from "./reference";
import { caseSpecs, type CaseSpec, type Category, type Source } from "./specs";

/**
 * Turns each authored CaseSpec into a full benchmark case: the story, the question, three or two
 * answer options, the gold answer (computed by the existing engine, not typed by hand), a plain
 * explanation, and a record of how the gold answer was validated.
 */

export type Letter = "A" | "B" | "C";

export interface Option {
  letter: Letter;
  text: string;
  /** What the option means: "yes" / "no" for yes-no questions; a statement id or "none" for choices. */
  key: string;
}

export interface GoldRow {
  t: number;
  characterId: string;
  statementId: string;
  belief: 0 | 1;
}

export interface ValidationRecord {
  goldMethod: string;
  independentCheck: { method: string; agrees: boolean };
  selfContained: boolean;
  schemaValid: boolean;
  declaredCategoryMatchesDerived: boolean;
  humanReview: string;
}

export interface BenchmarkCase {
  id: string;
  familyId: string;
  source: Source;
  parent?: string;
  citation?: string;
  adaptation: string;
  category: Category;
  characters: { id: string; name: string }[];
  /** The statements (propositions) the belief table is about, with short ids S1, S2, ... */
  statements: { id: string; propId: string; text: string }[];
  sentences: string[];
  question: {
    text: string;
    targetCharacterId: string;
    targetCharacterName: string;
    /** For yes-no questions: the statement the question is about (S1, S2, ...). */
    targetStatementId: string | null;
    kind: "yes_no" | "choice";
    options: Option[];
  };
  gold: {
    answer: Letter;
    answerKey: string;
    /** True if the character's belief differs from what is true in the world (the paper's divergence rows). */
    divergence: boolean;
    /** The answer a reasoner who only copies the world state would give. */
    realityCopyAnswer: Letter;
    explanation: string;
    rows: GoldRow[];
    validation: ValidationRecord;
  };
  structured: BeliefStory;
}

// A small seeded generator so the option order is fixed and reproducible.
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function shuffled<T>(items: T[], seed: string): T[] {
  let state = hash(seed) || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function storyOf(spec: CaseSpec): BeliefStory {
  return BeliefStorySchema.parse({
    scenarioId: spec.id,
    actors: Object.entries(spec.actors).map(([id, name]) => ({ id, name })),
    propositions: Object.entries(spec.props).map(([id, text]) => ({ id, text })),
    exclusiveGroups: spec.groups ?? [],
    initialWorld: [],
    initialBeliefs: {},
    events: spec.steps.map((s, i) => {
      const base = { id: `e${i + 1}`, t: i + 1, description: s.text };
      const changes = Object.entries(s.changes ?? {}).map(([proposition, value]) => ({ proposition, value }));
      return s.kind === "act"
        ? { type: "action", ...base, effects: changes, observers: s.observers ?? [] }
        : {
            type: "communication",
            ...base,
            speaker: s.speaker,
            assertions: changes,
            recipients: s.recipients ?? [],
            overhearers: s.overhearers ?? [],
          };
    }),
  });
}

const VERB = { observed: "saw this happen", told: "was told this", overheard: "overheard this" } as const;

export function buildCase(spec: CaseSpec): BenchmarkCase {
  const story = storyOf(spec);
  const n = story.events.length;
  const table = trackBeliefs(story);
  const last = table.steps[n];
  const nameOf = (id: string) => spec.actors[id];
  const textOf = (id: string) => spec.props[id];
  const who = spec.target.actor;
  const name = nameOf(who);
  const row = last.actors.find((a) => a.actorId === who)!;

  const statements = Object.entries(spec.props).map(([propId, text], i) => ({ id: `S${i + 1}`, propId, text }));

  // ---- the question and its options, and the gold answer from the ENGINE
  let optionDefs: { key: string; text: string }[];
  let goldKey: string;
  let realityKey: string;
  let questionText: string;
  let propsInvolved: string[];

  if (spec.target.kind === "yes_no") {
    const prop = spec.target.prop;
    propsInvolved = [prop];
    questionText = `At the end of the story, does ${name} believe this statement: "${textOf(prop)}"?`;
    optionDefs = [
      { key: "yes", text: `Yes, ${name} believes it.` },
      { key: "no", text: `No, ${name} does not believe it.` },
    ];
    goldKey = row.beliefs[prop] === 1 ? "yes" : "no";
    realityKey = last.world[prop] === 1 ? "yes" : "no";
  } else {
    const group = spec.target.group;
    propsInvolved = group;
    questionText = `At the end of the story, which of these does ${name} believe? If ${name} has no belief about it, choose the option that says so.`;
    optionDefs = [
      ...group.map((p) => ({ key: p, text: textOf(p) })),
      { key: "none", text: `${name} has no belief about this, because ${name} has not seen it or been told.` },
    ];
    goldKey = group.find((p) => row.beliefs[p] === 1) ?? "none";
    realityKey = group.find((p) => last.world[p] === 1) ?? "none";
  }

  const options: Option[] = shuffled(optionDefs, spec.id).map((o, i) => ({
    letter: (["A", "B", "C"] as const)[i],
    text: o.text,
    key: o.key,
  }));
  const letterOf = (key: string) => options.find((o) => o.key === key)!.letter;

  // ---- category, derived from the engine's own belief and world values
  let category: Category;
  let divergence: boolean;
  if (spec.target.kind === "yes_no") {
    const b = row.beliefs[spec.target.prop];
    const w = last.world[spec.target.prop];
    category = b === 1 ? (w === 1 ? "true_belief_control" : "false_belief") : "missing_information";
    divergence = b !== w;
  } else {
    category = goldKey === "none" ? "missing_information" : realityKey === goldKey ? "true_belief_control" : "false_belief";
    divergence = goldKey !== realityKey;
  }

  // ---- independent check: the backward-scanning reference must agree with the engine
  let agrees = true;
  for (const p of Object.keys(spec.props)) {
    const ref = referenceBelief(story, who, p, n).belief;
    if (ref !== row.beliefs[p] || referenceWorld(story, p, n) !== last.world[p]) agrees = false;
  }
  for (const step of table.steps.slice(1)) {
    for (const a of step.actors) {
      for (const p of Object.keys(spec.props)) {
        if (referenceBelief(story, a.actorId, p, step.t).belief !== a.beliefs[p]) agrees = false;
      }
    }
  }

  // ---- a plain explanation built from the same facts
  const touching = touchingEvents(story, propsInvolved, n);
  const decision = propsInvolved
    .map((p) => referenceBelief(story, who, p, n))
    .filter((r) => r.decidedBy !== null)
    .sort((a, b) => (b.decidedBy ?? 0) - (a.decidedBy ?? 0))[0];
  const sentence = (k: number) => `"${spec.steps[k - 1].text.replace(/\.$/, "")}"`;
  const heldText =
    spec.target.kind === "yes_no" ? textOf(spec.target.prop) : goldKey === "none" ? "" : textOf(goldKey);
  const parts: string[] = [];
  if (goldKey === "none" || goldKey === "no") {
    if (!decision) {
      parts.push(
        `Nothing in the story shows ${name} seeing, hearing or being told this. ${sentence(touching[0])} happened without ${name} knowing, so ${name} does not believe it.`,
      );
    } else {
      const how = accessKind(story.events[decision.decidedBy! - 1], who)!;
      parts.push(`${name} ${VERB[how]} in ${sentence(decision.decidedBy!)}, and it did not lead ${name} to believe this.`);
    }
  } else {
    const k = decision!.decidedBy!;
    const how = accessKind(story.events[k - 1], who)!;
    parts.push(`${name} believes: ${heldText}. ${name} ${VERB[how]} in ${sentence(k)}.`);
    const missed = touching.filter((e) => e > k && !accessKind(story.events[e - 1], who));
    if (missed.length > 0) {
      parts.push(
        `Later, ${sentence(missed[0])} happened without ${name} seeing or hearing it, so ${name}'s belief was never updated.`,
      );
    }
    parts.push(
      category === "false_belief"
        ? `So ${name} still believes it, even though it is no longer true. That is a false belief.`
        : `${name}'s belief matches what is true.`,
    );
  }

  const selfContained =
    story.initialWorld.length === 0 && Object.keys(story.initialBeliefs).length === 0;

  const rows: GoldRow[] = [];
  for (const step of table.steps.slice(1)) {
    for (const a of step.actors) {
      for (const s of statements) {
        rows.push({ t: step.t, characterId: a.actorId, statementId: s.id, belief: a.beliefs[s.propId] });
      }
    }
  }

  return {
    id: spec.id,
    familyId: spec.familyId,
    source: spec.source,
    parent: spec.parent,
    citation: spec.citation,
    adaptation: spec.adaptation,
    category,
    characters: Object.entries(spec.actors).map(([id, nm]) => ({ id, name: nm })),
    statements,
    sentences: spec.steps.map((s) => s.text),
    question: {
      text: questionText,
      targetCharacterId: who,
      targetCharacterName: name,
      targetStatementId:
        spec.target.kind === "yes_no" ? statements.find((s) => s.propId === (spec.target as { prop: string }).prop)!.id : null,
      kind: spec.target.kind,
      options,
    },
    gold: {
      answer: letterOf(goldKey),
      answerKey: goldKey,
      divergence,
      realityCopyAnswer: letterOf(realityKey),
      explanation: parts.join(" "),
      rows,
      validation: {
        goldMethod:
          "Computed by the project's deterministic belief engine (src/engine/engine.ts), the paper's symbolic oracle, run on the structured version of the story. The answer is never typed by hand.",
        independentCheck: {
          method:
            "A separately written backward-scanning reference implementation (src/benchmark/reference.ts) recomputed every belief at every step; it must agree with the engine.",
          agrees,
        },
        selfContained,
        schemaValid: true,
        declaredCategoryMatchesDerived: category === spec.declaredCategory,
        humanReview:
          "The author checked that the sentences state everything the answer depends on. This is NOT an independent human audit; like the paper's own gold labels, it has not yet been annotated by a second person.",
      },
    },
    structured: story,
  };
}

export const benchmarkCases: BenchmarkCase[] = caseSpecs.map(buildCase);

export function getCase(id: string): BenchmarkCase {
  const found = benchmarkCases.find((c) => c.id === id);
  if (!found) throw new Error(`unknown benchmark case ${id}`);
  return found;
}

/** A fingerprint of the cases, stored with results so a result can be tied to exactly these cases. */
export function casesFingerprint(cases: BenchmarkCase[] = benchmarkCases): string {
  const text = JSON.stringify(
    cases.map((c) => [c.id, c.sentences, c.question, c.gold.answer, c.statements.map((s) => s.text)]),
  );
  return hash(text).toString(16).padStart(8, "0");
}
