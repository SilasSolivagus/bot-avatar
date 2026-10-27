import type { StylePack } from "@botavatar/engine";

/** The id would forge a second log line and break the ETag header if it were accepted. */
const pack: StylePack = {
  id: "evil\r\nX-Injected: yes",
  name: "CRLF",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [{ outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 }],
  palette: [{ id: "crlf", name: "CRLF", light: "#FFD8A8", dark: "#E8590C", eye: "#3B2A1A" }],
  eyes: { eyes: [{ kind: "ellipse", cx: -12, cy: 0, rx: 4, ry: 9 }], rotation: { modulo: 5, spread: 2 } },
  motion: { durationMsByFamily: [1500], amplitude: 1 },
  assignment: "hash-only",
};

export default pack;
