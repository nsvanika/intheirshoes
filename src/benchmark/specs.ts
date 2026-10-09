/**
 * Benchmark case definitions ("Proof It Works", Feature 7).
 *
 * Every case is authored as plain sentences plus a structured reading of them (who saw, heard or
 * was told what). Everything else a case needs (the options, the gold answer, the explanation, the
 * category) is DERIVED from the existing deterministic engine in build.ts, then re-checked by an
 * independently written reference implementation, so the prose and the gold answer cannot drift.
 *
 * Rules every case follows (checked in validate.ts):
 *  - Self-contained: no hidden starting beliefs or facts. Whatever the answer depends on is in the
 *    sentences, including how each character came, or failed, to know something.
 *  - Nobody's mind is read from their behaviour: a character believes something only if the story
 *    says they saw it, were told it, or overheard it.
 *
 * Families: stories that share a lineage share a `familyId` and are NOT independent evidence.
 * 26 cases come from 17 families (12 library scenarios, 2 Make Your Own examples, 3 classic tasks).
 */

export type Category = "false_belief" | "missing_information" | "true_belief_control";
export type Source = "classic" | "library" | "variant";

type Flags = Record<string, boolean>;

export interface StepSpec {
  text: string;
  kind: "act" | "say";
  /** act: changes to the world. say: what is stated. */
  changes?: Flags;
  /** act: who saw it. */
  observers?: string[];
  /** say: who said it, who received it, who overheard it. */
  speaker?: string;
  recipients?: string[];
  overhearers?: string[];
}

export type TargetSpec =
  | { actor: string; kind: "yes_no"; prop: string }
  /** Which one of these mutually exclusive statements does the character believe (or none)? */
  | { actor: string; kind: "choice"; group: string[] };

export interface CaseSpec {
  id: string;
  familyId: string;
  source: Source;
  /** The built-in library scenario (or Make Your Own example) this is adapted from. */
  parent?: string;
  /** For classic tasks: where the task design comes from. */
  citation?: string;
  /** How this differs from its parent, in plain words. */
  adaptation: string;
  declaredCategory: Category;
  actors: Record<string, string>;
  props: Record<string, string>;
  groups?: string[][];
  steps: StepSpec[];
  target: TargetSpec;
}

const act = (text: string, changes: Flags, observers: string[]): StepSpec => ({
  text,
  kind: "act",
  changes,
  observers,
});
const say = (
  text: string,
  speaker: string,
  changes: Flags,
  recipients: string[],
  overhearers: string[] = [],
): StepSpec => ({ text, kind: "say", speaker, changes, recipients, overhearers });
const quiet = (text: string): StepSpec => act(text, {}, []);

const SALLY_ANNE =
  "Task design: Baron-Cohen, Leslie & Frith (1985), 'Does the autistic child have a theory of mind?', Cognition 21(1), 37-46, which adapted the change-of-location false-belief task of Wimmer & Perner (1983), Cognition 13(1), 103-128. Wording is original to this project.";
const MAXI =
  "Task design: Wimmer & Perner (1983), 'Beliefs about beliefs: Representation and constraining function of wrong beliefs in young children's understanding of deception', Cognition 13(1), 103-128 (the Maxi and the chocolate task). Wording is original to this project.";
const CONTENTS =
  "Task design: the unexpected-contents (deceptive container) task of Perner, Leekam & Wimmer (1987), British Journal of Developmental Psychology 5, 125-137, and Gopnik & Astington (1988), Child Development 59, 26-37. Adapted: the misleading expectation is created by a spoken statement, so every source of belief is explicit. Wording is original to this project.";

