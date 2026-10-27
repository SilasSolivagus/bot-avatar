import type { AvatarSpec, StylePack } from "@botavatar/engine";
import { avatarAssignableLooks, avatarFamily, avatarLook, avatarSeed } from "@botavatar/engine";

/** How many specs wear each look. */
export function lookCounts(specs: readonly AvatarSpec[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const spec of specs) counts.set(spec.look, (counts.get(spec.look) ?? 0) + 1);
  return counts;
}

/**
 * Whether a wall spreads its specs as evenly as the pack allows. `assignableLooks`
 * is the pack's list of looks, not the wall's: `missing` is measured against what
 * the pack can produce, so a wall that skips a look cannot look balanced.
 */
export function balance(
  specs: readonly AvatarSpec[],
  assignableLooks: readonly number[],
): { ok: boolean; max: number; allowed: number; missing: number[] } {
  const counts = lookCounts(specs);
  const allowed = Math.ceil(specs.length / Math.max(1, assignableLooks.length));
  const max = Math.max(0, ...counts.values());
  const missing = assignableLooks.filter((look) => !counts.has(look));
  return { ok: max <= allowed && missing.length === 0, max, allowed, missing };
}

/** The share of specs that repeat a look someone else already wears. */
export function distinctness(specs: readonly AvatarSpec[]): {
  distinct: number;
  total: number;
  rate: number;
} {
  const distinct = new Set(specs.map((spec) => spec.look)).size;
  const total = specs.length;
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
