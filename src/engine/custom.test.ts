import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoExamples } from "@/data/custom-examples";
import { CUSTOM_SYSTEM_PROMPT, buildCustomMessage, parseModelJson } from "./custom-ai";
import {
  convertExtraction,
  findPrivateInfo,
  isQuoted,
  unsupportedMentalWords,
} from "./custom-convert";
import { effectiveMode, getCustomConfig, handleCustomRequest, type CustomEnv } from "./custom-handler";
import { CustomConfigSchema, CustomResponseSchema, MAX_TEXT_CHARS } from "./custom-schema";
import { resetRateLimit } from "./rate-limit";
import { BeliefStorySchema } from "./schema";

const SECRET = "sk-ant-test-SECRET-1234567890";

const example = (id: string) => demoExamples.find((e) => e.id === id)!;
const ivy = example("moved-notebook");
const luz = example("room-change-text");
const trip = example("trip-day-question");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/custom-scenario", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const demoEnv: CustomEnv = {};
/** AI mode with a stand-in for the model: it returns whatever `reply` is. */
const aiEnv = (reply: unknown, extra: Partial<CustomEnv> = {}): CustomEnv & { calls: number } => {
  const env = {
    mode: "ai",
    apiKey: SECRET,
    calls: 0,
    caller: async () => {
      env.calls++;
      return typeof reply === "string" ? reply : JSON.stringify(reply);
    },
    ...extra,
  };
  return env;
};

const run = async (env: CustomEnv, body: unknown, headers?: Record<string, string>) => {
  const res = await handleCustomRequest(post(body, headers), env);
  return { status: res.status, body: await res.json() };
};

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
let logged: string[] = [];
beforeEach(() => {
  resetRateLimit();
  logged = [];
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" "))),
  );
});
afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

const clone = <T,>(x: T): T => structuredClone(x);

// ---------------------------------------------------------------------------

