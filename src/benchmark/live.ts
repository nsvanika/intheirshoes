import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "@/engine/api-mode";
import type { ModelCall, RunSettings } from "./runner";
import { DEFAULT_SETTINGS } from "./runner";

/**
 * The real model call, used ONLY by `npm run benchmark` when someone runs it deliberately with a key.
 * The same function serves both methods, so model, version, token limit and every setting are identical.
 *
 *  - thinking is disabled, so neither method gets hidden reasoning; the only visible difference
 *    between the methods is the belief table. (With thinking left on, plain prompting would also
 *    reason, just out of sight, and the comparison would no longer be about explicit tracking.)
 *  - sampling settings are not set: this model does not allow changing them, so replies are not
 *    perfectly repeatable. The protocol says so, and --runs repeats the questions.
 */
export const BENCHMARK_MODEL = DEFAULT_MODEL;

export function liveCaller(apiKey: string, model: string, settings: RunSettings = DEFAULT_SETTINGS): ModelCall {
  const client = new Anthropic({ apiKey });
  return async (system, user) => {
    const response = await client.messages.create({
      model,
      max_tokens: settings.maxTokens,
      system,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: user }],
    });
    const block = response.content.find((b) => b.type === "text");
    return {
      text: block && block.type === "text" ? block.text : "",
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}
