import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createApp, parseIdentity } from "../src/app.js";

const app = createApp({ packs: [organicBlob], logger: () => {} });

describe("health", () => {
  it("reports readiness and the number of packs", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, packs: 1 });
    expect(res.headers.get("content-type")).toContain("application/json");
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

  it("quotes the etag and names the pack and the identity hash", async () => {
    const res = await app.request("/v1/avatar/alice.svg");
    expect(res.headers.get("etag")).toMatch(/^"organic-blob@1\.0\.0:[0-9a-f]{16}:128:idle"$/);
  });

  it("answers 304 with no body when the etag matches", async () => {
    const first = await app.request("/v1/avatar/alice.svg");
    const etag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.svg", { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(second.headers.get("content-type")).toBeNull();
  });

  it("answers 200 when the etag differs", async () => {
    const res = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": '"organic-blob@0.0.0:0000000000000000"' },
    });
    expect(res.status).toBe(200);
  });

  it("gives different identities different etags", async () => {
    const a = await app.request("/v1/avatar/alice.svg");
    const b = await app.request("/v1/avatar/bob.svg");
    expect(a.headers.get("etag")).not.toBe(b.headers.get("etag"));
  });

  it("gives different sizes and states different svg etags", async () => {
    const base = await app.request("/v1/avatar/alice.svg");
    const small = await app.request("/v1/avatar/alice.svg?size=64");
    const working = await app.request("/v1/avatar/alice.svg?state=working");
    expect(small.headers.get("etag")).not.toBe(base.headers.get("etag"));
    expect(working.headers.get("etag")).not.toBe(base.headers.get("etag"));
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
    expect(first.headers.get("etag")).toMatch(/^"organic-blob@1\.0\.0:[0-9a-f]{16}"$/);
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
