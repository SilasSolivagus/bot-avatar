/**
 * The shape seed for an identity: `hash * 31 + charCode`, truncated to 32 bits.
 * Kept bit-exact with the upstream formula so recorded fixtures stay valid.
 */
export function avatarSeed(identity: string): number {
  let hash = 0;
  for (let index = 0; index < identity.length; index++) {
    hash = (hash << 5) - hash + identity.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