describe("valid input: demo examples go through the real pipeline", () => {
  it("each ready example yields a schema-valid story, 4-6 steps and views from the existing engine", async () => {
    for (const ex of [ivy, luz]) {
      const { status, body } = await run(demoEnv, { text: ex.text, exampleId: ex.id });
      expect(status, ex.id).toBe(200);
      const r = CustomResponseSchema.parse(body);
      expect(r.status).toBe("ready");
      if (r.status !== "ready") return;
      expect(r.views.length).toBeGreaterThanOrEqual(4);
      expect(r.views.length).toBeLessThanOrEqual(6);
      expect(r.review.characters.length).toBeGreaterThanOrEqual(2);
      expect(r.review.characters.length).toBeLessThanOrEqual(3);
      r.views.forEach((v, i) => {
        expect(v.stepNumber).toBe(i + 1);
        expect(v.totalSteps).toBe(r.views.length);
      });
    }
  });

  it("the converted story validates against the same schema the 12 built-in stories use", () => {
    for (const ex of [ivy, luz]) {
      const c = convertExtraction(ex.reading, ex.text);
      expect(c.kind).toBe("ready");
      if (c.kind === "ready") expect(BeliefStorySchema.safeParse(c.story).success).toBe(true);
    }
  });

  it("never attaches prediction questions to a custom story", async () => {
    for (const ex of [ivy, luz]) {
      const { body } = await run(demoEnv, { text: ex.text, exampleId: ex.id });
      for (const v of body.views) expect(v.prediction).toBeNull();
    }
  });

  it("preserves who witnessed what: Luz missed the text, Dev received it, and Luz's belief differs from reality", async () => {
    const { body } = await run(demoEnv, { text: luz.text, exampleId: luz.id });
    const first = body.views[0];
    const who = (id: string) => first.characters.find((c: { id: string }) => c.id === id);
    expect(who("dev").participation).toBe("told");
    expect(who("luz").participation).toBe("none");
    expect(who("mina").participation).toBe("spoke");
    expect(who("dev").believes.map((b: { id: string }) => b.id)).toContain("meeting_in_room12");
    expect(who("luz").believes).toContainEqual(
      expect.objectContaining({ id: "meeting_in_room8", status: "differs" }),
    );
    // missing information is listed separately and is not called a mistake
    expect(who("luz").notKnown.map((k: { id: string }) => k.id)).toContain("meeting_in_room12");
  });

  it("the speaker is not listed as lacking what they just said", async () => {
    const { body } = await run(demoEnv, { text: luz.text, exampleId: luz.id });
    const mina = body.views[0].characters.find((c: { id: string }) => c.id === "mina");
    expect(mina.notKnown).toEqual([]);
  });

  it("a false belief that arises because someone was away is tracked, then corrected by looking", async () => {
    const { body } = await run(demoEnv, { text: ivy.text, exampleId: ivy.id });
    const step2 = body.views[1].characters.find((c: { id: string }) => c.id === "ivy");
    expect(step2.participation).toBe("none");
    expect(step2.believes).toContainEqual(expect.objectContaining({ id: "notebook_in_cubby", status: "differs" }));
    const step4 = body.views[3].characters.find((c: { id: string }) => c.id === "ivy");
    expect(step4.updated.map((u: { id: string }) => u.id)).toContain("notebook_in_cubby");
    expect(step4.believes.every((b: { status: string }) => b.status === "matches")).toBe(true);
  });

  it("the review shows the user's own words next to each step, and what was not assumed", async () => {
    const { body } = await run(demoEnv, { text: luz.text, exampleId: luz.id });
    expect(body.review.steps[0].youWrote).toContain("Mina texts Dev and Luz");
    expect(body.review.steps[0].whoSawOrHeard).toMatch(/Said by Mina/);
    expect(body.review.steps[0].whoSawOrHeard).toMatch(/Received it: Dev/);
    expect(body.review.steps[0].yourWordsAboutIt.join(" ")).toContain("Luz's phone is off");
    expect(body.review.notAssumed.join(" ")).toMatch(/feelings, intentions, or private thoughts/);
    for (const s of body.review.steps) expect(luz.text).toContain(s.youWrote.replace(/[.]$/, ""));
  });

  it("accepts a valid reading from the AI path too (mocked model), and calls it once", async () => {
    const env = aiEnv(ivy.reading);
    const { status, body } = await run(env, { text: ivy.text });
    expect(status).toBe(200);
    expect(body.status).toBe("ready");
    expect(env.calls).toBe(1);
  });

  it("accepts a reply wrapped in a code fence", async () => {
    const env = aiEnv("```json\n" + JSON.stringify(ivy.reading) + "\n```");
    expect((await run(env, { text: ivy.text })).body.status).toBe("ready");
  });
});

