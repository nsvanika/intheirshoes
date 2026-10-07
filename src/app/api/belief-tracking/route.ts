import { handleBeliefRequest, readEnv } from "@/engine/handler";

// Server-only route: reads ANTHROPIC_API_KEY from the environment, never from the client.
export async function POST(request: Request) {
  return handleBeliefRequest(request, readEnv());
}
