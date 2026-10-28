import { buildAvatarSpec, buildGeometry } from "@botavatar/engine";
import type { AvatarGeometry, StylePack } from "@botavatar/engine";
import { renderGeometry, renderSvg } from "@botavatar/svg";
import { Hono } from "hono";
import { RENDER_BUILD } from "./build-id.js";
import type { ValidatedPack } from "./packs.js";
import { packContentHash } from "./pack-hash.js";
import { renderPng } from "./png.js";
import { CACHE_CONTROL, errorBody, identityHash } from "./respond.js";
import { avatarTag, matchesIfNoneMatch, packHeader } from "./tag.js";

export type Logger = (line: string) => void;

export interface AppOptions {
  /** Only packs that went through `parsePack`; a raw `StylePack` is a type error. */
  packs: readonly ValidatedPack[];
  logger?: Logger;
  /** Seam for tests: counts spec builds without changing what is served. */
  build?: typeof buildAvatarSpec;
  /** Seam for tests: counts renders without changing what is served. */
  render?: typeof renderSvg;
  /** Seam for tests: the geometry build a sphere pack takes. */
  geometryBuild?: typeof buildGeometry;
  /** Seam for tests: the geometry render a sphere pack takes. */
  geometryRender?: typeof renderGeometry;
}

const MAX_IDENTITY = 200;
const DEFAULT_SIZE = 128;
const MIN_SIZE = 16;
const MAX_SIZE = 1024;
/**
 * The JSON body is the spec the SVG is built from, so it depends on the pack and the identity
 * only. Its tag hashes fixed sentinels instead of the render options, for two reasons: `size`
 * and `state` do not change the JSON bytes, and a distinct tag per representation keeps a
 * client from reusing an SVG validator on the JSON route (and vice versa).
 */
const JSON_TAG_SIZE = 0;
const JSON_TAG_STATE = "json";
/** The API contract is UTF-8 JSON; Hono's `c.json` only says `application/json`. */
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** Splits `/v1/avatar/<identity>.<kind>` from the right, so identities may contain dots. */
export function parseIdentity(
  pathname: string,
): { identity: string; kind: "svg" | "json" | "png" } | null {
  const prefix = "/v1/avatar/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const suffix = rest.endsWith(".svg")
    ? ".svg"
    : rest.endsWith(".json")
      ? ".json"
      : rest.endsWith(".png")
        ? ".png"
        : null;
  if (!suffix) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest.slice(0, -suffix.length));
  } catch {
    return null;
  }
  return { identity: decoded, kind: suffix.slice(1) as "svg" | "json" | "png" };
}

function readSize(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_SIZE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE ? value : null;
}

/**
 * `#rgb` or `#rrggbb` — the only colour syntax this service accepts for `bg`. Names
 * and functional notations are rejected rather than guessed at: the value is handed
 * straight to an SVG fill, and one rule keeps the contract (and its tests) exact.
 */
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the pack's eye block is the v2 sphere rig, which renders from geometry. */
function isSpherePack(pack: StylePack): boolean {
  return (pack.eyes as unknown as { kind?: unknown }).kind === "sphere";
}

