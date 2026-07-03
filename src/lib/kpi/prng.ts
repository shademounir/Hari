// Small, fast, seedable PRNG (mulberry32) — deterministic across machines and
// runs. Shared by the KPI test factory (tests/factories/dashboard.ts) and the
// demo seed (prisma/team-activity.ts) so both reproduce the SAME dataset from a
// given seed; keeping one implementation removes the drift risk of two copies.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
