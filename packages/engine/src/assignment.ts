import { avatarFamily } from "./family.js";
import { avatarSeed } from "./seed.js";
import type { StylePack } from "./spec.js";

/** A uniform number in [0, 1). Injected so the engine itself stays deterministic. */
export type Random = () => number;

/**
 * One of the options `used` relies on least, chosen at random among ties,
 * preferring anything missing from `avoid`.
 */
export function pickLeastUsed<T>(
  options: readonly T[],
  used: readonly T[],
  random: Random,
  avoid: readonly T[] = [],
): T {
  const counts = options.map((option) => used.filter((value) => value === option).length);
  const fewest = Math.min(...counts);
  const least = options.filter((_, index) => counts[index] === fewest);
  const preferred = least.filter((option) => !avoid.includes(option));
  const candidates = preferred.length > 0 ? preferred : least;
  return candidates[Math.floor(random() * candidates.length)] ?? options[0]!;
}

/**
 * A stable identity whose hash lands on `family`, for previews before an id exists.
 *
 * `family` is a FAMILY index in `[0, pack.shapes.length)`, not a LOOK number.
 * `avatarAssignableLooks` returns looks, which merge equivalent families and
 * exclude reserved ones; a caller holding an assignable look must map it to a
 * family first. An out-of-range family throws rather than searching forever.
 */
export function avatarSampleIdentity(pack: StylePack, family: number): string {
  if (!Number.isInteger(family) || family < 0 || family >= pack.shapes.length) {
    throw new RangeError(
      `avatarSampleIdentity: family must be an integer in [0, ${pack.shapes.length}); received ${family}`,
    );
  }
  for (let index = 0; ; index++) {
    const identity = `look-${family}-${index}`;
    if (avatarFamily(avatarSeed(identity), pack.shapes) === family) return identity;
  }
}
