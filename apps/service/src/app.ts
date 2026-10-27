import type { StylePack } from "@botavatar/engine";
import { buildAvatarSpec } from "@botavatar/engine";
import { renderSvg } from "@botavatar/svg";
import { Hono } from "hono";
import { CACHE_CONTROL, errorBody, etagFor, identityHash } from "./respond.js";

export type Logger = (line: string) => void;

export interface AppOptions {
  packs: readonly StylePack[];
  logger?: Logger;
}

const MAX_IDENTITY = 200;
const DEFAULT_SIZE = 128;
const MIN_SIZE = 16;
const MAX_SIZE = 1024;
/** The API contract is UTF-8 JSON; Hono's `c.json` only says `application/json`. */
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** Splits `/v1/avatar/<identity>.<kind>` from the right, so identities may contain dots. */
export function parseIdentity(pathname: string): { identity: string; kind: "svg" | "json" } | null {
  const prefix = "/v1/avatar/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const suffix = rest.endsWith(".svg") ? ".svg" : rest.endsWith(".json") ? ".json" : null;
  if (!suffix) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest.slice(0, -suffix.length));
  } catch {
    return null;
  }
  return { identity: decoded, kind: suffix === ".svg" ? "svg" : "json" };
}

function readSize(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_SIZE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE ? value : null;
}

/**
 * True when `If-None-Match` selects the current representation. The header is a comma-separated
 * list of opaque tags; `*` selects any representation and a `W/` prefix means weak comparison,
 * which still matches on the opaque tag value (RFC 9110 §13.1.2).
 */
function matchesIfNoneMatch(header: string | undefined, tag: string): boolean {
  if (!header) return false;
  return header.split(",").some((part) => {
    const candidate = part.trim();
    if (candidate === "*") return true;
    return (candidate.startsWith("W/") ? candidate.slice(2) : candidate) === tag;
  });
}

/**
 * The path that is safe to log. An avatar path never contributes its identity: a parsed one
 * becomes `<hash8>.<kind>`, and a malformed one under the avatar prefix stays opaque. Any
 * other route is already public.
 */
function logRoute(pathname: string): string {
  const parsed = parseIdentity(pathname);
  if (parsed) return `/v1/avatar/<${identityHash(parsed.identity).slice(0, 8)}>.${parsed.kind}`;
  return pathname.startsWith("/v1/avatar/") ? "/v1/avatar/*" : pathname;
}

export function createApp({ packs, logger = () => {} }: AppOptions): Hono {
  const app = new Hono();
  const byId = new Map(packs.map((pack) => [pack.id, pack]));

  // Registered before the routes so it wraps every response, including 404, 503 and 304.
  // It only reads the response status; the body is left untouched.
  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    const elapsed = Math.round(performance.now() - started);
    const pathname = new URL(c.req.url).pathname;
    logger(`${c.req.method} ${logRoute(pathname)} ${c.res.status} ${elapsed}ms`);
  });

  // JSON is always UTF-8; make it explicit instead of relying on Hono's bare `application/json`.
  // The 304 path sets no content type at all, so it is left alone.
  app.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("content-type")?.startsWith("application/json")) {
      c.res.headers.set("content-type", JSON_CONTENT_TYPE);
    }
  });

  app.get("/health", (c) => c.json({ ok: true, packs: byId.size }));

  app.get("/v1/packs", (c) =>
    c.json({
      packs: packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        familyCount: pack.shapes.length,
      })),
    }),
  );

  app.get("/v1/avatar/*", (c) => {
    const parsed = parseIdentity(new URL(c.req.url).pathname);
    if (!parsed) return c.json(errorBody("not_found", "no such route"), 404);
    const { identity, kind } = parsed;

    const length = [...identity].length;
    if (length < 1 || length > MAX_IDENTITY) {
      return c.json(errorBody("bad_identity", `identity must be 1-${MAX_IDENTITY} characters`), 400);
    }

    if (packs.length === 0) {
      return c.json(errorBody("no_packs", "no packs are configured"), 503);
    }

    const url = new URL(c.req.url);
    const packId = url.searchParams.get("pack") ?? packs[0]!.id;
    const pack = byId.get(packId);
    if (!pack) {
      return c.json(
        errorBody("unknown_pack", `unknown pack: ${packId}`, { packs: [...byId.keys()] }),
        400,
      );
    }

    const size = readSize(url.searchParams.get("size") ?? undefined);
    if (size === null) {
      return c.json(errorBody("bad_size", `size must be an integer ${MIN_SIZE}-${MAX_SIZE}`), 400);
    }
    const state = url.searchParams.get("state") ?? "idle";
    if (state !== "idle" && state !== "working") {
      return c.json(errorBody("bad_state", "state must be idle or working"), 400);
    }

    // The SVG varies with size and state, so its tag carries them; the JSON does not, so it does not.
    const tag =
      kind === "svg"
        ? `"${pack.id}@${pack.version}:${identityHash(identity)}:${size}:${state}"`
        : etagFor(pack, identity);
    if (matchesIfNoneMatch(c.req.header("if-none-match"), tag)) {
      return c.body(null, 304, { ETag: tag, "Cache-Control": CACHE_CONTROL });
    }

    const spec = buildAvatarSpec(pack, identity);

    if (kind === "svg") {
      return c.body(renderSvg(spec, { size, state }), 200, {
        "Content-Type": "image/svg+xml; charset=utf-8",
        ETag: tag,
        "Cache-Control": CACHE_CONTROL,
      });
    }
    return c.json(spec, 200, { ETag: tag, "Cache-Control": CACHE_CONTROL });
  });

  app.notFound((c) => c.json(errorBody("not_found", "no such route"), 404));

  return app;
}
