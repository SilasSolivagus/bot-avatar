import { Agent, request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createApp } from "../apps/service/dist/index.js";

// apps/service is a private app, so neither it nor its dependencies are linked into the
// root node_modules. Resolve the service's own HTTP adapter from its package instead.
const requireService = createRequire(new URL("../apps/service/package.json", import.meta.url));
const { createAdaptorServer } = requireService("@hono/node-server");

const HELP = `usage: node bench/service-bench.mjs [--concurrency N] [--requests N] [--mode 200|304]

  --concurrency  parallel workers (default 100)
  --requests     total requests (default 4000)
  --mode         200: plain GET; 304: GET with If-None-Match after one probe (default 200)`;

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      concurrency: { type: "string", default: "100" },
      requests: { type: "string", default: "4000" },
      mode: { type: "string", default: "200" },
      help: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}

if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const CONCURRENCY = Number(options.concurrency);
const REQUESTS = Number(options.requests);
const MODE = options.mode;
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1) {
  console.error(`--concurrency must be a positive integer, got ${options.concurrency}`);
  process.exit(2);
}
if (!Number.isInteger(REQUESTS) || REQUESTS < 1) {
  console.error(`--requests must be a positive integer, got ${options.requests}`);
  process.exit(2);
}
if (MODE !== "200" && MODE !== "304") {
  console.error(`--mode must be 200 or 304, got ${options.mode}`);
  process.exit(2);
}

const EXPECTED = MODE === "304" ? 304 : 200;
const PATH = "/v1/avatar/alice.svg?size=128";
const app = createApp({ packs: [organicBlob], logger: () => {} });

// Hold the warm-up connections open until every one is established. A simultaneous burst
// of hundreds of new sockets overflows this host's accept queue (kern.ipc.somaxconn is
// 128 on macOS), which would turn the run into a TCP retransmit measurement.
let releaseWarmup;
const warmupGate = new Promise((resolve) => {
  releaseWarmup = resolve;
});
app.get("/__warmup", async (c) => {
  await warmupGate;
  return c.text("ok");
});

// Listen directly instead of through serve(): the default accept backlog (511 on macOS)
// is capped at 128 anyway, but passing the larger value documents the intent.
const server = createAdaptorServer({ fetch: app.fetch });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", 4096, resolve);
});
const { port } = server.address();

// A dedicated keep-alive pool, sized to the requested concurrency. `fetch` is avoided on
// purpose: this environment sets NODE_USE_ENV_PROXY, and the env-proxy dispatcher does not
// reuse connections the way a localhost load generator needs.
const agent = new Agent({ keepAlive: true, maxSockets: CONCURRENCY, maxFreeSockets: CONCURRENCY });

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path, headers, agent }, (response) => {
      const status = response.statusCode;
      const etag = response.headers.etag;
      response.on("data", () => {});
      response.on("end", () => resolve({ status, etag }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

// Open one pooled connection per worker, staggered a millisecond apart, all held at the gate.
const warmup = Array.from({ length: CONCURRENCY }, (_, index) =>
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, index));
    await get("/__warmup");
  })(),
);
await new Promise((resolve) => setTimeout(resolve, CONCURRENCY + 100));
releaseWarmup();
await Promise.all(warmup);

// The 304 mode needs one full response to learn the current tag; it is not measured.
let ifNoneMatch;
if (MODE === "304") {
  const probe = await get(PATH);
  if (!probe.etag) {
    console.error("FAIL the probe response carried no ETag");
    process.exit(1);
  }
  ifNoneMatch = { "if-none-match": probe.etag };
}

const latencies = [];
let issued = 0;
let badStatus = 0;
let failed = 0;
const wallStarted = performance.now();
async function worker() {
  while (issued < REQUESTS) {
    issued++;
    const started = performance.now();
    try {
      const response = await get(PATH, ifNoneMatch);
      latencies.push(performance.now() - started);
      if (response.status !== EXPECTED) badStatus++;
    } catch {
      failed++;
    }
  }
}
await Promise.all([...Array.from({ length: CONCURRENCY }, worker)]);
const wallMs = performance.now() - wallStarted;

await new Promise((resolve, reject) => {
  agent.destroy();
  server.close((err) => (err ? reject(err) : resolve()));
  server.closeAllConnections?.();
});

latencies.sort((a, b) => a - b);
const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
const rps = (latencies.length / wallMs) * 1000;
const format = (p) => (latencies.length === 0 ? "n/a" : `${at(p).toFixed(1)}ms`);
console.log(`mode ${MODE} requests ${latencies.length} concurrency ${CONCURRENCY}`);
console.log(`p50 ${format(50)} p95 ${format(95)} p99 ${format(99)}`);
console.log(`wall ${(wallMs / 1000).toFixed(2)}s throughput ${rps.toFixed(0)} req/s`);
if (failed > 0 || badStatus > 0) {
  console.log(`FAIL ${failed} requests errored and ${badStatus} of ${latencies.length} responses were not ${EXPECTED}`);
  process.exitCode = 1;
} else {
  console.log(at(95) < 50 ? "PASS p95 < 50ms" : "FAIL p95 >= 50ms");
  if (at(95) >= 50) process.exitCode = 1;
}
