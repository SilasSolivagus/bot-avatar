export interface WallState {
  pack: string;
  ids: string[];
  size: number;
}

export const DEFAULT_SIZE = 160;
export const MIN_SIZE = 48;
export const MAX_SIZE = 512;
export const MAX_IDS = 60;

export type AddIdentityResult =
  | { outcome: "added"; ids: string[] }
  | { outcome: "duplicate"; ids: readonly string[] }
  | { outcome: "full"; ids: readonly string[] };

/**
 * Append one identity to the wall, or report why it was not appended. Extracted
 * from the input handler so the 60-id cap is testable without a browser.
 */
export function addWallIdentity(
  ids: readonly string[],
  identity: string,
): AddIdentityResult {
  if (ids.includes(identity)) return { outcome: "duplicate", ids };
  if (ids.length >= MAX_IDS) return { outcome: "full", ids };
  return { outcome: "added", ids: [...ids, identity] };
}

export function parseWallState(
  search: string,
  knownPacks: readonly string[],
  fallbackIds: readonly string[],
): WallState {
  const params = new URLSearchParams(search);
  const requestedPack = params.get("pack") ?? "";
  const pack = knownPacks.includes(requestedPack) ? requestedPack : (knownPacks[0] ?? "");

  // `id` is repeated once per identity and is read verbatim: the input trims
  // user text before adding it, so the URL layer must not trim again. The old
  // comma-separated `ids` list is still accepted, with its trim-and-drop rule.
  const idParams = params.getAll("id").filter((identity) => identity.length > 0);
  const rawIds =
    idParams.length > 0
      ? idParams
      : (params.get("ids") ?? "")
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
 * One `id=` parameter per identity, so a comma or edge whitespace inside an
 * identity survives the round-trip. `encodeURIComponent` rather than
 * `URLSearchParams`, so a space stays `%20` instead of `+`; `parseWallState`
 * reads either form.
 */
export function formatWallState({ pack, ids, size }: WallState): string {
  const entries: ReadonlyArray<readonly [string, string]> = [
    ["pack", pack],
    ...ids.map((identity) => ["id", identity] as const),
    ["size", String(size)],
  ];
  const query = entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return `?${query}`;
}
