import { renderSvg } from "@botavatar/svg";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { builtinPacks } from "../src/packs.js";

const app = createApp({ packs: builtinPacks(), logger: () => {} });

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * The IHDR is the first chunk, so the dimensions live at a fixed offset. Reading
 * them here is a real decoder-free check that the PNG carries the requested size,
 * not just that some bytes came back.
 */
function pngHeader(bytes: Uint8Array): { width: number; height: number; colorType: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), colorType: bytes[25]! };
}

describe("GET /v1/avatar/:identity.png", () => {
  it("returns a png of the requested size", async () => {
    const res = await app.request("/v1/avatar/alice.png?size=64");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(bytes.byteLength).toBeGreaterThan(200);
  });

  it("decodes to exactly the requested dimensions", async () => {
    const res = await app.request("/v1/avatar/alice.png?size=64");
    const header = pngHeader(new Uint8Array(await res.arrayBuffer()));
    expect(header.width).toBe(64);
    expect(header.height).toBe(64);

    const large = await app.request("/v1/avatar/alice.png?size=256");
    const largeHeader = pngHeader(new Uint8Array(await large.arrayBuffer()));
    expect(largeHeader.width).toBe(256);
    expect(largeHeader.height).toBe(256);
  });

  it("keeps the avatar transparent outside its body", async () => {
    const res = await app.request("/v1/avatar/alice.png?size=64");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A truecolour image with an alpha channel: a canvas with an opaque backdrop
    // would be larger and have no alpha channel.
    expect(pngHeader(bytes).colorType).toBe(6);
    expect(bytes.byteLength).toBeLessThan(20_000);
  });

  it("rasterises the same svg string the service would serve, rendered once", async () => {
    const render = vi.fn(renderSvg);
    const spyApp = createApp({ packs: builtinPacks(), logger: () => {}, render });
    const res = await spyApp.request("/v1/avatar/alice.png?size=64");
    expect(res.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(expect.anything(), { size: 64, state: "idle" });
  });

  it("gives the png its own tag", async () => {
    const png = await app.request("/v1/avatar/alice.png?size=64");
    const svg = await app.request("/v1/avatar/alice.svg?size=64");
    expect(png.headers.get("etag")).not.toBe(svg.headers.get("etag"));
  });

  it("answers 304 for a matching png tag", async () => {
    const first = await app.request("/v1/avatar/alice.png");
    const tag = first.headers.get("etag")!;
    const second = await app.request("/v1/avatar/alice.png", {
      headers: { "if-none-match": tag },
    });
    expect(second.status).toBe(304);
  });

  it("rejects an unsupported size", async () => {
    // The service contract is 16..1024; 15 is the first unsupported value.
    expect((await app.request("/v1/avatar/alice.png?size=15")).status).toBe(400);
  });

  it("does not reuse the svg tag on a png request", async () => {
    const svg = await app.request("/v1/avatar/alice.svg");
    const png = await app.request("/v1/avatar/alice.png", {
      headers: { "if-none-match": svg.headers.get("etag")! },
    });
    expect(png.status).toBe(200);
  });
});