/** True when the pack fills its eyes with the surface colour, so `bg` is mandatory. */
function paintsEyesWithSurface(pack: StylePack): boolean {
  const eyes = pack.eyes as unknown as { kind?: unknown; eyePaint?: unknown };
  return eyes.kind === "sphere" && eyes.eyePaint === "surface";
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

export function createApp({
  packs,
  logger = () => {},
  build = buildAvatarSpec,
  render = renderSvg,
  geometryBuild = buildGeometry,
  geometryRender = renderGeometry,
}: AppOptions): Hono {
  const app = new Hono();
  // Hash once per pack, here: the hash is a pack-level constant and must never be computed
  // per request, or every cache hit would pay a full canonical serialisation.
  const byId = new Map(
    packs.map((pack) => [pack.id, { pack, hash: packContentHash(pack) }] as const),
  );

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

  app.get("/health", (c) =>
    c.json({ ok: true, packs: byId.size, renderBuild: RENDER_BUILD }),
  );

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
    const entry = byId.get(packId);
    if (!entry) {
      return c.json(
        errorBody("unknown_pack", `unknown pack: ${packId}`, { packs: [...byId.keys()] }),
        400,
      );
    }
    const { pack, hash: packHash } = entry;

    const size = readSize(url.searchParams.get("size") ?? undefined);
    if (size === null) {
      return c.json(errorBody("bad_size", `size must be an integer ${MIN_SIZE}-${MAX_SIZE}`), 400);
    }
    const state = url.searchParams.get("state") ?? "idle";
    if (state !== "idle" && state !== "working") {
      return c.json(errorBody("bad_state", "state must be idle or working"), 400);
    }

    // `bg` is the surface the avatar is drawn on. It only changes the bytes of a pack
    // that paints its eyes with the surface colour, but it is always validated and
    // always part of the render tag: a client that sends a different surface must
    // never be handed the previous surface's bytes from cache.
    const bg = url.searchParams.get("bg");
    if (bg !== null && !HEX_COLOUR.test(bg)) {
      return c.json(errorBody("bad_bg", "bg must be a hex colour: #rgb or #rrggbb"), 400);
    }
    if (bg === null && paintsEyesWithSurface(pack)) {
      return c.json(
        errorBody("bad_bg", "bg is required: this pack paints its eyes with the surface colour"),
        400,
      );
    }
    const sphere = isSpherePack(pack);
    const surface = bg ?? undefined;

    // The tag is opaque: a hash over the pack hash, the identity hash, the options,
    // the representation kind and the renderer build. A PNG and an SVG of the same
    // avatar never share a tag, so neither can validate the other; and a renderer
    // upgrade invalidates every cached avatar once, even when the pack is unchanged.
    // The surface colour joins the inputs because the eye cut-out makes the bytes
    // depend on it; JSON does not paint, so its tag keeps fixed sentinels instead.
    const tag =
      kind === "json"
        ? avatarTag({
            packHash,
            identity,
            size: JSON_TAG_SIZE,
            state: JSON_TAG_STATE,
            kind: "json",
            renderBuild: RENDER_BUILD,
          })
        : avatarTag({
            packHash,
            identity,
            size,
            state,
            kind,
            surface: bg ?? "",
            renderBuild: RENDER_BUILD,
          });
    const headers = {
      ETag: tag,
      "X-Avatar-Pack": packHeader(pack),
      "X-Avatar-Build": RENDER_BUILD,
      "Cache-Control": CACHE_CONTROL,
    };
    if (matchesIfNoneMatch(c.req.header("if-none-match"), tag)) {
      return c.body(null, 304, headers);
    }

    // Everything above this line is validation and a constant-time tag; nothing here may build
    // the spec or render the svg until a 200 is certain, or a cache hit pays for both.
    if (kind === "json") {
      // A sphere pack has no `AvatarSpec` (`AvatarSpec.eyes` only holds rects), so its
      // geometry is the equivalent JSON body.
      return c.json(sphere ? geometryBuild(pack, identity) : build(pack, identity), 200, headers);
    }
    // One rendering path, two encodings: the exact SVG string the `.svg` route
    // would serve, rasterised once. No second build and no second render call.
    const svg = sphere
      ? geometryRender(geometryBuild(pack, identity), {
          size,
          state,
          surfaceColour: surface,
        })
      : render(build(pack, identity), { size, state, surfaceColour: surface });

    if (kind === "png") {
      return c.body(new Uint8Array(renderPng(svg, size)), 200, {
        "Content-Type": "image/png",
        ...headers,
      });
    }
    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      ...headers,
    });
  });

  app.notFound((c) => c.json(errorBody("not_found", "no such route"), 404));

  return app;
}