describe("missing information: ask, never invent", () => {
  it("demo: the trip example asks whether Theo heard it", async () => {
    const { body } = await run(demoEnv, { text: trip.text, exampleId: trip.id });
    expect(body).toMatchObject({ status: "needs_clarification", question: "Did Theo hear Ravi say it in the cafeteria?" });
    expect(body.options).toEqual(["Yes, Theo heard it", "No, Theo did not hear it", "I'm not sure"]);
  });

  it("the answer decides what Theo knows: heard -> Theo believes it; did not hear -> Theo lacks it", async () => {
    const q = "Did Theo hear Ravi say it in the cafeteria?";
    const yes = await run(demoEnv, { text: trip.text, exampleId: trip.id, clarifications: [{ question: q, answer: "Yes, Theo heard it" }] });
    const no = await run(demoEnv, { text: trip.text, exampleId: trip.id, clarifications: [{ question: q, answer: "No, Theo did not hear it" }] });
    const theoAtStep2 = (b: { views: { characters: { id: string }[] }[] }) =>
      b.views[1].characters.find((c) => c.id === "theo") as unknown as {
        participation: string;
        believes: { id: string }[];
        notKnown: { id: string }[];
      };
    expect(theoAtStep2(yes.body).participation).toBe("told");
    expect(theoAtStep2(yes.body).believes.map((b) => b.id)).toContain("trip_on_thursday");
    expect(theoAtStep2(no.body).participation).toBe("none");
    expect(theoAtStep2(no.body).notKnown.map((k) => k.id)).toContain("trip_on_thursday");
    // Sana was away either way
    const sana = yes.body.views[1].characters.find((c: { id: string }) => c.id === "sana");
    expect(sana.participation).toBe("none");
  });

  it("'I'm not sure' gets a kind explanation, not a guess", async () => {
    const q = "Did Theo hear Ravi say it in the cafeteria?";
    const { body } = await run(demoEnv, { text: trip.text, exampleId: trip.id, clarifications: [{ question: q, answer: "I'm not sure" }] });
    expect(body.status).toBe("cannot_process");
    expect(body.message).toMatch(/need to know whether they heard it/i);
  });

  it("AI: a step marked accessUnclear becomes the model's single question", async () => {
    const reading = clone(ivy.reading!);
    reading.steps![1].accessUnclear = true;
    reading.clarification = { question: "Did Ivy see Kofi move it?", options: ["Yes", "No"] };
    const { body } = await run(aiEnv(reading), { text: ivy.text });
    expect(body).toEqual({ status: "needs_clarification", question: "Did Ivy see Kofi move it?", options: ["Yes", "No"] });
  });

  it("AI: unclear access without a model question falls back to a simple, safe one", async () => {
    const reading = clone(ivy.reading!);
    reading.steps![1].accessUnclear = true;
    const { body } = await run(aiEnv(reading), { text: ivy.text });
    expect(body.status).toBe("needs_clarification");
    expect(body.question).toMatch(/Who saw or heard it\?/);
    expect(body.options.length).toBeGreaterThanOrEqual(2);
    expect(body.options.length).toBeLessThanOrEqual(4);
  });

  it("AI: a step with no words about who saw or heard it is never guessed; the user is asked", async () => {
    const reading = clone(ivy.reading!);
    reading.steps![1].accessQuotes = [];
    expect((await run(aiEnv(reading), { text: ivy.text })).body.status).toBe("needs_clarification");
  });

  it("AI: after two rounds of questions it stops asking and says what to add", async () => {
    const reading = clone(ivy.reading!);
    reading.steps![1].accessUnclear = true;
    const text = ivy.text;
    const { body } = await run(aiEnv(reading), {
      text,
      clarifications: [
        { question: "Q1?", answer: "Not sure" },
        { question: "Q2?", answer: "Not sure" },
      ],
    });
    expect(body.status).toBe("cannot_process");
    expect(body.message).toMatch(/who saw or heard/i);
  });

  it("AI: the model can say there isn't enough to go on, with a kind message", async () => {
    const env = aiEnv({ status: "cannot_process", message: "Tell us a little more about what happens next." });
    const { body } = await run(env, { text: "Sam and Jo talked." });
    expect(body).toEqual({ status: "cannot_process", message: "Tell us a little more about what happens next." });
  });

  it("answers to questions can be quoted as the user's own words", () => {
    const source = `${trip.text}\nQuestion: Did Theo hear Ravi say it in the cafeteria?\nAnswer: Yes, Theo heard it`;
    expect(isQuoted(source, "Yes, Theo heard it")).toBe(true);
    expect(isQuoted(trip.text, "Yes, Theo heard it")).toBe(false);
  });
});

