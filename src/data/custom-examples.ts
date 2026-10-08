import type { z } from "zod";
import type { ExtractionSchema } from "@/engine/custom-schema";

/**
 * Demo mode for "Make Your Own". With no AI service configured, the app cannot read arbitrary
 * descriptions, so it recognises only these examples, and says so plainly.
 *
 * Each example holds the exact description and the structured reading a parser would return.
 * That reading goes through the SAME validation and the SAME belief engine as real AI output
 * (src/engine/custom-convert.ts), so demo mode exercises the real pipeline. The names are made up.
 */

type Reading = z.input<typeof ExtractionSchema>;

export interface DemoExample {
  id: string;
  title: string;
  text: string;
  /** The reading for an example that needs nothing more from the user. */
  reading?: Reading;
  /** For an example that deliberately leaves something out: the question to ask first... */
  clarify?: Reading;
  /** ...and the reading for each answer (or a kind stop, for "I'm not sure"). */
  byAnswer?: Record<string, Reading>;
}

const NOT_SURE: Reading = {
  status: "cannot_process",
  message:
    "To show what someone knows, we need to know whether they heard it. You can choose Yes or No, or go back and add it to your description.",
};

export const demoExamples: DemoExample[] = [
  {
    id: "moved-notebook",
    title: "The moved notebook",
    text: "Ivy puts her science notebook in her cubby and goes to lunch. While Ivy is at lunch, Kofi moves the notebook to the shelf by the window so he can use the cubby. When Ivy comes back from lunch, she looks in her cubby first and sees that the notebook is not there.",
    reading: {
      status: "ok",
      characters: [
        { id: "ivy", name: "Ivy" },
        { id: "kofi", name: "Kofi" },
      ],
      propositions: [
        {
          id: "notebook_in_cubby",
          text: "The science notebook is in Ivy's cubby",
          quote: "Ivy puts her science notebook in her cubby",
        },
        {
          id: "notebook_on_shelf",
          text: "The notebook is on the shelf by the window",
          quote: "moves the notebook to the shelf by the window",
        },
      ],
      exclusiveGroups: [["notebook_in_cubby", "notebook_on_shelf"]],
      steps: [
        {
          text: "Ivy puts her science notebook in her cubby and goes to lunch.",
          quote: "Ivy puts her science notebook in her cubby and goes to lunch",
          type: "action",
          changes: [{ proposition: "notebook_in_cubby", value: true }],
          observers: ["ivy"],
          accessQuotes: ["Ivy puts her science notebook in her cubby"],
        },
        {
          text: "While Ivy is at lunch, Kofi moves the notebook to the shelf by the window so he can use the cubby.",
          quote: "While Ivy is at lunch, Kofi moves the notebook to the shelf by the window so he can use the cubby",
          type: "action",
          changes: [{ proposition: "notebook_on_shelf", value: true }],
          observers: ["kofi"],
          accessQuotes: ["While Ivy is at lunch, Kofi moves the notebook"],
        },
        {
          text: "Ivy comes back from lunch.",
          quote: "When Ivy comes back from lunch",
          type: "action",
          changes: [],
          observers: [],
          accessQuotes: ["When Ivy comes back from lunch"],
        },
        {
          text: "Ivy looks in her cubby first and sees that the notebook is not there.",
          quote: "she looks in her cubby first and sees that the notebook is not there",
          type: "action",
          changes: [{ proposition: "notebook_in_cubby", value: false }],
          observers: ["ivy"],
          accessQuotes: ["she looks in her cubby first and sees that the notebook is not there"],
        },
      ],
    },
  },
  {
    id: "room-change-text",
    title: "The room-change text",
    text: "Mina texts Dev and Luz that the club meeting moved to Room 12. Dev reads the text right away. Luz's phone is off, so Luz doesn't see the text. Luz thinks the meeting is still in Room 8. At lunchtime, Dev goes to Room 12 and Luz goes to Room 8.",
    reading: {
      status: "ok",
      characters: [
        { id: "mina", name: "Mina" },
        { id: "dev", name: "Dev" },
        { id: "luz", name: "Luz" },
      ],
      propositions: [
        {
          id: "meeting_in_room12",
          text: "The club meeting is in Room 12",
          quote: "the club meeting moved to Room 12",
        },
        {
          id: "meeting_in_room8",
          text: "The club meeting is in Room 8",
          quote: "the meeting is still in Room 8",
        },
        { id: "luz_phone_off", text: "Luz's phone is off", quote: "Luz's phone is off" },
        { id: "dev_in_room12", text: "Dev goes to Room 12", quote: "Dev goes to Room 12" },
        { id: "luz_in_room8", text: "Luz goes to Room 8", quote: "Luz goes to Room 8" },
      ],
      exclusiveGroups: [["meeting_in_room12", "meeting_in_room8"]],
      initialWorld: [{ proposition: "meeting_in_room12", quote: "the club meeting moved to Room 12" }],
      initialBeliefs: [
        { actorId: "luz", proposition: "meeting_in_room8", quote: "Luz thinks the meeting is still in Room 8" },
      ],
      steps: [
        {
          text: "Mina texts Dev and Luz that the club meeting moved to Room 12.",
          quote: "Mina texts Dev and Luz that the club meeting moved to Room 12",
          type: "communication",
          speaker: "mina",
          changes: [{ proposition: "meeting_in_room12", value: true }],
          recipients: ["dev"],
          accessQuotes: ["Dev reads the text right away", "Luz's phone is off, so Luz doesn't see the text"],
        },
        {
          text: "Luz's phone is off, so Luz doesn't see the text.",
          quote: "Luz's phone is off, so Luz doesn't see the text",
          type: "action",
          changes: [{ proposition: "luz_phone_off", value: true }],
          observers: ["luz"],
          accessQuotes: ["Luz's phone is off"],
        },
        {
          text: "Luz thinks the meeting is still in Room 8.",
          quote: "Luz thinks the meeting is still in Room 8",
          type: "action",
          changes: [],
          observers: [],
          accessQuotes: ["Luz thinks the meeting is still in Room 8"],
        },
        {
          text: "At lunchtime, Dev goes to Room 12.",
          quote: "At lunchtime, Dev goes to Room 12",
          type: "action",
          changes: [{ proposition: "dev_in_room12", value: true }],
          observers: ["dev"],
          accessQuotes: ["At lunchtime, Dev goes to Room 12"],
        },
        {
          text: "At lunchtime, Luz goes to Room 8.",
          quote: "Luz goes to Room 8",
          type: "action",
          changes: [{ proposition: "luz_in_room8", value: true }],
          observers: ["luz"],
          accessQuotes: ["Luz goes to Room 8"],
        },
      ],
    },
  },
  {
    id: "trip-day-question",
    title: "The trip day (needs one more detail)",
    text: "Ravi finds out the class trip was moved to Thursday. Ravi tells his friends in the cafeteria. Sana was not in the cafeteria at the time. Later, Theo asks Sana what day the trip is.",
    // The description never says whether Theo was one of the friends who heard Ravi. The app asks.
    clarify: {
      status: "needs_clarification",
      clarification: {
        question: "Did Theo hear Ravi say it in the cafeteria?",
        options: ["Yes, Theo heard it", "No, Theo did not hear it", "I'm not sure"],
      },
    },
    byAnswer: {
      "Yes, Theo heard it": trip("Yes, Theo heard it", ["theo"]),
      "No, Theo did not hear it": trip("No, Theo did not hear it", []),
      "I'm not sure": NOT_SURE,
    },
  },
];

