import type { StylePack } from "@botavatar/engine";
import { avatarAssignableLooks, avatarFamily, avatarLook, avatarSeed } from "@botavatar/engine";

/**
 * The one thing these metrics need from a rendered avatar. The wall now holds
 * `AvatarGeometry` rather than `AvatarSpec`, and both wear a `look`.
 */
export interface LookBearing {
  look: number;
}

/** How many avatars wear each look. */
export function lookCounts(avatars: readonly LookBearing[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const avatar of avatars) counts.set(avatar.look, (counts.get(avatar.look) ?? 0) + 1);
  return counts;
}

/**
 * Whether a wall spreads its avatars as evenly as the pack allows. `assignableLooks`
 * is the pack's list of looks, not the wall's: `missing` is measured against what
 * the pack can produce, so a wall that skips a look cannot look balanced.
 *
 * An avatar whose look is not in `assignableLooks` wears a reserved look (a pasted
 * identity whose hash landed there). It is outside the assignment pool, so it is
 * counted in `reserved` and left out of `max`, `allowed` and `missing`: containing
 * a legitimate reserved identity must not make the assignable wall look unbalanced.
 */
export function balance(
  avatars: readonly LookBearing[],
  assignableLooks: readonly number[],
): { ok: boolean; max: number; allowed: number; missing: number[]; reserved: number } {
  const assignable = new Set(assignableLooks);
  const assigned = avatars.filter((avatar) => assignable.has(avatar.look));
  const counts = lookCounts(assigned);
  const allowed = Math.ceil(assigned.length / Math.max(1, assignableLooks.length));
  const max = Math.max(0, ...counts.values());
  const missing = assignableLooks.filter((look) => !counts.has(look));
  return {
    ok: max <= allowed && missing.length === 0,
    max,
    allowed,
    missing,
    reserved: avatars.length - assigned.length,
  };
}

/** The share of avatars that repeat a look someone else already wears. */
export function distinctness(avatars: readonly LookBearing[]): {
  distinct: number;
  total: number;
  rate: number;
} {
  const distinct = new Set(avatars.map((avatar) => avatar.look)).size;
  const total = avatars.length;
  return { distinct, total, rate: total === 0 ? 0 : (total - distinct) / total };
}

/**
 * Identities whose looks are spread as evenly as the pack allows: walk the
 * assignable looks round-robin, and for each look take the next identity whose
 * hash lands on it. Deterministic, so a shared link reproduces the same wall.
 */
export function wallIdentities(pack: StylePack, count: number): string[] {
  const looks = avatarAssignableLooks(pack.shapes);
  const ids: string[] = [];
  const used = new Map<number, number>();
  for (let slot = 0; ids.length < count && looks.length > 0; slot++) {
    const target = looks[slot % looks.length]!;
    const attempt = used.get(target) ?? 0;
    const id = identityWithLook(pack, target, attempt);
    used.set(target, attempt + 1);
    if (!ids.includes(id)) ids.push(id);
    if (slot > count * 50) break;
  }
  return ids.slice(0, count);
}

/** The `ordinal`-th `wall-<look>-<n>` identity whose hash lands on `look`. */
function identityWithLook(pack: StylePack, look: number, ordinal: number): string {
  let seen = 0;
  for (let index = 0; ; index++) {
    const identity = `wall-${look}-${index}`;
    const family = avatarFamily(avatarSeed(identity), pack.shapes);
    if (avatarLook(family, pack.shapes) !== look) continue;
    if (seen === ordinal) return identity;
    seen++;
  }
}
