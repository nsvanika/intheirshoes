/**
 * Tiny fixed-window rate limiter, used only in API mode to cap paid requests.
 * In-memory: it resets on restart and is per server instance, so treat it as a
 * safety net, not a substitute for a spending limit on the Anthropic account.
 */
const hits = new Map<string, { count: number; windowStart: number }>();

export function allowRequest(key: string, limit = 10, windowMs = 60_000, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