describe("malformed or unsafe AI output is rejected, never shown", () => {
  const bad = async (reading: unknown, text = ivy.text) => run(aiEnv(reading), { text });

  it("rejects replies that are not JSON, and does not echo them", async () => {
    const { status, body } = await run(aiEnv("Sure! Here is a story about SECRET-WORDS."), { text: ivy.text });
    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("SECRET-WORDS");
    expect(body.error).toMatch(/couldn't turn that into a story we can trust/);
  });

  it("rejects the wrong shape, unknown status, and extra keys", async () => {
    expect((await bad({ steps: "nope" })).status).toBe(502);
    expect((await bad({ ...ivy.reading, status: "maybe" })).status).toBe(502);
    expect((await bad({ ...ivy.reading, extra: 1 })).status).toBe(502);
    expect((await bad([])).status).toBe(502);
  });

  it("rejects a quote that is not in the user's text (the model made something up)", async () => {
    const r = clone(ivy.reading!);
    r.steps![0].quote = "Ivy tells her teacher she is sad";
    expect((await bad(r)).status).toBe(502);
    const r2 = clone(ivy.reading!);
    r2.propositions![0].quote = "a completely invented sentence";
    expect((await bad(r2)).status).toBe(502);
    const r3 = clone(ivy.reading!);
    r3.steps![1].accessQuotes = ["Kofi told everyone"];
    expect((await bad(r3)).status).toBe(502);
  });

  it("rejects a character who is not named in the user's text", async () => {
    const r = clone(ivy.reading!);
    r.characters![1] = { id: "zed", name: "Zed" };
    expect((await bad(r)).status).toBe(502);
  });

  it("rejects the wrong number of characters or steps", async () => {
    const one = clone(ivy.reading!);
    one.characters = [one.characters![0]];
    expect((await bad(one)).status).toBe(502);
    const few = clone(ivy.reading!);
    few.steps = few.steps!.slice(0, 3);
    expect((await bad(few)).status).toBe(502);
    const many = clone(luz.reading!);
    many.steps = [...many.steps!, ...many.steps!];
    expect((await bad(many, luz.text)).status).toBe(502);
  });

  it("rejects invented feelings, intentions or private thoughts", async () => {
    const r = clone(ivy.reading!);
    r.steps![3].text = "Ivy feels sad because Kofi wanted the cubby.";
    expect((await bad(r)).status).toBe(502);
    const r2 = clone(ivy.reading!);
    r2.propositions![0].text = "Ivy knows the notebook is in the cubby";
    expect((await bad(r2)).status).toBe(502);
  });

  it("allows a mental-state word only when the user's own quoted words use it", () => {
    expect(unsupportedMentalWords("Luz thinks the meeting is in Room 8.", ["Luz thinks the meeting is still in Room 8"])).toEqual([]);
    expect(unsupportedMentalWords("Luz thinks the meeting is in Room 8.", ["Luz goes to Room 8"])).toEqual(["thinks"]);
    expect(unsupportedMentalWords("Kofi wants the cubby.", ["Kofi moves the notebook"])).toEqual(["wants"]);
  });

  it("rejects a step that is more than one sentence", async () => {
    const r = clone(ivy.reading!);
    r.steps![2].text = "Ivy comes back from lunch. She walks to her cubby.";
    expect((await bad(r)).status).toBe(502);
  });

  it("rejects a reading that does not pass the existing story schema (unknown facts, bad references)", async () => {
    const r = clone(ivy.reading!);
    r.steps![0].changes = [{ proposition: "made_up_fact", value: true }];
    expect((await bad(r)).status).toBe(502);
    const r2 = clone(ivy.reading!);
    r2.steps![0].observers = ["nobody-like-this"];
    expect((await bad(r2)).status).toBe(502);
    const r3 = clone(luz.reading!);
    r3.initialBeliefs = [{ actorId: "luz", proposition: "meeting_in_room12", quote: "Luz thinks the meeting is still in Room 8" }];
    r3.initialWorld = [
      { proposition: "meeting_in_room12", quote: "the club meeting moved to Room 12" },
      { proposition: "meeting_in_room8", quote: "the meeting is still in Room 8" },
    ];
    expect((await bad(r3, luz.text)).status).toBe(502); // both exclusive facts true at once
  });

  it("rejects a stated belief that is not backed by the user's words", async () => {
    const r = clone(luz.reading!);
    r.initialBeliefs = [{ actorId: "luz", proposition: "meeting_in_room8", quote: "Luz is certain about Room 8" }];
    expect((await bad(r, luz.text)).status).toBe(502);
  });

  it("when the model call itself fails, the user gets a friendly message and nothing leaks", async () => {
    const env: CustomEnv = {
      mode: "ai",
      apiKey: SECRET,
      caller: async () => {
        throw new Error(`provider said: ${ivy.text} ${SECRET}`);
      },
    };
    const { status, body } = await run(env, { text: ivy.text });
    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain("Ivy");
    expect(logged.join(" ")).not.toContain("Ivy");
    expect(logged.join(" ")).not.toContain(SECRET);
  });

  it("never attaches predictions to a story the AI wrote either", async () => {
    const { body } = await run(aiEnv(luz.reading), { text: luz.text });
    for (const v of body.views) expect(v.prediction).toBeNull();
  });
});

describe("each safeguard rejects for its own reason", () => {
  // Calls the converter directly so a rule cannot be masked by some other check catching the input.
  const code = (reading: unknown, text = ivy.text) => {
    const c = convertExtraction(reading, text);
    return c.kind === "invalid" ? c.code : c.kind;
  };

  it("a character name that is not in the user's text (ids and references are all consistent)", () => {
    const r = clone(ivy.reading!);
    r.characters![1] = { id: "kofi", name: "Zed" };
    expect(code(r)).toBe("invented_name");
  });

  it("too few or too many characters, or repeated ids", () => {
    const one = clone(ivy.reading!);
    one.characters = [one.characters![0]];
    expect(code(one)).toBe("characters");
    const dup = clone(ivy.reading!);
    dup.characters![1] = { id: "ivy", name: "Kofi" };
    expect(code(dup)).toBe("characters");
  });

  it("fewer than 4 steps", () => {
    const r = clone(ivy.reading!);
    r.steps = r.steps!.slice(0, 3);
    expect(code(r)).toBe("steps");
  });

  it("a step quote, proposition quote, starting-world quote, starting-belief quote or access quote that is not the user's", () => {
    const a = clone(ivy.reading!); a.steps![0].quote = "made up words here"; expect(code(a)).toBe("ungrounded");
    const b = clone(ivy.reading!); b.propositions![0].quote = "made up words here"; expect(code(b)).toBe("ungrounded");
    const c = clone(luz.reading!); c.initialWorld![0].quote = "made up words here"; expect(code(c, luz.text)).toBe("ungrounded");
    const d = clone(luz.reading!); d.initialBeliefs![0].quote = "made up words here"; expect(code(d, luz.text)).toBe("ungrounded");
    const e = clone(ivy.reading!); e.steps![1].accessQuotes = ["made up words here"]; expect(code(e)).toBe("ungrounded");
  });

  it("an invented mental-state word in a step or in a proposition", () => {
    const a = clone(ivy.reading!); a.steps![3].text = "Ivy feels sad about it."; expect(code(a)).toBe("mental_words");
    const b = clone(ivy.reading!); b.propositions![0].text = "Ivy wants the notebook"; expect(code(b)).toBe("mental_words");
  });

  it("a step that is more than one sentence", () => {
    const r = clone(ivy.reading!);
    r.steps![2].text = "Ivy comes back. She looks around.";
    expect(code(r)).toBe("sentence");
  });

  it("a reading that fails the story schema (unknown fact, unknown person, two exclusive facts both true)", () => {
    const a = clone(ivy.reading!); a.steps![0].changes = [{ proposition: "nope", value: true }]; expect(code(a)).toBe("story_schema");
    const b = clone(ivy.reading!); b.steps![0].observers = ["ghost"]; expect(code(b)).toBe("story_schema");
    const c = clone(luz.reading!);
    c.initialWorld = [
      { proposition: "meeting_in_room12", quote: "the club meeting moved to Room 12" },
      { proposition: "meeting_in_room8", quote: "the meeting is still in Room 8" },
    ];
    expect(code(c, luz.text)).toBe("story_schema");
  });

  it("clarification status without a question", () => {
    expect(code({ status: "needs_clarification" })).toBe("clarification");
  });

  it("unclear access is a question, not a guess or an error", () => {
    const a = clone(ivy.reading!); a.steps![1].accessUnclear = true;
    expect(code(a)).toBe("clarify");
    const b = clone(ivy.reading!); b.steps![1].accessQuotes = [];
    expect(code(b)).toBe("clarify");
  });
});

describe("privacy", () => {
  const cases: [string, string][] = [
    ["email", "Ana emails ana.example@mail.com about the club."],
    ["phone", "Ben calls 555-123-4567 to ask about practice."],
    ["web address", "Cam posts a link to https://example.com/page for the group."],
    ["street address", "Dee goes to 123 Maple Street after class."],
    ["school name", "Eve is new at Lincoln Middle School this week."],
  ];

  it("stops obvious private details before anything is processed or sent", async () => {
    for (const [, text] of cases) {
      const env = aiEnv(ivy.reading);
      const { status, body } = await run(env, { text });
      expect(status).toBe(200);
      expect(body.status).toBe("private_info_warning");
      expect(body.message).toMatch(/replace it with something made up/i);
      expect(env.calls, text).toBe(0); // nothing was sent to the model
    }
  });

  it("also checks answers to clarification questions", async () => {
    const env = aiEnv(ivy.reading);
    const { body } = await run(env, {
      text: ivy.text,
      clarifications: [{ question: "Who?", answer: "Email me at kid@example.com" }],
    });
    expect(body.status).toBe("private_info_warning");
    expect(env.calls).toBe(0);
  });

  it("does not flag ordinary things like times, rooms or grades", () => {
    for (const t of [
      "The movie starts at 3:00 on Saturday.",
      "Practice moves to Room 12 at 4:30.",
      "Mia is in 7th grade and has 2 pets.",
      "Ravi tells his friends in the cafeteria.",
      ivy.text,
      luz.text,
      trip.text,
    ]) {
      expect(findPrivateInfo(t), t).toBeNull();
    }
  });

  it("never writes the user's description or answers to any log, on success, failure or refusal", async () => {
    const text = ivy.text;
    await run(aiEnv(ivy.reading), { text });
    await run(aiEnv("not json"), { text });
    await run(aiEnv({ status: "cannot_process" }), { text });
    await run(aiEnv({ ...ivy.reading, steps: [] }), { text });
    await run(demoEnv, { text: "Something typed only for this test: Zorblax" });
    await run({ mode: "ai", apiKey: SECRET, caller: async () => { throw new Error(text); } }, { text });
    const all = logged.join("\n");
    expect(all).not.toContain("Ivy");
    expect(all).not.toContain("Zorblax");
    expect(all).not.toContain("cubby");
    expect(all).not.toContain(SECRET);
  });

  it("does not keep anything between requests (no stored descriptions)", async () => {
    const env = aiEnv(ivy.reading);
    await run(env, { text: ivy.text });
    const res = await run(demoEnv, { text: ivy.text }); // same text, but not an example request
    expect(res.body.status).toBe("demo_unsupported");
  });
});

describe("demo mode is honest and sends nothing anywhere", () => {
  it("arbitrary text is not 'processed': the user is told exactly what demo mode can do", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { status, body } = await run(demoEnv, { text: "Pat gives Quinn a note, and then Quinn reads it." });
    expect(status).toBe(200);
    expect(body.status).toBe("demo_unsupported");
    expect(body.message).toMatch(/demo mode/i);
    expect(body.message).toMatch(/example/i);
    expect(body.message).toMatch(/AI service/);
    expect(body.message).toMatch(/Nothing you typed was sent anywhere/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("an edited example is not mistaken for the example, and a wrong id is not accepted", async () => {
    expect((await run(demoEnv, { text: ivy.text + " Then it rains.", exampleId: ivy.id })).body.status).toBe("demo_unsupported");
    expect((await run(demoEnv, { text: ivy.text, exampleId: luz.id })).body.status).toBe("demo_unsupported");
    expect((await run(demoEnv, { text: ivy.text })).body.status).toBe("demo_unsupported");
    expect((await run(demoEnv, { text: ivy.text, exampleId: "nope" })).body.status).toBe("demo_unsupported");
  });

  it("never calls a model, even when a key and a caller are present but AI mode is off", async () => {
    let called = false;
    const env: CustomEnv = { mode: "demo", apiKey: SECRET, caller: async () => { called = true; return "{}"; } };
    await run(env, { text: "Anything at all that is not an example." });
    expect(called).toBe(false);
    expect(effectiveMode(env)).toBe("demo");
  });

  it("asking for AI mode without a key falls back to demo and explains why", () => {
    const config = getCustomConfig({ mode: "ai" });
    expect(config.mode).toBe("demo");
    expect(config.note).toMatch(/no AI key is configured/);
    expect(effectiveMode({ mode: "ai", apiKey: SECRET })).toBe("ai");
    expect(getCustomConfig({}).note).toBeNull();
  });
});

describe("limits and errors", () => {
  it("rejects empty, whitespace-only, over-long and malformed requests without echoing them", async () => {
    expect((await run(demoEnv, { text: "" })).status).toBe(400);
    expect((await run(demoEnv, { text: "   \n  " })).status).toBe(400);
    const long = "x".repeat(MAX_TEXT_CHARS + 1);
    const tooLong = await run(demoEnv, { text: long });
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(tooLong.body)).not.toContain("xxxxx");
    expect((await run(demoEnv, "{not json")).status).toBe(400);
    expect((await run(demoEnv, { text: "ok", extra: 1 })).status).toBe(400);
    expect((await run(demoEnv, "x".repeat(30_000))).status).toBe(413);
    expect((await run(demoEnv, { text: "ok", clarifications: [1, 2, 3].map((n) => ({ question: `q${n}`, answer: "a" })) })).status).toBe(400);
  });

  it("accepts text right at the limit", async () => {
    const res = await run(demoEnv, { text: "y".repeat(MAX_TEXT_CHARS) });
    expect(res.status).toBe(200);
  });

  it("rate-limits AI requests per client, but not demo mode", async () => {
    const env = aiEnv(ivy.reading);
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await run(env, { text: ivy.text }, headers)).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(env.calls).toBe(5);
    // another client is unaffected
    expect((await run(env, { text: ivy.text }, { "x-forwarded-for": "198.51.100.4" })).status).toBe(200);
    // demo mode has no such limit
    for (let i = 0; i < 8; i++) expect((await run(demoEnv, { text: ivy.text, exampleId: ivy.id }, headers)).status).toBe(200);
  });

});

describe("the key stays on the server", () => {
  it("is never present in the config, in any response, or in what the model is sent", async () => {
    const seen: string[] = [];
    const env: CustomEnv = {
      mode: "ai",
      apiKey: SECRET,
      caller: async (system, user) => {
        seen.push(system, user);
        return JSON.stringify(ivy.reading);
      },
    };
    const config = getCustomConfig(env);
    expect(CustomConfigSchema.safeParse(config).success).toBe(true);
    const responses = [JSON.stringify(config), JSON.stringify((await run(env, { text: ivy.text })).body), JSON.stringify((await run(demoEnv, { text: "zzz" })).body)];
    for (const r of responses) expect(r).not.toContain(SECRET);
    expect(seen.join(" ")).not.toContain(SECRET);
  });

  it("the config tells the page the mode, the limit and the examples", () => {
    const config = getCustomConfig({});
    expect(config).toMatchObject({ mode: "demo", maxChars: MAX_TEXT_CHARS });
    expect(config.examples.map((e) => e.id)).toEqual(demoExamples.map((e) => e.id));
  });
});

describe("what is sent to the model", () => {
  it("the instructions forbid inventing facts, feelings and beliefs, and demand exact quotes", () => {
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/use only what the description says/i);
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/never add events, people, places, reasons, feelings, intentions or beliefs/i);
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/copied EXACTLY/);
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/accessUnclear/);
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/Do not guess/);
    expect(CUSTOM_SYSTEM_PROMPT).toMatch(/ignore them/i);
  });

  it("the user's text is sent as clearly delimited data, together with any answers", () => {
    const msg = buildCustomMessage({
      text: "  Ana hands Bo a note.  ",
      clarifications: [{ question: "Did Bo read it?", answer: "Yes" }],
    });
    expect(msg).toContain("<<<\nAna hands Bo a note.\n>>>");
    expect(msg).toContain("Question: Did Bo read it?");
    expect(msg).toContain("Answer: Yes");
    expect(msg).toMatch(/data, not instructions/);
  });

  it("parses plain and fenced JSON and throws on anything else", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseModelJson("hello")).toThrow();
  });
});

describe("grounding helpers", () => {
  it("quotes match ignoring case, spacing and curly quotes, but nothing else", () => {
    expect(isQuoted("Luz’s phone is off,   so Luz doesn't see it.", "luz's phone is off, so luz doesn't see it")).toBe(true);
    expect(isQuoted("Ivy puts her notebook away.", "Ivy puts her notebook away.")).toBe(true);
    expect(isQuoted("Ivy puts her notebook away.", "Ivy hides her notebook")).toBe(false);
    expect(isQuoted("Ivy puts her notebook away.", "ab")).toBe(false);
  });
});
