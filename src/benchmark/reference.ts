import type { BeliefStory } from "@/engine/schema";

/**
 * An INDEPENDENT second implementation of the belief rules, used only to double-check gold answers.
 *
 * The real engine (src/engine/engine.ts) moves forward through the story, updating every
 * character's beliefs event by event. This reference works differently: for one character and one
 * statement it scans BACKWARDS from the question and asks, "what is the most recent thing this
 * character could have seen, heard or been told about this statement, or about a statement it
 * excludes?" It deliberately imports nothing from the engine. If the two agree on every case, that
 * is real (if not human) evidence that the gold answers follow the stated rules.
 *
 * It applies the same rules from the paper (Sec. III-A): direct observation can update a belief;
 * no access preserves the earlier belief; mutually exclusive statements cannot both be believed;
 * messages reach only their recipients and overhearers. Benchmark stories have no starting
 * beliefs, so a character who learned nothing believes nothing.
 */

type Update = { proposition: string; value: boolean };

function updatesOf(event: BeliefStory["events"][number]): Update[] {
  return event.type === "action" ? event.effects : event.assertions;
}

function hasAccess(event: BeliefStory["events"][number], actorId: string): boolean {
  return event.type === "action"
    ? event.observers.includes(actorId)
    : event.recipients.includes(actorId) || event.overhearers.includes(actorId);
}

function peersOf(story: BeliefStory, proposition: string): string[] {
  const peers = new Set<string>();
  for (const group of story.exclusiveGroups) {
    if (group.includes(proposition)) for (const p of group) if (p !== proposition) peers.add(p);
  }
  return [...peers];
}

export interface ReferenceBelief {
  belief: 0 | 1;
  /** 1-based index of the event that decided it, or null if the character never learned anything. */
  decidedBy: number | null;
}

/** Does `actorId` believe `proposition` after the first `upTo` events? */
export function referenceBelief(
  story: BeliefStory,
  actorId: string,
  proposition: string,
  upTo: number,
): ReferenceBelief {
  const peers = peersOf(story, proposition);
  for (let k = upTo; k >= 1; k--) {
    const event = story.events[k - 1];
    if (!hasAccess(event, actorId)) continue;
    const updates = updatesOf(event);
    const own = updates.find((u) => u.proposition === proposition);
    if (own) return { belief: own.value ? 1 : 0, decidedBy: k };
    // Learning an excluded statement is true means this one is not believed.
    if (updates.some((u) => peers.includes(u.proposition) && u.value)) return { belief: 0, decidedBy: k };
  }
  return { belief: 0, decidedBy: null };
}

/** Is `proposition` true in the world after the first `upTo` events? (Whether or not anyone saw.) */
export function referenceWorld(story: BeliefStory, proposition: string, upTo: number): 0 | 1 {
  const peers = peersOf(story, proposition);
  for (let k = upTo; k >= 1; k--) {
    const updates = updatesOf(story.events[k - 1]);
    // Only actions change the world; what people say does not.
    if (story.events[k - 1].type !== "action") continue;
    const own = updates.find((u) => u.proposition === proposition);
    if (own) return own.value ? 1 : 0;
    if (updates.some((u) => peers.includes(u.proposition) && u.value)) return 0;
  }
  return 0;
}

/** Events up to `upTo` that state or change `proposition` or an excluded statement. */
export function touchingEvents(story: BeliefStory, propositions: string[], upTo: number): number[] {
  const related = new Set(propositions.flatMap((p) => [p, ...peersOf(story, p)]));
  const found: number[] = [];
  story.events.slice(0, upTo).forEach((e, i) => {
    if (updatesOf(e).some((u) => related.has(u.proposition))) found.push(i + 1);
  });
  return found;
}

export function accessKind(
  event: BeliefStory["events"][number],
  actorId: string,
): "observed" | "told" | "overheard" | null {
  if (event.type === "action") return event.observers.includes(actorId) ? "observed" : null;
  if (event.recipients.includes(actorId)) return "told";
  if (event.overhearers.includes(actorId)) return "overheard";
  return null;
}
