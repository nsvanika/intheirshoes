import type { ChoiceId } from "@/engine/prediction-schema";

/**
 * "Predict, Then Reveal" questions. SERVER-ONLY: this file holds the answers and
 * explanations, so it must never be imported by client code (the browser only ever gets
 * PredictionPrompt, then PredictionReveal after submitting; see src/engine/prediction.ts).
 *
 * How each question is anchored in the research model:
 *  - A question is asked after story step `afterStep`, about what a character will do,
 *    know, or say in the following step. Prompts are hypothetical ("Suppose...") so asking
 *    never states what really happens.
 *  - Each choice lists `reliesOn`: the beliefs the character would need to hold for that
 *    choice to make sense. The tests check these against the belief engine's table at
 *    `afterStep`:
 *      * the best-supported choice relies on beliefs the character really holds;
 *      * every other choice either needs a belief the character does NOT hold, or has no
 *        basis in anything the character has observed or been told (`reliesOn: null`).
 *  - `evidence` points at engine facts to quote after submitting. Only propositions already
 *    visible to the student at `afterStep` may be used, so evidence cannot spoil later events.
 *  - The story's next step (`afterStep + 1`) is consistent with the best-supported choice.
 *
 * "interpretation" questions are about feelings. They have no best answer, no reliesOn, and
 * are labelled as interpretations in the interface. The only one here is Jules after step 4.
 *
 * Wording rules: gentle and nonjudgmental, never "wrong" / "incorrect"; missing information
 * is described as information the character has not been given, never as a mistake.
 */

export interface Reliance {
  proposition: string;
  /** Whether the choice requires the character to believe the proposition (true) or not (false). */
  actorBelieves: boolean;
}

export interface PredictionChoice {
  id: ChoiceId;
  text: string;
  /** Short, kind note shown after submitting. */
  note: string;
  reliesOn: Reliance[] | null;
}

export interface EvidenceRef {
  actorId: string;
  proposition: string;
  /** The proposition whose establishing event explains how the actor did or did not learn it. */
  cause?: string;
}

export interface PredictionQuestion {
  id: string;
  scenarioId: string;
  /** Asked after the student has read this step, before the next one is shown. */
  afterStep: number;
  kind: "belief" | "interpretation";
  characterId: string;
  prompt: string;
  choices: readonly [PredictionChoice, PredictionChoice, PredictionChoice];
  /** The best-supported choice; null for interpretation questions. */
  best: ChoiceId | null;
  explanation: string;
  evidence: EvidenceRef[];
}

