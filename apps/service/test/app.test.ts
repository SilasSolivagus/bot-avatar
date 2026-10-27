import { describe, expect, it, vi } from "vitest";
import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "@botavatar/svg";
import { createApp, parseIdentity } from "../src/app.js";
import { packContentHash } from "../src/pack-hash.js";

// Count calls without changing the hash: the real implementation still runs.
vi.mock("../src/pack-hash.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/pack-hash.js")>();
  return { ...actual, packContentHash: vi.fn(actual.packContentHash) };
});

const app = createApp({ packs: [organicBlob], logger: () => {} });

describe("health", () => {
  it("reports readiness and the number of packs", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, packs: 1 });
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("json content type", () => {
  it("declares utf-8 explicitly on every json response", async () => {
    const paths = ["/health", "/v1/packs", "/v1/avatar/alice.json", "/nope", "/v1/avatar/nope"];
    for (const path of paths) {
      const res = await app.request(path);
      expect(res.headers.get("content-type"), path).toBe("application/json; charset=utf-8");
    }
    const unknownPack = await app.request("/v1/avatar/alice.svg?pack=nope");
    expect(unknownPack.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const empty = createApp({ packs: [] });
    expect((await empty.request("/v1/avatar/alice.svg")).headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });
});

describe("GET /v1/packs", () => {
  it("lists id, name, version and family count", async () => {
    const res = await app.request("/v1/packs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { packs: Array<Record<string, unknown>> };
    expect(body.packs).toEqual([
      { id: "organic-blob", name: "Organic Blob", version: "1.0.0", familyCount: 10 },
    ]);
  });
});

const SVG = (path: string) => app.request(path, { headers: { accept: "image/svg+xml" } });

describe("GET /v1/avatar/:identity.svg", () => {
  it("returns an svg for a plain identity", async () => {
    const res = await SVG("/v1/avatar/alice.svg?size=64");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith("<svg")).toBe(true);
    expect(body).toContain('width="64"');
  });

  it("treats an email as one identity, dots included", async () => {
    const res = await SVG("/v1/avatar/alice%40example.com.svg");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<svg");
  });

  it("decodes a UTF-8 identity", async () => {
    const res = await SVG(`/v1/avatar/${encodeURIComponent("张三")}.svg`);
    expect(res.status).toBe(200);
  });

  it("defaults size to 128 and state to idle", async () => {
    const body = await (await SVG("/v1/avatar/bob.svg")).text();
    expect(body).toContain('width="128"');
    expect(body).not.toContain("<style>");
  });

  it("adds the animation only for state=working", async () => {
    const body = await (await SVG("/v1/avatar/bob.svg?state=working")).text();
    expect(body).toContain("<style>");
    expect(body).toContain("@keyframes");
  });

  it("rejects an empty identity", async () => {
    const res = await app.request("/v1/avatar/.svg");
    expect(res.status).toBe(400);
  });

  it("rejects an identity over 200 characters", async () => {
    const res = await app.request(`/v1/avatar/${"a".repeat(201)}.svg`);
    expect(res.status).toBe(400);
  });

  it("counts an emoji as one character, not two UTF-16 code units", async () => {
    expect((await app.request(`/v1/avatar/${"😀".repeat(100)}.svg`)).status).toBe(200);
    // 101 emoji are 202 UTF-16 code units but only 101 characters; the 200-character
    // limit is measured in code points, so this must fit.
    expect((await app.request(`/v1/avatar/${"😀".repeat(101)}.svg`)).status).toBe(200);
  });

  it("accepts exactly 200 emoji and rejects 201", async () => {
    expect((await app.request(`/v1/avatar/${"😀".repeat(200)}.svg`)).status).toBe(200);
    expect((await app.request(`/v1/avatar/${"😀".repeat(201)}.svg`)).status).toBe(400);
  });

  it("rejects a size outside 16..1024 and a bad state", async () => {
    expect((await SVG("/v1/avatar/a.svg?size=8")).status).toBe(400);
    expect((await SVG("/v1/avatar/a.svg?size=abc")).status).toBe(400);
    expect((await SVG("/v1/avatar/a.svg?state=sleeping")).status).toBe(400);
  });

  it("rejects an unknown pack and lists the known ones", async () => {
    const res = await SVG("/v1/avatar/alice.svg?pack=nope");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { packs: string[] } };
    expect(body.error.packs).toEqual(["organic-blob"]);
  });

  it("404s an unknown route", async () => {
    expect((await app.request("/nope")).status).toBe(404);
  });
});

describe("conditional requests", () => {
  it("returns the same bytes and the same etag twice", async () => {
    const first = await app.request("/v1/avatar/alice.svg?size=96");
    const second = await app.request("/v1/avatar/alice.svg?size=96");
    expect(await first.text()).toBe(await second.text());
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
  });

  it("carries an immutable cache header", async () => {
    const res = await app.request("/v1/avatar/alice.svg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("carries an opaque quoted 16-hex tag with no pack or identity text", async () => {
    const res = await app.request("/v1/avatar/alice.svg");
    const etag = res.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(etag).not.toContain("organic-blob");
    expect(etag).not.toContain("alice");
  });

  it("carries the readable pack name in X-Avatar-Pack on both representations", async () => {
    const svg = await app.request("/v1/avatar/alice.svg");
    const json = await app.request("/v1/avatar/alice.json");
    expect(svg.headers.get("x-avatar-pack")).toBe("organic-blob@1.0.0");
    expect(json.headers.get("x-avatar-pack")).toBe("organic-blob@1.0.0");
  });

  it("answers 304 with no body when the etag matches", async () => {
    const first = await app.request("/v1/avatar/alice.svg");
    const etag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.svg", { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(second.headers.get("x-avatar-pack")).toBe("organic-blob@1.0.0");
    expect(second.headers.get("content-type")).toBeNull();
  });

  it("answers 304 when the if-none-match list contains the current tag", async () => {
    const first = await app.request("/v1/avatar/alice.svg");
    const etag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": `"other", ${etag}, W/"another"` },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("answers 304 for the * wildcard", async () => {
    const res = await app.request("/v1/avatar/alice.svg", { headers: { "if-none-match": "*" } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("answers 304 for a weak tag around the current tag", async () => {
    const first = await app.request("/v1/avatar/alice.svg");
    const etag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": `W/${etag}` },
    });
    expect(second.status).toBe(304);
  });

  it("answers 200 when a list of tags does not contain the current tag", async () => {
    const res = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": '"one", W/"two"' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<svg");
  });

  it("answers 200 when the etag differs", async () => {
    const res = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": '"0000000000000000"' },
    });
    expect(res.status).toBe(200);
  });

  it("gives different identities different etags", async () => {
    const a = await app.request("/v1/avatar/alice.svg");
    const b = await app.request("/v1/avatar/bob.svg");
    expect(a.headers.get("etag")).not.toBe(b.headers.get("etag"));
  });

  it("gives different packs different etags", async () => {
    const twin = { ...structuredClone(organicBlob), id: "organic-twin" };
    const twoPacks = createApp({ packs: [organicBlob, twin], logger: () => {} });
    const a = await twoPacks.request("/v1/avatar/alice.svg?pack=organic-blob");
    const b = await twoPacks.request("/v1/avatar/alice.svg?pack=organic-twin");
    expect(a.headers.get("etag")).not.toBe(b.headers.get("etag"));
    expect(b.headers.get("x-avatar-pack")).toBe("organic-twin@1.0.0");
  });

  it("gives different sizes and states different svg etags", async () => {
    const base = await app.request("/v1/avatar/alice.svg");
    const small = await app.request("/v1/avatar/alice.svg?size=64");
    const working = await app.request("/v1/avatar/alice.svg?state=working");
    expect(small.headers.get("etag")).not.toBe(base.headers.get("etag"));
    expect(working.headers.get("etag")).not.toBe(base.headers.get("etag"));
  });

  it("hashes each pack once when the app is built, never per request", async () => {
    const twin = { ...structuredClone(organicBlob), id: "organic-twin" };
    vi.mocked(packContentHash).mockClear();
    const twoPacks = createApp({ packs: [organicBlob, twin], logger: () => {} });
    expect(packContentHash).toHaveBeenCalledTimes(2);

    for (const pack of ["organic-blob", "organic-twin"]) {
      const res = await twoPacks.request(`/v1/avatar/alice.svg?pack=${pack}`);
      expect(res.status, pack).toBe(200);
    }
    expect(packContentHash).toHaveBeenCalledTimes(2);
  });

  it("does not answer 304 for a json request when the svg etag matches", async () => {
    const svg = await app.request("/v1/avatar/alice.svg");
    const res = await app.request("/v1/avatar/alice.json", {
      headers: { "if-none-match": svg.headers.get("etag")! },
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /v1/avatar/:identity.json", () => {
  it("returns the spec the svg was built from", async () => {
    const res = await app.request("/v1/avatar/alice.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const spec = (await res.json()) as { packId: string; identity: string; path: string };
    expect(spec.packId).toBe("organic-blob");
    expect(spec.identity).toBe("alice");
    expect(spec.path.startsWith("M")).toBe(true);
  });

  it("keeps a stable etag of its own, independent of render options", async () => {
    const first = await app.request("/v1/avatar/alice.json");
    const second = await app.request("/v1/avatar/alice.json");
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(first.headers.get("etag")).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it("ignores size and state in the json etag", async () => {
    const first = await app.request("/v1/avatar/alice.json");
    const second = await app.request("/v1/avatar/alice.json?size=64&state=working");
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
  });

  it("404s a bare identity with no suffix", async () => {
    expect((await app.request("/v1/avatar/alice")).status).toBe(404);
  });
});

describe("robustness", () => {
  it("answers 503 for avatar requests when no packs are configured", async () => {
    const empty = createApp({ packs: [] });
    const res = await empty.request("/v1/avatar/alice.svg");
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no_packs");
  });

  it("answers unrouted requests with a json 404", async () => {
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("answers a bare avatar identity with a json 404", async () => {
    const res = await app.request("/v1/avatar/alice");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});

describe("parseIdentity", () => {
  it("splits the suffix from the right, so dots stay in the identity", () => {
    expect(parseIdentity("/v1/avatar/jane.doe.svg")).toEqual({
      identity: "jane.doe",
      kind: "svg",
    });
    expect(parseIdentity("/v1/avatar/alice%40example.com.svg")?.identity).toBe("alice@example.com");
  });

  it("decodes exactly once", () => {
    expect(parseIdentity("/v1/avatar/a%2525b.svg")?.identity).toBe("a%25b");
    expect(parseIdentity("/v1/avatar/a%25b.svg")?.identity).toBe("a%b");
  });

  it("decodes percent-encoded and UTF-8 bytes", () => {
    expect(parseIdentity("/v1/avatar/alice%20smith.svg")?.identity).toBe("alice smith");
    expect(parseIdentity("/v1/avatar/%E5%BC%A0%E4%B8%89.svg")?.identity).toBe("张三");
  });

  it("keeps a slash encoded in the identity from splitting the route", () => {
    expect(parseIdentity("/v1/avatar/a%2Fb.svg")?.identity).toBe("a/b");
  });

  it("parses the json kind", () => {
    expect(parseIdentity("/v1/avatar/alice.json")).toEqual({ identity: "alice", kind: "json" });
  });

  it("returns null for no suffix, the bare directory, another route, and a bad escape", () => {
    expect(parseIdentity("/v1/avatar/alice")).toBeNull();
    expect(parseIdentity("/v1/avatar/")).toBeNull();
    expect(parseIdentity("/v1/packs")).toBeNull();
    expect(parseIdentity("/v1/avatar/%E0%A4%A.svg")).toBeNull();
  });
});

describe("a cache hit renders nothing", () => {
  it("answers 304 without building a spec or an svg", async () => {
    const build = vi.fn(buildAvatarSpec);
    const render = vi.fn(renderSvg);
    const spyApp = createApp({ packs: [organicBlob], logger: () => {}, build, render });

    const first = await spyApp.request("/v1/avatar/alice.svg?size=96");
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;
    expect(build).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);

    const second = await spyApp.request("/v1/avatar/alice.svg?size=96", {
      headers: { "if-none-match": etag },
    });
    expect(second.status).toBe(304);
    expect(build).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("still renders when the tag does not match", async () => {
    const build = vi.fn(buildAvatarSpec);
    const render = vi.fn(renderSvg);
    const spyApp = createApp({ packs: [organicBlob], logger: () => {}, build, render });
    const res = await spyApp.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": '"0123456789abcdef"' },
    });
    expect(res.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not render for the json route on a cache hit either", async () => {
    const build = vi.fn(buildAvatarSpec);
    const spyApp = createApp({ packs: [organicBlob], logger: () => {}, build });
    const first = await spyApp.request("/v1/avatar/alice.json");
    const etag = first.headers.get("etag")!;
    const second = await spyApp.request("/v1/avatar/alice.json", {
      headers: { "if-none-match": etag },
    });
    expect(second.status).toBe(304);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
