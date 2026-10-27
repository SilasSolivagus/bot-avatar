import type { ShapeFamily } from "./spec.js";

/** The family an identity hash lands on: `seed % shapes.length`. */
export function avatarFamily(seed: number, shapes: readonly ShapeFamily[]): number {
  return seed % shapes.length;
}

/** The visual identity of a family, merging families a pack declares equivalent. */
export function avatarLook(family: number, shapes: readonly ShapeFamily[]): number {
  return shapes[family]?.look ?? family;
}

/** Looks a new identity may be assigned: reserved families removed, duplicates merged. */
export function avatarAssignableLooks(shapes: readonly ShapeFamily[]): number[] {
  const looks = new Set<number>();
  for (let family = 0; family < shapes.length; family++) {
    if (shapes[family]?.reserved) continue;
    looks.add(avatarLook(family, shapes));
  }
  return [...looks].sort((a, b) => a - b);
}
