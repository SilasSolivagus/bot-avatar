# M1 service benchmark

Recorded 2026-10-27 on Apple M4 (Mac16,12), macOS 26.2, Node v22.23.4, localhost loopback, no TLS.

Run: `pnpm build && pnpm bench`. The defaults are the documented acceptance run:
4000 requests, concurrency 100, `GET /v1/avatar/alice.svg?size=128` (mode 200). The
bench also takes `--concurrency N`, `--requests N` and `--mode 200|304`. In mode 304 one
probe request learns the current `ETag`, and every measured request sends it back in
`If-None-Match`; a 304 response is a hit, anything else is reported as a miss.

## Acceptance run (100 concurrency)

| mode | p50 | p95 | p99 | throughput |
| --- | --- | --- | --- | --- |
| 200 | 8.8 ms | 14.3 ms | 24.2 ms | 10,374 req/s |
| 304 | 4.1 ms | 9.2 ms | 13.2 ms | 20,731 req/s |

Acceptance is p95 < 50 ms. At the documented settings both modes pass; three consecutive
mode-200 runs gave p95 14.3–14.4 ms and three mode-304 runs gave p95 8.9–9.2 ms. This
100-concurrency run is the reproducible local benchmark.

The service keeps no cache: every 200 response rebuilds the spec and re-renders the SVG,
so the 200 figures measure computation. The 304 path is a conditional revalidation that
returns before `buildAvatarSpec`/`renderSvg`, which is why it is roughly twice as fast.
It is a revalidation hit, not a cache hit: the service still has no cache.

## Scaling (4000 requests per cell, three runs per cell)

The table shows one representative run per cell. The p95 ranges across the three runs
were 14.3–14.4 / 64.1–69.7 / 115.5–118.3 ms for mode 200 and 8.9–9.2 / 35.1–35.6 /
64.8–79.0 ms for mode 304 at concurrency 100 / 500 / 1000.

| concurrency | mode | p50 | p95 | p99 | throughput |
| --- | --- | --- | --- | --- | --- |
| 100 | 200 | 8.8 ms | 14.3 ms | 24.2 ms | 10,374 req/s |
| 500 | 200 | 44.7 ms | 65.8 ms | 67.1 ms | 10,080 req/s |
| 1000 | 200 | 92.2 ms | 118.3 ms | 120.9 ms | 10,398 req/s |
| 100 | 304 | 4.1 ms | 9.2 ms | 13.2 ms | 20,731 req/s |
| 500 | 304 | 20.5 ms | 35.1 ms | 37.6 ms | 22,317 req/s |
| 1000 | 304 | 49.2 ms | 69.2 ms | 72.5 ms | 18,533 req/s |

At 1000 concurrency p95 is 118.3 ms on the 200 path and 69.2 ms on the 304 path, so the
spec §12 target ("1,000 concurrent, p95 < 50 ms (cache-hit path)") is **not met as
measured here**, and it is also **unverified**: the load generator runs on this same
machine and competes with the server for CPU, so this is a shared-host closed-loop run,
not a measurement from an independent generator. A dedicated load generator on a separate
host is required to settle the 1,000-concurrency target; until then the 100-concurrency
run above is the reproducible local benchmark and the 1000-concurrency rows read as a miss.

The bench warms its connection pool before timing. Without that, a simultaneous burst of
hundreds of new sockets overflows this host's accept queue (`kern.ipc.somaxconn` is 128 on
macOS) and the run measures TCP retransmits instead of the service. A custom keep-alive
`node:http` agent is used rather than `fetch` because this environment sets
`NODE_USE_ENV_PROXY`, whose dispatcher does not reuse localhost connections reliably.

## Observed ceiling

Throughput is flat from 100 to 1000 concurrency: about 10,000–10,400 req/s on the 200 path
and 18,500–22,300 req/s on the 304 path. Because throughput does not rise with concurrency,
those are the saturation ceilings on this host; extra concurrency only adds queueing and
moves p95 up. The 200 path is CPU-bound on spec building and SVG rendering, which is why
its ceiling is about half the 304 path's.
