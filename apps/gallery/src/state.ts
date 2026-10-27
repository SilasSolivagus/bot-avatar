export interface WallState {
  pack: string;
  ids: string[];
  size: number;
}

export const DEFAULT_SIZE = 160;
export const MIN_SIZE = 48;
export const MAX_SIZE = 512;
export const MAX_IDS = 60;

export function parseWallState(
  search: string,
  knownPacks: readonly string[],
  fallbackIds: readonly string[],
): WallState {
  const params = new URLSearchParams(search);
  const requestedPack = params.get("pack") ?? "";
  const pack = knownPacks.includes(requestedPack) ? requestedPack : (knownPacks[0] ?? "");

  const rawIds = (params.get("ids") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const uniqueIds = [...new Set(rawIds)].slice(0, MAX_IDS);
  const ids = uniqueIds.length > 0 ? uniqueIds : [...fallbackIds];

  const parsedSize = Number(params.get("size"));
  const size =
    Number.isInteger(parsedSize) && parsedSize >= MIN_SIZE && parsedSize <= MAX_SIZE
      ? parsedSize
      : DEFAULT_SIZE;

  return { pack, ids, size };
}

/**
 * `encodeURIComponent` rather than `URLSearchParams`, so a space round-trips as
 * `%20` instead of `+`. `parseWallState` reads either form.
 */
export function formatWallState({ pack, ids, size }: WallState): string {
  const entries: ReadonlyArray<readonly [string, string]> = [
    ["pack", pack],
    ["ids", ids.join(",")],
    ["size", String(size)],
  ];
  const query = entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return `?${query}`;
}
