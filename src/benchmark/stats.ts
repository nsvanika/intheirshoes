/**
 * Small, dependency-free statistics. With about two dozen questions every interval here is wide;
 * the About page says so. Nothing in this file decides what to report: the protocol does.
 */

/** Wilson 95% interval for a proportion (treats every question as independent; see the family version below). */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Natural log of n choose k, so large n cannot overflow. */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/**
 * Exact two-sided McNemar test for paired yes/no outcomes. `b` and `c` are the two kinds of
 * discordant pairs (A right and B wrong, and the reverse). With no discordant pairs there is
 * nothing to test, and p = 1.
 */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/** A small seeded random generator, so the same data always gives the same interval. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Clustered {
  family: string;
  value: number;
}

/**
 * Family-clustered bootstrap, as in the paper: whole families are resampled together, because
 * stories in one family are related and are not independent evidence. `values` has one number per
 * question (1 or 0 for correctness, or a paired difference).
 */
export function clusterBootstrap(
  items: Clustered[],
  resamples = 2000,
  seed = 20261008,
): { mean: number; low: number; high: number; families: number } {
  const families = [...new Set(items.map((i) => i.family))];
  const byFamily = new Map(families.map((f) => [f, items.filter((i) => i.family === f).map((i) => i.value)]));
  const mean = items.reduce((s, i) => s + i.value, 0) / (items.length || 1);
  if (families.length === 0) return { mean: 0, low: 0, high: 0, families: 0 };
  const rand = seededRandom(seed);
  const stats: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < families.length; i++) {
      const values = byFamily.get(families[Math.floor(rand() * families.length)])!;
      for (const v of values) sum += v;
      count += values.length;
    }
    stats.push(sum / count);
  }
  stats.sort((a, b) => a - b);
  return {
    mean,
    low: stats[Math.floor(0.025 * resamples)],
    high: stats[Math.min(resamples - 1, Math.floor(0.975 * resamples))],
    families: families.length,
  };
}