export const predictionQuestions: PredictionQuestion[] = [
  {
    id: "group-chat-jordan-saturday",
    scenarioId: "the-unanswered-group-chat",
    afterStep: 3,
    kind: "belief",
    characterId: "jordan",
    prompt:
      "Suppose it is Saturday afternoon. Based on what Jordan has seen and been told so far, what will Jordan most likely do about the movie?",
    choices: [
      {
        id: "a",
        text: "Head to the theater for the 3:00 movie",
        note: "To head to the theater, Jordan would need to know about the 3:00 plan. Jordan hasn't seen the message, so that information isn't available to act on.",
        reliesOn: [{ proposition: "movie_at_3", actorBelieves: true }],
      },
      {
        id: "b",
        text: "Message the group to ask what the plan is",
        note: "Asking is always a friendly idea. Jordan just has nothing yet that would prompt the question, since nothing has told Jordan a plan exists.",
        reliesOn: null,
      },
      {
        id: "c",
        text: "Stay home with no movie plans",
        note: "Jordan's phone stayed in another room, so Jordan never saw the message and has no movie plan to act on.",
        reliesOn: [{ proposition: "movie_at_3", actorBelieves: false }],
      },
    ],
    best: "c",
    explanation:
      "Maya's message was seen by Sam, but not by Jordan, whose phone stayed in another room. People act on what they know rather than on what is true, so Jordan has no reason to head to the theater. Nothing Jordan did was out of the ordinary; the message simply never arrived.",
    evidence: [{ actorId: "jordan", proposition: "movie_at_3" }],
  },
  {
    id: "lunch-seat-priya-next",
    scenarioId: "the-lunch-table-seat",
    afterStep: 3,
    kind: "belief",
    characterId: "priya",
    prompt:
      "Suppose Priya decides what to do next. Based on what Priya knows right now, what is Priya most likely to do?",
    choices: [
      {
        id: "a",
        text: "Sit down in the chair straight away",
        note: "Sitting right down would mean Priya believes the seat is free, but nobody has told Priya that. So far Priya has only seen a bag on the chair.",
        reliesOn: [{ proposition: "seat_free", actorBelieves: true }],
      },
      {
        id: "b",
        text: "Ask whether the seat is taken",
        note: "Priya doesn't yet know whether the seat is free or being saved, and asking is a natural way to find out.",
        reliesOn: [
          { proposition: "seat_free", actorBelieves: false },
          { proposition: "seat_saved", actorBelieves: false },
        ],
      },
      {
        id: "c",
        text: "Leave and look for another table",
        note: "Nothing Priya has seen so far points to leaving. A bag on a chair doesn't tell Priya the table is unwelcoming.",
        reliesOn: null,
      },
    ],
    best: "b",
    explanation:
      "Priya has seen a bag on the only open chair, but nobody has told Priya whether the seat is free or being saved. With that information missing, asking is the best-supported next move. It isn't a mistake to not know; it just means Priya has a question.",
    evidence: [{ actorId: "priya", proposition: "bag_on_chair" }],
  },
  {
    id: "party-alex-walks-in",
    scenarioId: "the-surprise-party",
    afterStep: 4,
    kind: "belief",
    characterId: "alex",
    prompt:
      "Suppose it is Saturday and Alex walks into the room. Based on what Alex has been told so far, what will be true as Alex walks in?",
    choices: [
      {
        id: "a",
        text: "Alex has not been told about the party",
        note: "Alex wasn't part of the planning, and Alex has only noticed the whispering, which doesn't say what it is about.",
        reliesOn: [{ proposition: "party_planned", actorBelieves: false }],
      },
      {
        id: "b",
        text: "Alex already knows a party is planned",
        note: "Alex would need to have seen or been told about the party, and nothing in the story so far has told Alex.",
        reliesOn: [{ proposition: "party_planned", actorBelieves: true }],
      },
      {
        id: "c",
        text: "Alex has been told the day and time of a get-together",
        note: "No one has told Alex anything like that. Dana and Chris have kept the plans to themselves.",
        reliesOn: null,
      },
    ],
    best: "a",
    explanation:
      "Dana and Chris planned the party in step 1, and Alex wasn't part of that. Alex has noticed the whispering, but nothing has told Alex what it is about. So as Alex walks in, Alex doesn't know there is a party. That is missing information, not a mistake.",
    evidence: [{ actorId: "alex", proposition: "party_planned" }],
  },
  {
    id: "jacket-taylor-looks",
    scenarioId: "the-missing-jacket",
    afterStep: 1,
    kind: "belief",
    characterId: "taylor",
    prompt: "Suppose Taylor goes to get the blue jacket. Where will Taylor look for it first?",
    choices: [
      {
        id: "a",
        text: "In Morgan's bag",
        note: "Taylor wasn't there when the jacket was taken, so Taylor has no way of knowing Morgan has it.",
        reliesOn: [{ proposition: "morgan_took_blue_jacket", actorBelieves: true }],
      },
      {
        id: "b",
        text: "In the lost-and-found box",
        note: "Nothing Taylor has seen suggests the jacket was lost.",
        reliesOn: null,
      },
      {
        id: "c",
        text: "On the usual hook",
        note: "Taylor believes the jacket is still on its hook, and nothing has told Taylor otherwise.",
        reliesOn: [{ proposition: "blue_jacket_on_hook", actorBelieves: true }],
      },
    ],
    best: "c",
    explanation:
      "Taylor wasn't there when Morgan took the jacket, so Taylor still believes it is on its hook. That belief is out of date, because the jacket is no longer there, but it is the belief Taylor will act on.",
    evidence: [{ actorId: "taylor", proposition: "blue_jacket_on_hook", cause: "morgan_took_blue_jacket" }],
  },
  {
    id: "joke-eli-says-to-kai",
    scenarioId: "the-joke-that-landed-wrong",
    afterStep: 4,
    kind: "belief",
    characterId: "eli",
    prompt:
      "Suppose Eli wants to describe what happened to Kai. What could Eli honestly say, based on what Eli has seen and heard?",
    choices: [
      {
        id: "a",
        text: "\"Noor was hurt by the joke.\"",
        note: "Eli would need to know how Noor feels, and Noor hasn't said. Eli can see a change, but not the feeling behind it.",
        reliesOn: [{ proposition: "noor_felt_hurt", actorBelieves: true }],
      },
      {
        id: "b",
        text: "\"Noor stopped laughing after the joke.\"",
        note: "Eli noticed this directly, so it is something Eli can say from what Eli saw.",
        reliesOn: [{ proposition: "noor_quiet", actorBelieves: true }],
      },
      {
        id: "c",
        text: "\"Noor is upset about all the hard work.\"",
        note: "That would need Eli to know how Noor feels and why. Nothing Eli has seen or heard says so yet.",
        reliesOn: [{ proposition: "noor_felt_hurt", actorBelieves: true }],
      },
    ],
    best: "b",
    explanation:
      "Eli can see that Noor stopped laughing, but Noor hasn't told Eli how the joke felt. So Eli can describe what Eli noticed without knowing the feeling behind it. This is simply information Eli doesn't have yet.",
    evidence: [
      { actorId: "eli", proposition: "noor_quiet" },
      { actorId: "eli", proposition: "noor_felt_hurt" },
    ],
  },
  {
    id: "wrong-room-ben-monday",
    scenarioId: "the-wrong-room",
    afterStep: 2,
    kind: "belief",
    characterId: "ben",
    prompt: "Suppose it is Monday and Ben heads to the lesson. Where will Ben go?",
    choices: [
      {
        id: "a",
        text: "The usual classroom",
        note: "Ben still believes the lesson is in the usual classroom, because he was packing his bag when the change was announced.",
        reliesOn: [{ proposition: "lesson_in_classroom", actorBelieves: true }],
      },
      {
        id: "b",
        text: "The library",
        note: "Ben would only head to the library if he knew about the change, and he missed the announcement.",
        reliesOn: [{ proposition: "lesson_in_library", actorBelieves: true }],
      },
      {
        id: "c",
        text: "The front office",
        note: "Nothing Ben has seen or heard points to the office.",
        reliesOn: null,
      },
    ],
    best: "a",
    explanation:
      "Ben didn't hear Ms. Ortiz announce the change, so Ben still believes the lesson is in the usual classroom. That belief no longer matches where the lesson is, but it is what Ben will act on.",
    evidence: [{ actorId: "ben", proposition: "lesson_in_classroom", cause: "lesson_in_library" }],
  },
  {
    id: "pen-omar-pocket",
    scenarioId: "the-borrowed-pen",
    afterStep: 3,
    kind: "belief",
    characterId: "omar",
    prompt:
      "Suppose Omar reaches into his pocket that evening. Based on what Omar noticed earlier, what will Omar expect?",
    choices: [
      {
        id: "a",
        text: "Omar will remember putting the pen there",
        note: "Omar slipped the pen in without thinking, so he never registered putting it there.",
        reliesOn: [{ proposition: "pen_in_omars_pocket", actorBelieves: true }],
      },
      {
        id: "b",
        text: "Omar won't have noticed putting the pen there",
        note: "Omar put the pen in his pocket without thinking, so he has no memory of where it went.",
        reliesOn: [{ proposition: "pen_in_omars_pocket", actorBelieves: false }],
      },
      {
        id: "c",
        text: "Omar will think the pen is still on Lucia's desk",
        note: "Omar knows he borrowed the pen, so he wouldn't think it is still with Lucia. He just doesn't know where it ended up.",
        reliesOn: [{ proposition: "pen_with_lucia", actorBelieves: true }],
      },
    ],
    best: "b",
    explanation:
      "Omar knows he borrowed the pen, but he slipped it into his pocket without thinking in step 2, so he never registered where it went. Not knowing where it ended up is a gap in what Omar noticed, not carelessness, and finding it will come as news to him.",
    evidence: [
      { actorId: "omar", proposition: "pen_with_omar" },
      { actorId: "omar", proposition: "pen_in_omars_pocket" },
    ],
  },
  {
    id: "weekend-devon-saturday",
    scenarioId: "the-different-weekend-plans",
    afterStep: 2,
    kind: "belief",
    characterId: "devon",
    prompt: "Suppose Saturday arrives and Devon heads out. What will Devon bring along?",
    choices: [
      {
        id: "a",
        text: "Money for arcade tokens",
        note: "Devon has the arcade in mind and hasn't been told about Zoe's idea, so the arcade is the plan Devon will act on.",
        reliesOn: [{ proposition: "devon_plans_arcade", actorBelieves: true }],
      },
      {
        id: "b",
        text: "Snacks and a blanket for a movie",
        note: "That would need Devon to know Zoe is thinking of a movie at home. Devon hasn't been told.",
        reliesOn: [{ proposition: "zoe_plans_movie_home", actorBelieves: true }],
      },
      {
        id: "c",
        text: "Nothing in particular",
        note: "Devon has a specific idea in mind, so there's no sign Devon would head out with nothing planned.",
        reliesOn: null,
      },
    ],
    best: "a",
    explanation:
      "Devon said \"let's do something\" with the arcade in mind, and Zoe agreed with a movie at home in mind, but neither has said what they are picturing. Devon hasn't been told about Zoe's idea, so Devon will act on the arcade plan. Nobody has done anything unusual here; each simply has information the other doesn't.",
    evidence: [
      { actorId: "devon", proposition: "devon_plans_arcade" },
      { actorId: "devon", proposition: "zoe_plans_movie_home" },
    ],
  },
  {
    id: "group-project-harper-checkin",
    scenarioId: "the-group-project-handoff",
    afterStep: 5,
    kind: "belief",
    characterId: "harper",
    prompt:
      "Suppose the group checks in and Harper tries to work out who was supposed to make the slides. What can Harper say for sure from what Harper has seen and heard?",
    choices: [
      {
        id: "a",
        text: "That Mei said she likes working on design",
        note: "Mei said that to Isaac in a conversation Harper wasn't part of, so Harper hasn't heard it.",
        reliesOn: [{ proposition: "mei_likes_design", actorBelieves: true }],
      },
      {
        id: "b",
        text: "That Isaac was named to make them",
        note: "Harper was in class and heard that nobody was named, so Harper has no basis for saying Isaac was.",
        reliesOn: [{ proposition: "slides_owner_unassigned", actorBelieves: false }],
      },
      {
        id: "c",
        text: "That nobody was named in class",
        note: "Harper was there when the group agreed that someone would make the slides without saying who.",
        reliesOn: [{ proposition: "slides_owner_unassigned", actorBelieves: true }],
      },
    ],
    best: "c",
    explanation:
      "Harper was in class in step 1 when the group agreed that someone would make the slides without saying who, so Harper can say for sure that nobody was named. Harper wasn't part of Mei and Isaac's conversation in step 3, so what Mei said is information Harper doesn't have.",
    evidence: [
      { actorId: "harper", proposition: "slides_owner_unassigned" },
      { actorId: "harper", proposition: "mei_likes_design" },
    ],
  },
  {
    id: "hello-amara-why",
    scenarioId: "the-new-student-hello",
    afterStep: 4,
    kind: "belief",
    characterId: "amara",
    prompt:
      "Suppose Amara wonders about the wave from earlier. What does Amara know about why Theo didn't wave back?",
    choices: [
      {
        id: "a",
        text: "That Theo had a test on their mind",
        note: "That was only in Theo's thoughts, and Amara wasn't there for it, so Amara hasn't been told.",
        reliesOn: [{ proposition: "theo_thinking_about_test", actorBelieves: true }],
      },
      {
        id: "b",
        text: "That Theo ignored the wave on purpose",
        note: "Nothing Amara has seen or heard says this. It would be a guess about what Theo meant.",
        reliesOn: null,
      },
      {
        id: "c",
        text: "Nothing yet about why",
        note: "Amara saw that there was no wave back, but nothing has told Amara the reason.",
        reliesOn: [{ proposition: "theo_thinking_about_test", actorBelieves: false }],
      },
    ],
    best: "c",
    explanation:
      "Amara waved in step 1, but what was on Theo's mind was something only Theo knew. Amara wasn't told, so Amara doesn't know why there was no wave back, and any explanation would be a guess. Not knowing is simply where Amara is in the story.",
    evidence: [{ actorId: "amara", proposition: "theo_thinking_about_test" }],
  },
  {
    id: "practice-nia-thursday",
    scenarioId: "the-rescheduled-practice",
    afterStep: 3,
    kind: "belief",
    characterId: "nia",
    prompt: "Suppose Nia heads to practice on Thursday. When will Nia arrive?",
    choices: [
      {
        id: "a",
        text: "At the new, earlier time",
        note: "Nia would need to know about the change, but the message never reached Nia.",
        reliesOn: [{ proposition: "practice_at_earlier_time", actorBelieves: true }],
      },
      {
        id: "b",
        text: "At the old time",
        note: "Nia never saw the update, so Nia still believes practice is at the old time.",
        reliesOn: [{ proposition: "practice_at_old_time", actorBelieves: true }],
      },
      {
        id: "c",
        text: "Nia won't go to practice",
        note: "Nothing Nia knows gives a reason to skip practice.",
        reliesOn: null,
      },
    ],
    best: "b",
    explanation:
      "Coach Lee's email reached Marcus, but it landed in Nia's spam folder, so Nia never saw it. Nia still believes practice is at the old time. The belief is out of date, but it is a natural one given what Nia has seen.",
    evidence: [
      { actorId: "nia", proposition: "practice_at_old_time", cause: "practice_at_earlier_time" },
      { actorId: "marcus", proposition: "practice_at_earlier_time" },
    ],
  },
  {
    id: "substitute-jules-knows",
    scenarioId: "the-surprise-substitute",
    afterStep: 1,
    kind: "belief",
    characterId: "jules",
    prompt:
      "Suppose Jules has just walked in and found a substitute at the front. Which statement best fits what Jules knows right now?",
    choices: [
      {
        id: "a",
        text: "Jules already knows what today's schedule will be",
        note: "Nobody has told Jules about the schedule yet, so there is nothing for Jules to already know.",
        reliesOn: [{ proposition: "schedule_differs", actorBelieves: true }],
      },
      {
        id: "b",
        text: "Jules knows a substitute is here, and not much else yet",
        note: "Jules can see the substitute, but nothing has explained how today will go.",
        reliesOn: [
          { proposition: "sub_today", actorBelieves: true },
          { proposition: "schedule_differs", actorBelieves: false },
        ],
      },
      {
        id: "c",
        text: "Jules knows why the regular teacher is away",
        note: "Nothing Jules has seen or heard says why. Seeing a substitute doesn't explain it.",
        reliesOn: null,
      },
    ],
    best: "b",
    explanation:
      "Jules saw the substitute in step 1, but no one has explained anything about today yet. So Jules knows what Jules can see and not much more. Not having been told yet is just the beginning of the day, not a problem.",
    evidence: [{ actorId: "jules", proposition: "sub_today" }],
  },
  {
    id: "substitute-jules-feels",
    scenarioId: "the-surprise-substitute",
    afterStep: 4,
    kind: "interpretation",
    characterId: "jules",
    prompt: "Ren offers to share the posted plan. How might Jules feel once Jules has it?",
    choices: [
      {
        id: "a",
        text: "More settled",
        note: "Some people feel steadier once they know what is coming.",
        reliesOn: null,
      },
      {
        id: "b",
        text: "Still a little unsure",
        note: "Some people still feel unsure for a while, even with a plan in hand.",
        reliesOn: null,
      },
      {
        id: "c",
        text: "Curious about the day",
        note: "Some people feel curious about something new, and that is just as reasonable.",
        reliesOn: null,
      },
    ],
    best: null,
    explanation:
      "We can't know exactly how anyone feels, and different people could feel any of these. What we can see from the story is what Jules has been told, which you can see below. How Jules feels about it is an interpretation, so no single answer is right.",
    evidence: [{ actorId: "jules", proposition: "schedule_differs" }],
  },
];

export function getPredictionQuestion(
  scenarioId: string,
  afterStep: number,
): PredictionQuestion | undefined {
  return predictionQuestions.find((q) => q.scenarioId === scenarioId && q.afterStep === afterStep);
}
