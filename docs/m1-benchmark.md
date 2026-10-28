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

At 100 concurrency p95 is 14.3 ms on the 200 path and 9.2 ms on the 304 path, so the
spec §12 target (p95 < 50 ms at concurrency 100 on the hit path) is met. The spec treats
1,000 concurrency as a deployment-level figure to be reproduced on a dedicated load
generator, not as a local criterion: the 500 and 1000 rows are shared-host context, and
the 1000 row is also **unverified** because the load generator runs on this same machine
and competes with the server for CPU. The 100-concurrency run above is the reproducible
local benchmark.

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

## After the content-addressed tag (M1.5)

M1.5 replaced the string tag (`"<packId>@<packVersion>:<identityHash>:<size>:<state>"`) with
an opaque 16-hex tag over the pack's content hash, the identity hash, `size` and `state`, and
added a startup conformance sweep in front of serving (pack parsing was already at startup).
Re-measured
2026-10-27 on the same host (Apple M4, Mac16,12, macOS 26.2, Node v22.23.4), built at
`e81d038`, with the same bench and probe: 4000 requests per cell,
`GET /v1/avatar/alice.svg?size=128`.

Three runs per cell, except the two supplementary 200 cells at concurrency 500 and 1000,
which got two. Every run's p95 is listed; `range` spans those runs, not the best one.

| concurrency | 304 p95 before, M1 (3 runs) | 304 p95 after, M1.5 (every run) | after range |
| --- | --- | --- | --- |
| 100 | 9.2 ms (8.9–9.2) | 11.7 / 9.6 / 9.4 ms | 9.4–11.7 ms |
| 500 | 35.1 ms (35.1–35.6) | 39.5 / 42.8 / 50.0 ms | 39.5–50.0 ms |
| 1000 | 69.2 ms (64.8–79.0) | 76.6 / 74.9 / 109.0 ms | 74.9–109.0 ms |

**No 304 row improves.** Each row is at or above the M1 record, and the 1000-concurrency
row is both higher and much wider. Two facts say that is the host, not the tag: the
unchanged rendering path slowed by the same factor, and the tag change costs less than a
microsecond.

The rendering path is unchanged — the same `build` and `render` calls with the same
arguments — and it measures slower by about the same factor:

| concurrency | 200 p95 before, M1 | 200 p95 after, M1.5 (every run) | after range |
| --- | --- | --- | --- |
| 100 | 14.3 ms (14.3–14.4) | 16.6 / 18.7 / 17.1 ms | 16.6–18.7 ms |
| 500 | 65.8 ms (64.1–69.7) | 75.3 / 83.4 ms | 75.3–83.4 ms |
| 1000 | 118.3 ms (115.5–118.3) | 144.5 / 152.9 ms | 144.5–152.9 ms |

Throughput fell in step: 304 measured 15,129–16,650 / 16,877–18,188 / 13,433–17,595 req/s
after versus 20,731 / 22,317 / 18,533 before, and 200 measured 8,346–8,449 req/s after
versus 10,374 before, at concurrency 100. The 1-minute load average on this 10-core host
was 4.6–5.8 for the matrix and climbed to 7.4 while this was written. The load generator
runs here too, and the host was not otherwise idle, so the two columns are not a controlled
comparison: four default `pnpm bench` runs (mode 200, concurrency 100) taken right after the
matrix measured p95 17.7 / 19.6 / 42.4 / 49.1 ms. Read each row as one afternoon on a shared
host — reproducible to within a factor of two or three, not to a millisecond.

The tag change is also worth less than a microsecond. In isolation, 200,000 calls each: the
M1 string tag costs 0.37–0.39 µs and the M1.5 tag 0.80 µs, the difference being one extra
SHA-256 over a 40-byte input. That is 0.004% of a 9.4 ms p95.

There is also nothing left on the hit path to remove. The M1 service already returned `304`
before `buildAvatarSpec` and `renderSvg` — the paragraph after the acceptance table says
so, and the code at `6d0d65e` computes the tag and returns before building. M1.5 made the
tag correct (content-addressed, opaque, with `X-Avatar-Pack` informational only) and added a
startup conformance sweep: a pack that breaks on one family or colour now fails at startup
instead of serving the requests that land on that combination. It did not take work off a
path that had none. The plan expected a substantial 304 gain because it assumed the hit path
still rendered; that assumption was already false in M1. The measured relative cost is
unchanged: 304/200 p95 at concurrency 100 is 0.56–0.63 after versus 0.64 before.

The §12 target (p95 < 50 ms at concurrency 100 on the hit path) passes in every run.
Concurrency 500 passes in all three but one run displays exactly 50.0 ms (the bench compares
the unrounded value against 50, so it passed with no margin). Concurrency 1000 is the spec's
deployment-level figure, which the amended §12 does not ask this host to settle; the hit
path is hash-only now, but that figure still cannot be measured on a host that also runs the
load generator.

## Before the render fingerprint

Every number on this page was recorded before the `ETag` included the renderer build
fingerprint. The tag is still one SHA-256 over a short string: the fingerprint adds 16
characters to that string and one `X-Avatar-Build` header to the response, and the 304 path
still returns before building a spec or rendering. No benchmark was re-recorded for this
change, so the tables above are historical measurements of the M1 and M1.5 builds; treat
them as such rather than as a measurement of the current tag.

