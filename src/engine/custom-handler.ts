import { findDemoExample, demoExamples } from "@/data/custom-examples";
import { DEFAULT_MODEL, createAnthropicCaller, type ModelCaller } from "./api-mode";
import { CUSTOM_SYSTEM_PROMPT, buildCustomMessage, parseModelJson } from "./custom-ai";
import { convertExtraction, findPrivateInfo, type Conversion } from "./custom-convert";
import {
  CustomRequestSchema,
  CustomResponseSchema,
  MAX_TEXT_CHARS,
  type CustomConfig,
  type CustomRequest,
} from "./custom-schema";
import { allowRequest } from "./rate-limit";

/**
 * Server side of "Make Your Own".
 *
 * Privacy: the user's description is never stored, never put in a log line, and never sent
 * anywhere in demo mode. In AI mode it is sent to the configured AI provider (and nowhere
 * else); the page says so before submitting. Failures are logged by a fixed code only.
 */

const MAX_BODY_BYTES = 20_000;
const RATE_LIMIT_PER_MINUTE = 5;

export interface CustomEnv {
  /** "ai" turns on AI reading when a key is also present. Anything else means demo mode. */
  mode?: string;
  apiKey?: string;
  model?: string;
  /** Test hook: replaces the real AI call. */
  caller?: ModelCaller;
}

/** Reads server-side settings. The API key only ever lives here. */
export function readCustomEnv(): CustomEnv {
  return {
    mode: process.env.CUSTOM_SCENARIO_MODE,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
  };
}

export function effectiveMode(env: CustomEnv): "demo" | "ai" {
  return env.mode === "ai" && (env.apiKey || env.caller) ? "ai" : "demo";
}

export function getCustomConfig(env: CustomEnv): CustomConfig {
  const mode = effectiveMode(env);
  return {
    mode,
    maxChars: MAX_TEXT_CHARS,
    note:
      env.mode === "ai" && mode === "demo"
        ? "AI reading is switched on in settings, but no AI key is configured, so this is running in demo mode."
        : null,
    examples: demoExamples.map((e) => ({ id: e.id, title: e.title, text: e.text })),
  };
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const DEMO_MESSAGE =
  "This is demo mode, so it can only read the example situations on this page, not your own words. Pick one of the examples to see how it works. Reading any description you write needs an AI service, which the site owner has not set up yet. Nothing you typed was sent anywhere.";

const BAD_OUTPUT_MESSAGE =
  "We couldn't turn that into a story we can trust. Please try again, or describe it more simply, with four to six things that happen and who is there for each.";

function respond(conversion: Conversion, clarificationRounds: number): Response {
  switch (conversion.kind) {
    case "ready":
      return json(CustomResponseSchema.parse(conversion.response));
    case "clarify":
      // After two rounds of questions, stop asking: the description needs more detail.
      return clarificationRounds >= 2
        ? json({
            status: "cannot_process",
            message:
              "We still can't tell who saw or heard what. Try adding that to your description, then generate again.",
          })
        : json(
            CustomResponseSchema.parse({
              status: "needs_clarification",
              question: conversion.question,
              options: conversion.options,
            }),
          );
    case "cannot":
      return json(CustomResponseSchema.parse({ status: "cannot_process", message: conversion.message }));
    case "invalid":
      // Log only the reason code, never the user's text or the model's output.
      console.error("custom-scenario: unusable reading:", conversion.code);
      return json({ error: BAD_OUTPUT_MESSAGE }, 502);
  }
}

function sourceOf(request: CustomRequest): string {
  const answers = request.clarifications.map((c) => `Question: ${c.question}\nAnswer: ${c.answer}`);
  return [request.text, ...answers].join("\n");
}

export async function handleCustomRequest(request: Request, env: CustomEnv): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "That is too long. Please shorten your description." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Something went wrong with that request. Please try again." }, 400);
  }

  const parsed = CustomRequestSchema.safeParse(body);
  if (!parsed.success || parsed.data.text.trim().length === 0) {
    // Deliberately generic: validation details could echo the user's text.
    return json(
      { error: `Please write a description of 1 to ${MAX_TEXT_CHARS} characters.` },
      400,
    );
  }
  const req: CustomRequest = { ...parsed.data, text: parsed.data.text.trim() };
  const source = sourceOf(req);

  // Stop obvious private details before anything is processed or sent.
  const privacy = findPrivateInfo(source);
  if (privacy) return json(CustomResponseSchema.parse({ status: "private_info_warning", message: privacy }));

  if (effectiveMode(env) === "demo") {
    const example = findDemoExample(req.exampleId, req.text);
    if (!example) return json(CustomResponseSchema.parse({ status: "demo_unsupported", message: DEMO_MESSAGE }));

    if (example.reading) return respond(convertExtraction(example.reading, source), req.clarifications.length);
    if (req.clarifications.length === 0) return respond(convertExtraction(example.clarify, source), 0);
    const answer = req.clarifications[req.clarifications.length - 1].answer;
    const reading = example.byAnswer?.[answer];
    if (!reading) {
      return json(CustomResponseSchema.parse({ status: "cannot_process", message: "Please choose one of the answers." }));
    }
    return respond(convertExtraction(reading, source), req.clarifications.length);
  }

  // --- AI mode
  // AI mode is only entered when a key (or a test caller) exists; see effectiveMode().
  const caller =
    env.caller ?? createAnthropicCaller(env.apiKey as string, env.model || DEFAULT_MODEL, 4000);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`custom:${ip}`, RATE_LIMIT_PER_MINUTE)) {
    return json({ error: "That's a lot of requests. Please wait a minute and try again." }, 429);
  }

  try {
    const reply = await caller(CUSTOM_SYSTEM_PROMPT, buildCustomMessage(req));
    let reading: unknown;
    try {
      reading = parseModelJson(reply);
    } catch {
      console.error("custom-scenario: model reply was not JSON");
      return json({ error: BAD_OUTPUT_MESSAGE }, 502);
    }
    return respond(convertExtraction(reading, source), req.clarifications.length);
  } catch {
    // Never echo the provider's error text: it could contain parts of the request.
    console.error("custom-scenario: AI request failed");
    return json({ error: "The AI service couldn't be reached just now. Please try again in a moment." }, 502);
  }
}
