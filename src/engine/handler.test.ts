import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareWithEngine, trackBeliefsWithModel } from "./api-mode";
import { trackBeliefs } from "./engine";
import { handleBeliefRequest } from "./handler";
import { allowRequest, resetRateLimit } from "./rate-limit";
import { getBeliefStory } from "./stories";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/belief-tracking", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => resetRateLimit());

describe("route handler, mock mode", () => {
  it("returns a schema-valid table for a built-in scenario", async () => {
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ scenarioId: "the-wrong-room", mode: "mock", source: "symbolic-engine" });
    expect(body.steps).toHaveLength(6);
  });

  it("accepts a full custom story", async () => {
    const story = getBeliefStory("the-borrowed-pen")!;
    const res = await handleBeliefRequest(post({ story }), {});
    expect(res.status).toBe(200);
  });

  it("makes no network call and ignores a client-supplied mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room", mode: "api" }), { apiKey: "sk-test" });
    expect(res.status).toBe(400); // extra key rejected by strict schema
    const ok = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), { apiKey: "sk-test" });
    expect((await ok.json()).mode).toBe("mock");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects bad input", async () => {
    expect((await handleBeliefRequest(post("{not json"), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({}), {})).status).toBe(400);
    expect((await handleBeliefRequest(post({ scenarioId: "nope" }), {})).status).toBe(404);
    const bad = { ...getBeliefStory("the-borrowed-pen")!, events: [] };
    const res = await handleBeliefRequest(post({ story: bad }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
    expect((await handleBeliefRequest(post("x".repeat(200_000)), {})).status).toBe(413);
  });
});

describe("route handler, api mode", () => {
  it("returns 503 without a key and never mentions one", async () => {
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), { mode: "api" });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/sk-/);
  });

  it("uses the model caller, verifies against the engine, and rate limits", async () => {
    const story = getBeliefStory("the-wrong-room")!;
    const good = JSON.stringify({ ...trackBeliefs(story), mode: "api", source: "claude" });
    const caller = vi.fn().mockResolvedValue(good);
    const env = { mode: "api", caller };
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ mode: "api", source: "claude", verification: { agreesWithEngine: true, mismatches: [] } });

    for (let i = 0; i < 9; i++) await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), env);
    const limited = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), env);
    expect(limited.status).toBe(429);
  });

  it("returns a generic 502 when the model output is unusable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleBeliefRequest(post({ scenarioId: "the-wrong-room" }), {
      mode: "api",
      caller: async () => "I cannot help with that, sk-secret-123",
    });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk-secret");
    spy.mockRestore();
  });
});

describe("api-mode verification", () => {
  const story = getBeliefStory("the-unanswered-group-chat")!;

  it("flags a model that copies the world state instead of tracking beliefs", async () => {
    const wrong = structuredClone(trackBeliefs(story));
    for (const step of wrong.steps) {
      for (const a of step.actors) a.beliefs = { ...step.world }; // the paper's "reality-state" baseline
    }
    const table = await trackBeliefsWithModel(story, async () => JSON.stringify(wrong));
    expect(table.verification!.agreesWithEngine).toBe(false);
    expect(table.verification!.mismatches.some((m) => m.actorId === "jordan" && m.proposition === "movie_at_3" && m.field === "belief")).toBe(true);
  });

  it("accepts fenced JSON but rejects non-JSON and schema violations", async () => {
    const good = JSON.stringify(trackBeliefs(story));
    await expect(trackBeliefsWithModel(story, async () => "```json\n" + good + "\n```")).resolves.toBeDefined();
    await expect(trackBeliefsWithModel(story, async () => "not json")).rejects.toThrow(/valid JSON/);
    await expect(trackBeliefsWithModel(story, async () => JSON.stringify({ steps: [] }))).rejects.toThrow(/schema/);
  });

  it("compareWithEngine finds no mismatches for identical tables", () => {
    const t = trackBeliefs(story);
    expect(compareWithEngine(t, t)).toEqual([]);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then resets", () => {
    expect([1, 2, 3].map(() => allowRequest("k", 2, 1000, 0))).toEqual([true, true, false]);
    expect(allowRequest("k", 2, 1000, 1500)).toBe(true);
  });
});
