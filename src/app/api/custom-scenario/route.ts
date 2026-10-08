import { getCustomConfig, handleCustomRequest, readCustomEnv } from "@/engine/custom-handler";

// Server-only. ANTHROPIC_API_KEY is read from the environment here and never sent to the browser.

/** Tells the page which mode is active (demo or AI), the size limit, and the demo examples. */
export async function GET() {
  return Response.json(getCustomConfig(readCustomEnv()), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  return handleCustomRequest(request, readCustomEnv());
}
