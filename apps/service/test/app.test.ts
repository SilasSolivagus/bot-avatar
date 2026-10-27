import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createApp } from "../src/app.js";

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
