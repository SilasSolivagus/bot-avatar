# M1 service benchmark

Recorded 2026-10-27 on Apple M4 (Mac16,12), macOS 26.2, Node v22.23.4, localhost loopback, no TLS.

Run: `pnpm build && pnpm bench` (4000 requests, concurrency 100, `GET /v1/avatar/alice.svg?size=128`).

| p50 | p95 | p99 |
| --- | --- | --- |
| 9.1 ms | 13.0 ms | 218.2 ms |

Acceptance is p95 < 50 ms. The service keeps no cache: every request rebuilds the
spec and re-renders the SVG, so these numbers measure computation, not storage.

The numbers above are the acceptance run; four consecutive runs gave p50
8.6–9.1 ms, p95 12.5–13.0 ms and p99 214.5–218.2 ms. The median and p95 are
steady. The p99 tail comes from a small set of slow requests spread through the
run, not only from the opening connections; it is reported as measured, and p95 —
the acceptance figure — is the stable one.
