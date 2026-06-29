// Deterministic, injectable RNG. The engine NEVER calls Math.random directly;
// shuffling is the only randomness and it goes through here so tests reproduce.

export interface RNG {
  // Returns a float in [0, 1).
  next(): number;
}

// Small, fast, seedable PRNG (mulberry32). Same seed => same sequence.
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// In-place Fisher-Yates using the injected RNG. (Java uses Collections.shuffle;
// we do NOT reproduce java.util.Random — parity is state-based, see PORT_NOTES.)
export function shuffleInPlace<T>(arr: T[], rng: RNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
