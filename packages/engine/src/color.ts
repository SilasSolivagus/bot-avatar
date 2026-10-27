const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const GOLDEN = 2654435769;

/** 32-bit FNV-1a. Separate from `avatarSeed` on purpose; see the plan's Task 7 note. */
export function fnv1a(value: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME);
  }
  return hash >>> 0;
}

/** SplitMix32, returning a generator of uniforms in [0, 1). */
function uniform(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 1831565813) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which palette entry an identity wears. */
export function colorIndex(identity: string, count: number): number {
  const seed = (fnv1a(identity) ^ Math.imul(1, GOLDEN)) >>> 0;
  return Math.floor(uniform((seed ^ GOLDEN) >>> 0)() * count);
}
