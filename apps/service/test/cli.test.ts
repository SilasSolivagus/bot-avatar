import { execFile } from "node:child_process";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { main, parseArgs } from "../src/args.js";
import { PackError } from "../src/packs.js";

const execFileAsync = promisify(execFile);
const clay = fileURLToPath(new URL("./fixtures/clay-pack.ts", import.meta.url));
const missing = fileURLToPath(new URL("./fixtures/does-not-exist.ts", import.meta.url));
const crlf = fileURLToPath(new URL("./fixtures/crlf-pack.ts", import.meta.url));
const typed = fileURLToPath(new URL("./fixtures/typed-pack.ts", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

/** Runs the built CLI; a non-zero exit is reported as data rather than thrown. */
async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args], {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 20_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

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

  it("rejects a CRLF id before serving", async () => {
    await expect(main(["--pack", crlf])).rejects.toThrow(PackError);
    await expect(main(["--pack", crlf])).rejects.toThrow(/crlf-pack\.ts/);
    await expect(main(["--pack", crlf])).rejects.toThrow(/id/);
  });

  it("rejects a string eye coordinate at startup, naming the exact field", async () => {
    await expect(main(["--pack", typed])).rejects.toThrow(PackError);
    await expect(main(["--pack", typed])).rejects.toThrow(/typed-pack\.ts/);
    await expect(main(["--pack", typed])).rejects.toThrow(/eyes\.eyes\[0\]\.x/);
  });
});

describe("built CLI", () => {
  it("exits non-zero for a CRLF-id pack without a stack trace", async () => {
    const { code, stderr } = await runCli(["--pack", crlf]);
    expect(code).toBe(1);
    expect(stderr).toContain("crlf-pack.ts");
    expect(stderr).toContain("id");
    expect(stderr).not.toMatch(/\n\s+at /);
  });

  it("exits non-zero for a type-broken pack and names the eye field", async () => {
    const { code, stderr } = await runCli(["--pack", typed]);
    expect(code).toBe(1);
    expect(stderr).toContain("typed-pack.ts");
    expect(stderr).toContain("eyes.eyes[0].x");
    expect(stderr).not.toMatch(/\n\s+at /);
  });

  it("prints one clean line naming the port when the port is already in use", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    const port = (blocker.address() as AddressInfo).port;
    try {
      const { code, stderr } = await runCli(["--port", String(port)]);
      expect(code).toBe(1);
      const lines = stderr.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`127.0.0.1:${port}`);
      expect(lines[0]).toContain("address already in use");
      expect(stderr).not.toContain("EADDRINUSE");
      expect(stderr).not.toMatch(/\n\s+at /);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