/** The trip example's reading; the only difference is whether Theo was told. */
function trip(answerQuote: string, told: string[]): Reading {
  return {
    status: "ok",
    characters: [
      { id: "ravi", name: "Ravi" },
      { id: "sana", name: "Sana" },
      { id: "theo", name: "Theo" },
    ],
    propositions: [
      {
        id: "trip_on_thursday",
        text: "The class trip was moved to Thursday",
        quote: "the class trip was moved to Thursday",
      },
      {
        id: "sana_not_in_cafeteria",
        text: "Sana was not in the cafeteria at the time",
        quote: "Sana was not in the cafeteria at the time",
      },
    ],
    steps: [
      {
        text: "Ravi finds out the class trip was moved to Thursday.",
        quote: "Ravi finds out the class trip was moved to Thursday",
        type: "action",
        changes: [{ proposition: "trip_on_thursday", value: true }],
        observers: ["ravi"],
        accessQuotes: ["Ravi finds out the class trip was moved to Thursday"],
      },
      {
        text: "Ravi tells his friends in the cafeteria.",
        quote: "Ravi tells his friends in the cafeteria",
        type: "communication",
        speaker: "ravi",
        changes: [{ proposition: "trip_on_thursday", value: true }],
        recipients: told,
        accessQuotes: [answerQuote, "Sana was not in the cafeteria at the time"],
      },
      {
        text: "Sana was not in the cafeteria at the time.",
        quote: "Sana was not in the cafeteria at the time",
        type: "action",
        changes: [{ proposition: "sana_not_in_cafeteria", value: true }],
        observers: ["sana"],
        accessQuotes: ["Sana was not in the cafeteria at the time"],
      },
      {
        text: "Later, Theo asks Sana what day the trip is.",
        quote: "Later, Theo asks Sana what day the trip is",
        type: "communication",
        speaker: "theo",
        changes: [],
        recipients: ["sana"],
        accessQuotes: ["Theo asks Sana what day the trip is"],
      },
    ],
  };
}

export function findDemoExample(id: string | undefined, text: string): DemoExample | undefined {
  if (!id) return undefined;
  const example = demoExamples.find((e) => e.id === id);
  // The text must really be the example, so edited text is never mistaken for one.
  return example && example.text === text ? example : undefined;
}
