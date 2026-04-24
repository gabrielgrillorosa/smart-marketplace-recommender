function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function lcgNext(state: number): number {
  // LCG parameters from Numerical Recipes
  return (1664525 * state + 1013904223) & 0xffffffff;
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let state = hashSeed(seed);

  for (let i = result.length - 1; i > 0; i--) {
    state = lcgNext(state);
    const j = Math.abs(state) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
