import { z } from "zod";
import {
  DEFAULT_MODEL,
  createAnthropicCaller,
  trackBeliefsWithModel,
  type ModelCaller,
} from "./api-mode";
import { trackBeliefs } from "./engine";
import { allowRequest } from "./rate-limit";
import { BeliefStorySchema, BeliefTableSchema } from "./schema";
import { getBeliefStory } from "./stories";
import { ChoiceIdSchema } from "./prediction-schema";
import { buildReveal, promptAfterStep } from "./prediction";
import { buildStepView, StepViewSchema } from "./view";
import { getPredictionQuestion } from "@/data/predictions";
import { scenarios } from "@/data/scenarios";

const MAX_BODY_BYTES = 100_000;

/**
 * Either a built-in scenario id, a built-in scenario id plus a 1-based `step`
 * (returns the student view of just that step), or a full structured story.
 */
const RequestSchema = z.union([
  // A student's prediction for the question asked after `step`. Returns the reveal.
  z.strictObject({
    scenarioId: z.string().max(64),
    step: z.number().int().min(1).max(50),
    answer: ChoiceIdSchema,
  }),
  z.strictObject({ scenarioId: z.string().max(64), step: z.number().int().min(1).max(50) }),
  z.strictObject({ scenarioId: z.string().max(64) }),
  z.strictObject({ story: BeliefStorySchema }),
]);

export interface HandlerEnv {
  mode?: string;
  apiKey?: string;
  model?: string;
  /** Test hook: replaces the real Claude call. */
  caller?: ModelCaller;
}

/** Reads server-side configuration. The key only ever lives here. */
export function readEnv(): HandlerEnv {
  return {
    mode: process.env.BELIEF_ENGINE_MODE,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
  };
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleBeliefRequest(request: Request, env: HandlerEnv): Promise<Response> {
  // The mode comes from server configuration only, so a caller cannot opt in to paid requests.
  const apiMode = env.mode === "api";

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "Invalid request.",
        issues: parsed.error.issues.slice(0, 20).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  // Student step views and prediction reveals: deterministic engine only, never a paid call.
  if ("step" in parsed.data) {
    const { scenarioId, step } = parsed.data;
    const found = getBeliefStory(scenarioId);
    const scenario = scenarios.find((sc) => sc.id === scenarioId);
    if (!found || !scenario) return json({ error: "Unknown scenario." }, 404);
    if (step > found.events.length) return json({ error: "Step out of range." }, 400);
    const table = trackBeliefs(found);

    if ("answer" in parsed.data) {
      const question = getPredictionQuestion(scenarioId, step);
      if (!question || step >= found.events.length) {
        return json({ error: "There is no question at this step." }, 400);
      }
      return json(buildReveal(question, found, table, scenario, parsed.data.answer));
    }

    // Only the prompt rides along with the step; answers are sent only after a submission.
    const view = buildStepView(found, table, scenario, step, promptAfterStep(scenarioId, step, found));
    return json(StepViewSchema.parse(view));
  }

  let story;
  if ("story" in parsed.data) {
    story = parsed.data.story;
  } else {
    story = getBeliefStory(parsed.data.scenarioId);
    if (!story) return json({ error: "Unknown scenario." }, 404);
  }

  try {
    if (!apiMode) return json(validated(trackBeliefs(story)));

    const caller =
      env.caller ?? (env.apiKey ? createAnthropicCaller(env.apiKey, env.model || DEFAULT_MODEL) : null);
    if (!caller) return json({ error: "API mode is not configured on the server." }, 503);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowRequest(ip)) return json({ error: "Too many requests. Try again shortly." }, 429);

    return json(validated(await trackBeliefsWithModel(story, caller)));
  } catch {
    // Log a fixed phrase only: error text can include parts of a request, and nothing a person
    // submitted should reach a log. Nothing internal (or key-related) is echoed to the client either.
    console.error("belief-tracking failed");
    return json({ error: "Could not produce a belief table." }, 502);
  }
}

/** Every response is checked against the output schema before it leaves the server. */
function validated<T>(table: T) {
  return BeliefTableSchema.parse(table);
}
