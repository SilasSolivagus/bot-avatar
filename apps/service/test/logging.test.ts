import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createApp } from "../src/app.js";

function recording(packs = [organicBlob]) {
  const lines: string[] = [];
  const app = createApp({ packs, logger: (line) => lines.push(line) });
  return { app, lines };
}

describe("request logging", () => {
  it("logs method, route, status and duration", async () => {
    const { app, lines } = recording();
    await app.request("/v1/avatar/alice.svg");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/v1\/avatar\/<[0-9a-f]{8}>\.svg 200 \d+ms$/);
  });

  it("never writes the identity itself", async () => {
    const { app, lines } = recording();
    await app.request("/v1/avatar/alice%40example.com.svg");
    expect(lines).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("alice");
    expect(lines.join("\n")).not.toContain("example.com");
  });

  it("logs the pack id and the route for other endpoints", async () => {
    const { app, lines } = recording();
    await app.request("/health");
    await app.request("/v1/packs");
    expect(lines[0]).toMatch(/^GET \/health 200 \d+ms$/);
    expect(lines[1]).toMatch(/^GET \/v1\/packs 200 \d+ms$/);
  });

  it("logs one line for a 404 and for a 503", async () => {
    const { app, lines } = recording();
    await app.request("/nope");
    expect(lines).toEqual([expect.stringMatching(/^GET \/nope 404 \d+ms$/)]);

    const empty = recording([]);
    await empty.app.request("/v1/avatar/alice.svg");
    expect(empty.lines).toEqual([expect.stringMatching(/^GET \/v1\/avatar\/<[0-9a-f]{8}>\.svg 503 \d+ms$/)]);
  });

  it("logs a 304 without touching the body", async () => {
    const { app, lines } = recording();
    const first = await app.request("/v1/avatar/alice.svg");
    const etag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.svg", {
      headers: { "if-none-match": etag },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^GET \/v1\/avatar\/<[0-9a-f]{8}>\.svg 304 \d+ms$/);
  });

  it("does not leak an identity from an avatar path that does not parse", async () => {
    const { app, lines } = recording();
    const res = await app.request("/v1/avatar/alice%40example.com");
    expect(res.status).toBe(404);
    expect(lines).toEqual([expect.stringMatching(/^GET \/v1\/avatar\/\* 404 \d+ms$/)]);
  });
});
