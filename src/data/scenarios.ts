export type ScenarioTheme =
  | "Misunderstanding"
  | "Missed message"
  | "Surprise"
  | "Misplaced belonging"
  | "Different perspectives";

export interface Character {
  /** Unique within a scenario; steps refer to it. */
  id: string;
  name: string;
  /** Short description of who they are in this situation. */
  role: string;
}

export interface Step {
  /** The character this step is mostly about. */
  characterId: string;
  /** One sentence, in chronological order. */
  text: string;
}

export interface Scenario {
  /** Unique, URL-safe identifier. Used in /scenarios/[id]. */
  id: string;
  title: string;
  /** One short sentence shown on the home page card. */
  description: string;
  theme: ScenarioTheme;
  /** 2–3 characters. */
  characters: Character[];
  /** 4–6 steps. */
  steps: Step[];
}

export const scenarios: Scenario[] = [
  {
    id: "the-unanswered-group-chat",
    title: "The Unanswered Group Chat",
    description: "A plan gets made in a chat, and one person never sees it.",
    theme: "Missed message",
    characters: [
      { id: "maya", name: "Maya", role: "Plans a weekend movie outing" },
      { id: "jordan", name: "Jordan", role: "Friend whose phone was off" },
      { id: "sam", name: "Sam", role: "Friend who is also invited" },
    ],
    steps: [
      { characterId: "maya", text: "Maya posts in the group chat that the movie starts at 3:00 on Saturday." },
      { characterId: "sam", text: "Sam replies with a thumbs-up and says they will be there." },
      { characterId: "jordan", text: "Jordan's phone is charging in another room all afternoon, so the message goes unseen." },
      { characterId: "jordan", text: "On Saturday, Jordan has no idea about the plan and stays home." },
      { characterId: "maya", text: "At the theater, Maya wonders why Jordan has not arrived and feels a little worried." },
    ],
  },
  {
    id: "the-lunch-table-seat",
    title: "The Lunch Table Seat",
    description: "A bag on a chair means two different things to two people.",
    theme: "Different perspectives",
    characters: [
      { id: "riley", name: "Riley", role: "Sets a bag on a chair at the lunch table" },
      { id: "priya", name: "Priya", role: "Looks for a place to sit" },
    ],
    steps: [
      { characterId: "riley", text: "Riley puts a backpack on a chair at the lunch table to keep it off the floor." },
      { characterId: "priya", text: "Priya arrives with a tray and sees a bag on the only open chair." },
      { characterId: "priya", text: "Priya cannot tell whether the seat is being saved or the bag was simply left there." },
      { characterId: "priya", text: "Priya decides to ask Riley, \"Is anyone sitting here?\"" },
      { characterId: "riley", text: "Riley says the seat is free and smiles." },
      { characterId: "riley", text: "Riley lifts the bag off the chair so Priya can sit down." },
    ],
  },
  {
    id: "the-surprise-party",
    title: "The Surprise Party",
    description: "Friends plan a surprise, and the guest of honor feels left out.",
    theme: "Surprise",
    characters: [
      { id: "alex", name: "Alex", role: "Has a birthday coming up" },
      { id: "dana", name: "Dana", role: "Organizing the surprise" },
      { id: "chris", name: "Chris", role: "Helping keep the secret" },
    ],
    steps: [
      { characterId: "dana", text: "Dana and Chris quietly plan a surprise party for Alex's birthday." },
      { characterId: "alex", text: "Alex notices that Dana and Chris stop talking whenever Alex walks over." },
      { characterId: "alex", text: "Alex starts to wonder if they did something wrong or if their friends are upset." },
      { characterId: "chris", text: "Chris sees that Alex looks sad and feels unsure whether to give away the secret." },
      { characterId: "alex", text: "On Saturday, Alex walks into the party, feels relieved, and understands why everyone was whispering." },
    ],
  },
  {
    id: "the-missing-jacket",
    title: "The Missing Jacket",
    description: "A favorite jacket disappears from the locker room.",
    theme: "Misplaced belonging",
    characters: [
      { id: "taylor", name: "Taylor", role: "Cannot find their jacket" },
      { id: "morgan", name: "Morgan", role: "Teammate who took a matching jacket" },
    ],
    steps: [
      { characterId: "morgan", text: "After gym class, Morgan takes a blue jacket from a hook on the way out because it looks just like their own." },
      { characterId: "taylor", text: "A little later, Taylor cannot find their blue jacket on the usual hook." },
      { characterId: "taylor", text: "Taylor feels worried and starts to suspect that someone took it." },
      { characterId: "morgan", text: "At home, Morgan sees a different name tag inside the collar and realizes it is not theirs." },
      { characterId: "morgan", text: "The next morning, Morgan returns the jacket to Taylor and explains the mix-up." },
    ],
  },
  {
    id: "the-joke-that-landed-wrong",
    title: "The Joke That Landed Wrong",
    description: "A joke meant to be funny hurts someone's feelings.",
    theme: "Misunderstanding",
    characters: [
      { id: "eli", name: "Eli", role: "Makes a joke" },
      { id: "noor", name: "Noor", role: "Hears the joke" },
      { id: "kai", name: "Kai", role: "Another friend nearby" },
    ],
    steps: [
      { characterId: "eli", text: "Eli jokes that Noor always takes forever to finish group projects." },
      { characterId: "kai", text: "Kai laughs at the joke." },
      { characterId: "noor", text: "Noor stops laughing and goes quiet, feeling hurt because they have been working hard on the project." },
      { characterId: "eli", text: "Eli notices that Noor has stopped laughing and feels confused." },
      { characterId: "noor", text: "Later, Eli asks Noor how the joke felt, and Noor says it hurt because they have worked hard on the project." },
      { characterId: "eli", text: "Eli says they did not mean to hurt anyone." },
    ],
  },
  {
    id: "the-wrong-room",
    title: "The Wrong Room",
    description: "A room change was announced, but not everyone heard it.",
    theme: "Missed message",
    characters: [
      { id: "ben", name: "Ben", role: "Student who missed the announcement" },
      { id: "ms-ortiz", name: "Ms. Ortiz", role: "Teacher" },
    ],
    steps: [
      { characterId: "ms-ortiz", text: "At the end of Friday's class, Ms. Ortiz says Monday's lesson will be in the library." },
      { characterId: "ben", text: "Ben is packing his bag at that moment and does not hear the change." },
      { characterId: "ben", text: "On Monday, Ben sits down in the empty classroom and waits." },
      { characterId: "ben", text: "After a few minutes, Ben checks the posted schedule and finds the room change." },
      { characterId: "ms-ortiz", text: "Ben walks into the library, and Ms. Ortiz says, \"Glad you found us, have a seat.\"" },
    ],
  },
  {
    id: "the-borrowed-pen",
    title: "The Borrowed Pen",
    description: "A pen is lent in class and then quietly forgotten.",
    theme: "Misplaced belonging",
    characters: [
      { id: "lucia", name: "Lucia", role: "Lends a favorite pen" },
      { id: "omar", name: "Omar", role: "Borrows the pen" },
    ],
    steps: [
      { characterId: "omar", text: "Omar forgets a pen, so Lucia lends him her favorite one during a quiz." },
      { characterId: "omar", text: "When the bell rings, Omar slips the pen into his pocket without thinking." },
      { characterId: "lucia", text: "That evening, Lucia reaches for her favorite pen, remembers lending it to Omar, and wonders whether he still has it." },
      { characterId: "omar", text: "Later that evening, Omar finds the pen in his jeans and remembers whose it is." },
      { characterId: "omar", text: "The next day, Omar returns it and says sorry for the confusion." },
    ],
  },
  {
    id: "the-different-weekend-plans",
    title: "The Different Weekend Plans",
    description: "Two friends each expect the weekend to go a different way.",
    theme: "Different perspectives",
    characters: [
      { id: "zoe", name: "Zoe", role: "Has a movie at home in mind" },
      { id: "devon", name: "Devon", role: "Has the arcade in mind" },
    ],
    steps: [
      { characterId: "devon", text: "Devon says, \"Let's do something this weekend,\" with a trip to the arcade in mind." },
      { characterId: "zoe", text: "Zoe says that sounds good, with a movie at home in mind." },
      { characterId: "devon", text: "On Saturday, Devon arrives dressed for the arcade with money for tokens." },
      { characterId: "zoe", text: "Zoe is surprised, since snacks and blankets are already set out for a movie." },
      { characterId: "devon", text: "Devon tells Zoe about the plan to go to the arcade." },
      { characterId: "zoe", text: "Zoe says the plan was a movie at home, and they decide to do the movie first and the arcade afterward." },
    ],
  },
  {
    id: "the-group-project-handoff",
    title: "The Group Project Handoff",
    description: "Nobody was named to make the slides, and people read the situation differently.",
    theme: "Misunderstanding",
    characters: [
      { id: "harper", name: "Harper", role: "Writes the report" },
      { id: "isaac", name: "Isaac", role: "Group member" },
      { id: "mei", name: "Mei", role: "Group member who likes design" },
    ],
    steps: [
      { characterId: "harper", text: "In class, the group agrees that someone will make the slides, but nobody says who." },
      { characterId: "harper", text: "After school, Harper finishes the written report." },
      { characterId: "mei", text: "That evening, Mei tells Isaac that she likes working on design." },
      { characterId: "isaac", text: "Isaac takes this to mean that Mei plans to make the slides, so he does not start them." },
      { characterId: "mei", text: "Mei was only sharing what she enjoys, and nobody has asked her to make the slides." },
      { characterId: "harper", text: "The night before the presentation, the group checks in, finds that nobody has started the slides, and splits the work between them." },
    ],
  },
  {
    id: "the-new-student-hello",
    title: "The New Student's Hello",
    description: "A new student waves, and the wave is easy to miss.",
    theme: "Different perspectives",
    characters: [
      { id: "amara", name: "Amara", role: "New student" },
      { id: "theo", name: "Theo", role: "Student walking by" },
    ],
    steps: [
      { characterId: "amara", text: "On Amara's first day, they give a small wave to a student walking down the hall." },
      { characterId: "theo", text: "Theo is thinking about a test and does not notice the wave." },
      { characterId: "amara", text: "Amara does not get a wave back and wonders whether Theo saw it." },
      { characterId: "theo", text: "Later at lunch, Theo sees Amara and says hello." },
      { characterId: "theo", text: "Theo mentions that a test was on their mind in the hall, and Amara smiles." },
    ],
  },
  {
    id: "the-rescheduled-practice",
    title: "The Rescheduled Practice",
    description: "A practice time changes, and one message is sent to the wrong place.",
    theme: "Missed message",
    characters: [
      { id: "coach-lee", name: "Coach Lee", role: "Sends the schedule update" },
      { id: "nia", name: "Nia", role: "Player who arrives at the old time" },
      { id: "marcus", name: "Marcus", role: "Teammate who saw the update" },
    ],
    steps: [
      { characterId: "coach-lee", text: "Coach Lee moves Thursday's practice one hour earlier and emails the team." },
      { characterId: "nia", text: "The email lands in Nia's spam folder, so Nia never sees it." },
      { characterId: "marcus", text: "Marcus arrives early, as the email said, and starts to warm up." },
      { characterId: "nia", text: "Nia shows up at the old time and finds the team already halfway through drills." },
      { characterId: "coach-lee", text: "Coach Lee explains the change, and Nia asks to be added to the team text chain." },
    ],
  },
  {
    id: "the-surprise-substitute",
    title: "The Surprise Substitute",
    description: "A different teacher arrives, and the usual routine changes.",
    theme: "Surprise",
    characters: [
      { id: "jules", name: "Jules", role: "Walks into class" },
      { id: "mr-patel", name: "Mr. Patel", role: "Substitute teacher" },
      { id: "ren", name: "Ren", role: "Classmate sitting nearby" },
    ],
    steps: [
      { characterId: "jules", text: "Jules walks into class and finds Mr. Patel at the front instead of the regular teacher." },
      { characterId: "mr-patel", text: "Mr. Patel explains that today's schedule is a little different from usual." },
      { characterId: "jules", text: "Jules feels a little unsure because the day is not starting the way it usually does." },
      { characterId: "ren", text: "Ren notices that Jules looks unsure and quietly offers to share the posted plan." },
      { characterId: "jules", text: "With the plan in hand, Jules feels more settled and is ready to begin." },
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export function getCharacter(
  scenario: Scenario,
  characterId: string,
): Character | undefined {
  return scenario.characters.find((c) => c.id === characterId);
}
