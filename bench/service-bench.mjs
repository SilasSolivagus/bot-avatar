import { createRequire } from "node:module";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createApp } from "../apps/service/dist/index.js";

// apps/service is a private app, so neither it nor its dependencies are linked into the
// root node_modules. Resolve the service's own HTTP adapter from its package instead.
const requireService = createRequire(new URL("../apps/service/package.json", import.meta.url));
const { serve } = requireService("@hono/node-server");

const CONCURRENCY = 100;
const REQUESTS = 4000;
const app = createApp({ packs: [organicBlob], logger: () => {} });
const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
await new Promise((resolve) => server.once("listening", resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/v1/avatar/alice.svg?size=128`;

const latencies = [];
let issued = 0;
let badStatus = 0;
async function worker() {
  while (issued < REQUESTS) {
    issued++;
    const started = performance.now();
    const res = await fetch(url);
    await res.arrayBuffer();
    latencies.push(performance.now() - started);
    if (res.status !== 200) badStatus++;
  }
}
await Promise.all([...Array.from({ length: CONCURRENCY }, worker)]);

await new Promise((resolve, reject) => {
  server.close((err) => (err ? reject(err) : resolve()));
  server.closeAllConnections?.();
});

latencies.sort((a, b) => a - b);
const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
console.log(`requests ${latencies.length} concurrency ${CONCURRENCY}`);
console.log(`p50 ${at(50).toFixed(1)}ms p95 ${at(95).toFixed(1)}ms p99 ${at(99).toFixed(1)}ms`);
if (badStatus > 0) {
  console.log(`FAIL ${badStatus} of ${latencies.length} responses were not 200`);
  process.exitCode = 1;
} else {
  console.log(at(95) < 50 ? "PASS p95 < 50ms" : "FAIL p95 >= 50ms");
  if (at(95) >= 50) process.exitCode = 1;
}