export const caseSpecs: CaseSpec[] = [
  // ---------------------------------------------------------------- classic tasks
  {
    id: "classic-sally-anne",
    familyId: "classic-sally-anne",
    source: "classic",
    citation: SALLY_ANNE,
    adaptation: "Original wording of the classic change-of-location task.",
    declaredCategory: "false_belief",
    actors: { sally: "Sally", anne: "Anne" },
    props: { marble_in_basket: "The marble is in the basket", marble_in_box: "The marble is in the box" },
    groups: [["marble_in_basket", "marble_in_box"]],
    steps: [
      act("Sally and Anne are in a room with a basket and a box, and Sally puts her marble in the basket while Anne watches.", { marble_in_basket: true }, ["sally", "anne"]),
      quiet("Sally leaves the room and goes outside."),
      act("While Sally is outside, Anne moves the marble from the basket to the box.", { marble_in_box: true }, ["anne"]),
      quiet("Sally comes back into the room."),
    ],
    target: { actor: "sally", kind: "choice", group: ["marble_in_basket", "marble_in_box"] },
  },
  {
    id: "classic-sally-anne-control",
    familyId: "classic-sally-anne",
    source: "classic",
    citation: SALLY_ANNE,
    adaptation: "Control: Sally stays and watches the marble being moved, so her belief is true.",
    declaredCategory: "true_belief_control",
    actors: { sally: "Sally", anne: "Anne" },
    props: { marble_in_basket: "The marble is in the basket", marble_in_box: "The marble is in the box" },
    groups: [["marble_in_basket", "marble_in_box"]],
    steps: [
      act("Sally and Anne are in a room with a basket and a box, and Sally puts her marble in the basket while Anne watches.", { marble_in_basket: true }, ["sally", "anne"]),
      act("Anne moves the marble from the basket to the box while Sally watches.", { marble_in_box: true }, ["sally", "anne"]),
      quiet("Sally walks to the other side of the room."),
    ],
    target: { actor: "sally", kind: "choice", group: ["marble_in_basket", "marble_in_box"] },
  },
  {
    id: "classic-maxi",
    familyId: "classic-maxi",
    source: "classic",
    citation: MAXI,
    adaptation: "Original wording of the classic Maxi-and-the-chocolate task.",
    declaredCategory: "false_belief",
    actors: { maxi: "Maxi", mom: "Maxi's mother" },
    props: {
      chocolate_in_blue: "The chocolate is in the blue cupboard",
      chocolate_in_green: "The chocolate is in the green cupboard",
    },
    groups: [["chocolate_in_blue", "chocolate_in_green"]],
    steps: [
      act("Maxi puts a bar of chocolate in the blue cupboard in the kitchen while his mother watches.", { chocolate_in_blue: true }, ["maxi", "mom"]),
      quiet("Maxi goes out to play in the garden."),
      act("While Maxi is out, his mother takes the chocolate out of the blue cupboard to bake, and puts what is left in the green cupboard.", { chocolate_in_green: true }, ["mom"]),
      quiet("Maxi comes back into the kitchen."),
    ],
    target: { actor: "maxi", kind: "choice", group: ["chocolate_in_blue", "chocolate_in_green"] },
  },
  {
    id: "classic-maxi-control",
    familyId: "classic-maxi",
    source: "classic",
    citation: MAXI,
    adaptation: "Control: Maxi stays in the kitchen and watches the chocolate being moved.",
    declaredCategory: "true_belief_control",
    actors: { maxi: "Maxi", mom: "Maxi's mother" },
    props: {
      chocolate_in_blue: "The chocolate is in the blue cupboard",
      chocolate_in_green: "The chocolate is in the green cupboard",
    },
    groups: [["chocolate_in_blue", "chocolate_in_green"]],
    steps: [
      act("Maxi puts a bar of chocolate in the blue cupboard in the kitchen while his mother watches.", { chocolate_in_blue: true }, ["maxi", "mom"]),
      act("His mother takes the chocolate out of the blue cupboard to bake, and puts what is left in the green cupboard while Maxi watches.", { chocolate_in_green: true }, ["maxi", "mom"]),
      quiet("Maxi sits down at the kitchen table."),
    ],
    target: { actor: "maxi", kind: "choice", group: ["chocolate_in_blue", "chocolate_in_green"] },
  },
  {
    id: "classic-contents",
    familyId: "classic-contents",
    source: "classic",
    citation: CONTENTS,
    adaptation: "Adapted unexpected-contents task (the expectation comes from a mistaken spoken statement).",
    declaredCategory: "false_belief",
    actors: { reed: "Ms. Reed", park: "Mr. Park", mia: "Mia", noah: "Noah" },
    props: { box_has_crayons: "The box contains crayons", box_has_candles: "The box contains candles" },
    groups: [["box_has_crayons", "box_has_candles"]],
    steps: [
      act("Ms. Reed puts crayons into a small box and sets it on the shelf.", { box_has_crayons: true }, ["reed"]),
      act("Later, Mr. Park, the classroom helper, takes the crayons out and puts candles in the box when no one is looking.", { box_has_candles: true }, ["park"]),
      say("Ms. Reed, who did not see the swap, tells Mia and Noah that the box has crayons in it.", "reed", { box_has_crayons: true }, ["mia", "noah"]),
      act("Mia opens the box, looks inside, and closes it again.", { box_has_candles: true }, ["mia"]),
      quiet("Noah does not open the box."),
    ],
    target: { actor: "noah", kind: "choice", group: ["box_has_crayons", "box_has_candles"] },
  },
  {
    id: "classic-contents-control",
    familyId: "classic-contents",
    source: "classic",
    citation: CONTENTS,
    adaptation: "Control: Noah also opens the box and sees what is really inside.",
    declaredCategory: "true_belief_control",
    actors: { reed: "Ms. Reed", park: "Mr. Park", mia: "Mia", noah: "Noah" },
    props: { box_has_crayons: "The box contains crayons", box_has_candles: "The box contains candles" },
    groups: [["box_has_crayons", "box_has_candles"]],
    steps: [
      act("Ms. Reed puts crayons into a small box and sets it on the shelf.", { box_has_crayons: true }, ["reed"]),
      act("Later, Mr. Park, the classroom helper, takes the crayons out and puts candles in the box when no one is looking.", { box_has_candles: true }, ["park"]),
      say("Ms. Reed, who did not see the swap, tells Mia and Noah that the box has crayons in it.", "reed", { box_has_crayons: true }, ["mia", "noah"]),
      act("Mia opens the box, looks inside, and closes it again.", { box_has_candles: true }, ["mia"]),
      act("Noah opens the box too, looks inside, and closes it again.", { box_has_candles: true }, ["noah"]),
    ],
    target: { actor: "noah", kind: "choice", group: ["box_has_crayons", "box_has_candles"] },
  },

  // ------------------------------------------- library scenarios, one adapted case each
  {
    id: "group-chat-missed",
    familyId: "group-chat",
    source: "library",
    parent: "the-unanswered-group-chat",
    adaptation: "Setup sentences added so the story is self-contained; asked after the missed message.",
    declaredCategory: "missing_information",
    actors: { maya: "Maya", jordan: "Jordan", sam: "Sam" },
    props: { movie_at_3: "The movie starts at 3:00 on Saturday" },
    steps: [
      act("Maya books a movie for 3:00 on Saturday.", { movie_at_3: true }, ["maya"]),
      say("Maya posts in the group chat, which Jordan and Sam are both in, that the movie starts at 3:00 on Saturday, and Sam reads the post right away.", "maya", { movie_at_3: true }, ["sam"]),
      act("Jordan's phone is charging in another room all afternoon, so Jordan does not see the chat.", {}, ["jordan"]),
    ],
    target: { actor: "jordan", kind: "yes_no", prop: "movie_at_3" },
  },
  {
    id: "lunch-seat-told",
    familyId: "lunch-seat",
    source: "library",
    parent: "the-lunch-table-seat",
    adaptation: "Asked after Riley answers, so Priya's belief comes from being told.",
    declaredCategory: "true_belief_control",
    actors: { riley: "Riley", priya: "Priya" },
    props: { bag_on_chair: "A bag is on the open chair", seat_free: "The open chair is free for Priya to sit in" },
    steps: [
      act("Riley puts a backpack on an open chair at the lunch table to keep it off the floor, and the chair is free for anyone to use.", { bag_on_chair: true, seat_free: true }, ["riley"]),
      act("Priya arrives with a tray and sees a bag on the only open chair.", { bag_on_chair: true }, ["riley", "priya"]),
      say("Priya asks Riley, \"Is anyone sitting here?\"", "priya", {}, ["riley"]),
      say("Riley answers that the seat is free.", "riley", { seat_free: true }, ["priya"]),
    ],
    target: { actor: "priya", kind: "yes_no", prop: "seat_free" },
  },
  {
    id: "party-unaware",
    familyId: "party",
    source: "library",
    parent: "the-surprise-party",
    adaptation: "Setup made explicit: Alex is not present when the party is planned.",
    declaredCategory: "missing_information",
    actors: { alex: "Alex", dana: "Dana", chris: "Chris" },
    props: { party_planned: "A surprise party is planned for Alex's birthday" },
    steps: [
      act("Dana and Chris plan a surprise party for Alex's birthday, and Alex is not there when they plan it.", { party_planned: true }, ["dana", "chris"]),
      act("Later, Alex notices that Dana and Chris stop talking whenever Alex walks over, and no one tells Alex why.", {}, ["alex", "dana", "chris"]),
    ],
    target: { actor: "alex", kind: "yes_no", prop: "party_planned" },
  },
  {
    id: "jacket-away",
    familyId: "jacket",
    source: "library",
    parent: "the-missing-jacket",
    adaptation: "Setup added (Taylor hangs the jacket on the hook); the genuine false belief.",
    declaredCategory: "false_belief",
    actors: { taylor: "Taylor", morgan: "Morgan" },
    props: { jacket_on_hook: "Taylor's blue jacket is on the hook", jacket_with_morgan: "Taylor's blue jacket is with Morgan" },
    groups: [["jacket_on_hook", "jacket_with_morgan"]],
    steps: [
      act("Taylor hangs their blue jacket on a hook in the locker room and leaves for class.", { jacket_on_hook: true }, ["taylor"]),
      act("While Taylor is in class, Morgan takes that blue jacket off the hook and walks out with it, and Taylor does not see or hear about this.", { jacket_with_morgan: true }, ["morgan"]),
    ],
    target: { actor: "taylor", kind: "choice", group: ["jacket_on_hook", "jacket_with_morgan"] },
  },
  {
    id: "joke-unspoken",
    familyId: "joke",
    source: "library",
    parent: "the-joke-that-landed-wrong",
    adaptation: "Noor's feeling is stated to the reader but never said aloud.",
    declaredCategory: "missing_information",
    actors: { eli: "Eli", noor: "Noor", kai: "Kai" },
    props: { noor_felt_hurt: "Noor felt hurt by the joke" },
    steps: [
      act("Eli jokes that Noor always takes forever to finish group projects, while Noor and Kai listen.", {}, ["eli", "noor", "kai"]),
      act("Noor stops laughing and goes quiet, feeling hurt because Noor has been working hard on the project, but Noor does not say so.", { noor_felt_hurt: true }, ["noor"]),
      act("Eli notices that Noor has stopped laughing.", {}, ["eli", "noor", "kai"]),
    ],
    target: { actor: "eli", kind: "yes_no", prop: "noor_felt_hurt" },
  },
  {
    id: "wrong-room-away",
    familyId: "wrong-room",
    source: "library",
    parent: "the-wrong-room",
    adaptation: "Setup made explicit: Ben reads the original schedule; the change happens while he is not listening.",
    declaredCategory: "false_belief",
    actors: { ortiz: "Ms. Ortiz", ben: "Ben" },
    props: {
      lesson_in_classroom: "Monday's lesson is in the usual classroom",
      lesson_in_library: "Monday's lesson is in the library",
    },
    groups: [["lesson_in_classroom", "lesson_in_library"]],
    steps: [
      act("Ms. Ortiz and Ben both read the schedule, which says that Monday's lesson is in the usual classroom.", { lesson_in_classroom: true }, ["ortiz", "ben"]),
      act("On Friday, Ms. Ortiz changes Monday's lesson to the library and announces it at the end of class, but Ben is packing his bag and does not hear it.", { lesson_in_library: true }, ["ortiz"]),
      quiet("Ben goes home for the weekend."),
    ],
    target: { actor: "ben", kind: "choice", group: ["lesson_in_classroom", "lesson_in_library"] },
  },
  {
    id: "pen-unnoticed",
    familyId: "pen",
    source: "library",
    parent: "the-borrowed-pen",
    adaptation: "Question about where the pen is, which Omar never noticed.",
    declaredCategory: "missing_information",
    actors: { lucia: "Lucia", omar: "Omar" },
    props: { pen_with_omar: "Omar has borrowed Lucia's pen", pen_in_pocket: "The pen is in Omar's pocket" },
    steps: [
      act("Omar forgot a pen, so Lucia lends him her favorite one during a quiz.", { pen_with_omar: true }, ["lucia", "omar"]),
      act("When the bell rings, Omar slips the pen into his pocket without noticing that he did.", { pen_in_pocket: true }, []),
    ],
    target: { actor: "omar", kind: "yes_no", prop: "pen_in_pocket" },
  },
  {
    id: "weekend-private",
    familyId: "weekend",
    source: "library",
    parent: "the-different-weekend-plans",
    adaptation: "Devon's plan is made explicit as a private decision that he does not share.",
    declaredCategory: "missing_information",
    actors: { devon: "Devon", zoe: "Zoe" },
    props: { devon_plans_arcade: "Devon plans to go to the arcade" },
    steps: [
      act("Devon decides in private that the weekend plan will be going to the arcade.", { devon_plans_arcade: true }, ["devon"]),
      say("Devon says to Zoe, \"Let's do something this weekend,\" but does not say what.", "devon", {}, ["zoe"]),
      say("Zoe says that sounds good.", "zoe", {}, ["devon"]),
    ],
    target: { actor: "zoe", kind: "yes_no", prop: "devon_plans_arcade" },
  },
  {
    id: "group-project-absent",
    familyId: "group-project",
    source: "library",
    parent: "the-group-project-handoff",
    adaptation: "Setup made explicit: Harper is at home, not present when Mei speaks.",
    declaredCategory: "missing_information",
    actors: { harper: "Harper", isaac: "Isaac", mei: "Mei" },
    props: { mei_likes_design: "Mei likes working on design" },
    steps: [
      act("At home, Harper finishes the written report for the group project.", {}, ["harper"]),
      act("Mei likes working on design.", { mei_likes_design: true }, ["mei"]),
      say("That evening, Mei tells Isaac that she likes working on design, and Harper is not there.", "mei", { mei_likes_design: true }, ["isaac"]),
    ],
    target: { actor: "harper", kind: "yes_no", prop: "mei_likes_design" },
  },
  {
    id: "hello-unseen",
    familyId: "hello",
    source: "library",
    parent: "the-new-student-hello",
    adaptation: "Theo's reason is stated to the reader; Amara is never told it.",
    declaredCategory: "missing_information",
    actors: { amara: "Amara", theo: "Theo" },
    props: { theo_test: "Theo has a test on his mind" },
    steps: [
      act("On Amara's first day, Amara waves at Theo in the hallway.", {}, ["amara"]),
      act("Theo is thinking about a test and does not see the wave.", { theo_test: true }, ["theo"]),
      act("At lunch, Theo says hello to Amara and does not mention the test.", {}, ["theo", "amara"]),
    ],
    target: { actor: "amara", kind: "yes_no", prop: "theo_test" },
  },
  {
    id: "practice-spam",
    familyId: "practice",
    source: "library",
    parent: "the-rescheduled-practice",
    adaptation: "Setup added (the usual time is announced to everyone first).",
    declaredCategory: "false_belief",
    actors: { coach: "Coach Lee", nia: "Nia", marcus: "Marcus" },
    props: {
      practice_usual: "Practice is at the usual time on Thursday",
      practice_earlier: "Practice is one hour earlier on Thursday",
    },
    groups: [["practice_usual", "practice_earlier"]],
    steps: [
      act("Coach Lee tells Nia and Marcus that Thursday's practice is at the usual time, and both of them hear it.", { practice_usual: true }, ["coach", "nia", "marcus"]),
      act("Later, Coach Lee decides to move Thursday's practice one hour earlier.", { practice_earlier: true }, ["coach"]),
      say("Coach Lee emails the new time to Nia and Marcus. Marcus reads the email, but Nia's copy goes to her spam folder and she never sees it.", "coach", { practice_earlier: true }, ["marcus"]),
    ],
    target: { actor: "nia", kind: "choice", group: ["practice_usual", "practice_earlier"] },
  },
  {
    id: "substitute-unsaid",
    familyId: "substitute",
    source: "library",
    parent: "the-surprise-substitute",
    adaptation: "The schedule change is stated to the reader; nobody has told Jules yet.",
    declaredCategory: "missing_information",
    actors: { jules: "Jules", patel: "Mr. Patel" },
    props: { schedule_differs: "Today's schedule is different from usual" },
    steps: [
      act("Mr. Patel, the substitute, plans a schedule for today that is different from usual.", { schedule_differs: true }, ["patel"]),
      act("Jules walks into class and finds Mr. Patel at the front instead of the regular teacher, and Mr. Patel has not said anything yet about the schedule.", {}, ["jules", "patel"]),
    ],
    target: { actor: "jules", kind: "yes_no", prop: "schedule_differs" },
  },

  // ------------------------------------------------------------- variants of those families
  {
    id: "jacket-watched",
    familyId: "jacket",
    source: "variant",
    parent: "the-missing-jacket",
    adaptation: "Control variant: Taylor stays and watches Morgan take the jacket.",
    declaredCategory: "true_belief_control",
    actors: { taylor: "Taylor", morgan: "Morgan" },
    props: { jacket_on_hook: "Taylor's blue jacket is on the hook", jacket_with_morgan: "Taylor's blue jacket is with Morgan" },
    groups: [["jacket_on_hook", "jacket_with_morgan"]],
    steps: [
      act("Taylor hangs their blue jacket on a hook in the locker room and stays in the locker room.", { jacket_on_hook: true }, ["taylor"]),
      act("Morgan takes that blue jacket off the hook and walks out with it while Taylor stands nearby and watches.", { jacket_with_morgan: true }, ["taylor", "morgan"]),
    ],
    target: { actor: "taylor", kind: "choice", group: ["jacket_on_hook", "jacket_with_morgan"] },
  },
  {
    id: "rehearsal-sick",
    familyId: "wrong-room",
    source: "variant",
    parent: "the-wrong-room",
    adaptation: "Rewritten variant with new people and places: a change of rehearsal room while Cam is out sick.",
    declaredCategory: "false_belief",
    actors: { alvarez: "Mr. Alvarez", cam: "Cam" },
    props: {
      rehearsal_gym: "Thursday's rehearsal is in the gym",
      rehearsal_auditorium: "Thursday's rehearsal is in the auditorium",
    },
    groups: [["rehearsal_gym", "rehearsal_auditorium"]],
    steps: [
      act("Mr. Alvarez and Cam both see the posted plan, which says that Thursday's rehearsal is in the gym.", { rehearsal_gym: true }, ["alvarez", "cam"]),
      act("On Wednesday, Mr. Alvarez moves Thursday's rehearsal to the auditorium and tells the class, but Cam is home sick and is not told.", { rehearsal_auditorium: true }, ["alvarez"]),
    ],
    target: { actor: "cam", kind: "choice", group: ["rehearsal_gym", "rehearsal_auditorium"] },
  },
  {
    id: "practice-read",
    familyId: "practice",
    source: "variant",
    parent: "the-rescheduled-practice",
    adaptation: "Control variant: both players read the email.",
    declaredCategory: "true_belief_control",
    actors: { coach: "Coach Lee", nia: "Nia", marcus: "Marcus" },
    props: {
      practice_usual: "Practice is at the usual time on Thursday",
      practice_earlier: "Practice is one hour earlier on Thursday",
    },
    groups: [["practice_usual", "practice_earlier"]],
    steps: [
      act("Coach Lee tells Nia and Marcus that Thursday's practice is at the usual time, and both of them hear it.", { practice_usual: true }, ["coach", "nia", "marcus"]),
      act("Later, Coach Lee decides to move Thursday's practice one hour earlier.", { practice_earlier: true }, ["coach"]),
      say("Coach Lee emails the new time to Nia and Marcus, and both of them read the email.", "coach", { practice_earlier: true }, ["nia", "marcus"]),
    ],
    target: { actor: "nia", kind: "choice", group: ["practice_usual", "practice_earlier"] },
  },
  {
    id: "group-chat-moved",
    familyId: "group-chat",
    source: "variant",
    parent: "the-unanswered-group-chat",
    adaptation: "Variant with a genuine false belief: Jordan saw the first time but missed the update.",
    declaredCategory: "false_belief",
    actors: { maya: "Maya", jordan: "Jordan", sam: "Sam" },
    props: { movie_at_3: "The movie starts at 3:00 on Saturday", movie_at_4: "The movie starts at 4:00 on Saturday" },
    groups: [["movie_at_3", "movie_at_4"]],
    steps: [
      act("Maya books a movie for 3:00 on Saturday.", { movie_at_3: true }, ["maya"]),
      say("Maya posts the time in the group chat, and Jordan and Sam both read it.", "maya", { movie_at_3: true }, ["jordan", "sam"]),
      act("On Friday, Maya moves the booking to 4:00.", { movie_at_4: true }, ["maya"]),
      say("Maya posts the new time in the chat. Sam reads it, but Jordan's phone is off, so Jordan does not see it.", "maya", { movie_at_4: true }, ["sam"]),
    ],
    target: { actor: "jordan", kind: "choice", group: ["movie_at_3", "movie_at_4"] },
  },
  {
    id: "notebook-moved",
    familyId: "notebook",
    source: "variant",
    parent: "make-your-own: the moved notebook (demo example)",
    adaptation: "Adapted from the Make Your Own demo example; ends before Ivy looks, so her belief has not changed.",
    declaredCategory: "false_belief",
    actors: { ivy: "Ivy", kofi: "Kofi" },
    props: {
      notebook_in_cubby: "The science notebook is in Ivy's cubby",
      notebook_on_shelf: "The science notebook is on the shelf by the window",
    },
    groups: [["notebook_in_cubby", "notebook_on_shelf"]],
    steps: [
      act("Ivy puts her science notebook in her cubby and goes to lunch.", { notebook_in_cubby: true }, ["ivy"]),
      act("While Ivy is at lunch, Kofi moves the notebook to the shelf by the window so he can use the cubby.", { notebook_on_shelf: true }, ["kofi"]),
      quiet("Ivy comes back from lunch."),
    ],
    target: { actor: "ivy", kind: "choice", group: ["notebook_in_cubby", "notebook_on_shelf"] },
  },
  {
    id: "club-room-text",
    familyId: "club-text",
    source: "variant",
    parent: "make-your-own: the room-change text (demo example)",
    adaptation: "Adapted from the Make Your Own demo example, with the old room stated explicitly.",
    declaredCategory: "false_belief",
    actors: { mina: "Mina", dev: "Dev", luz: "Luz" },
    props: {
      meeting_in_room8: "The club meeting is in Room 8",
      meeting_in_room12: "The club meeting is in Room 12",
    },
    groups: [["meeting_in_room8", "meeting_in_room12"]],
    steps: [
      act("The club meets in Room 8, and Mina, Dev and Luz all know this.", { meeting_in_room8: true }, ["mina", "dev", "luz"]),
      act("This week, Mina arranges for the meeting to move to Room 12.", { meeting_in_room12: true }, ["mina"]),
      say("Mina texts Dev and Luz the new room. Dev reads the text right away, but Luz's phone is off, so Luz does not see it.", "mina", { meeting_in_room12: true }, ["dev"]),
    ],
    target: { actor: "luz", kind: "choice", group: ["meeting_in_room8", "meeting_in_room12"] },
  },
  {
    id: "party-overheard",
    familyId: "party",
    source: "variant",
    parent: "the-surprise-party",
    adaptation: "Control variant: Alex overhears the plan.",
    declaredCategory: "true_belief_control",
    actors: { alex: "Alex", dana: "Dana", chris: "Chris" },
    props: { party_planned: "A surprise party is planned for Alex's birthday" },
    steps: [
      act("Dana and Chris plan a surprise party for Alex's birthday.", { party_planned: true }, ["dana", "chris"]),
      say("Dana tells Chris about the party while Alex walks past and overhears every word.", "dana", { party_planned: true }, ["chris"], ["alex"]),
    ],
    target: { actor: "alex", kind: "yes_no", prop: "party_planned" },
  },
  {
    id: "weekend-told",
    familyId: "weekend",
    source: "variant",
    parent: "the-different-weekend-plans",
    adaptation: "Control variant: Devon tells Zoe his plan.",
    declaredCategory: "true_belief_control",
    actors: { devon: "Devon", zoe: "Zoe" },
    props: { devon_plans_arcade: "Devon plans to go to the arcade" },
    steps: [
      act("Devon decides in private that the weekend plan will be going to the arcade.", { devon_plans_arcade: true }, ["devon"]),
      say("Devon tells Zoe that he plans to go to the arcade this weekend.", "devon", { devon_plans_arcade: true }, ["zoe"]),
      say("Zoe says that sounds good.", "zoe", {}, ["devon"]),
    ],
    target: { actor: "zoe", kind: "yes_no", prop: "devon_plans_arcade" },
  },
];
