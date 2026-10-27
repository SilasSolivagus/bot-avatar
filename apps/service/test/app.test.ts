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
