import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main, parseArgs } from "../src/args.js";
import { PackError } from "../src/packs.js";

const clay = fileURLToPath(new URL("./fixtures/clay-pack.ts", import.meta.url));
const missing = fileURLToPath(new URL("./fixtures/does-not-exist.ts", import.meta.url));

describe("parseArgs", () => {
  it("defaults to port 8787 on loopback with no extra packs", () => {
    expect(parseArgs([])).toEqual({ port: 8787, host: "127.0.0.1", packs: [] });
  });

  it("reads --port, --host and repeated --pack", () => {
    expect(parseArgs(["--port", "9000", "--host", "0.0.0.0", "--pack", "./a.ts", "--pack", "./b.js"])).toEqual({
      port: 9000,
      host: "0.0.0.0",
      packs: ["./a.ts", "./b.js"],
    });
  });

  it("rejects a non-numeric port", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow(/port/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/--nope/);
  });
});

describe("main startup validation", () => {
  it("rejects a duplicate pack id before serving", async () => {
    await expect(main(["--pack", clay, "--pack", clay])).rejects.toThrow(PackError);
    await expect(main(["--pack", clay, "--pack", clay])).rejects.toThrow(/duplicate pack id: clay/);
  });

  it("rejects a pack file that cannot be loaded", async () => {
    await expect(main(["--pack", missing])).rejects.toThrow(PackError);
    await expect(main(["--pack", missing])).rejects.toThrow(/does-not-exist\.ts/);
  });
});
