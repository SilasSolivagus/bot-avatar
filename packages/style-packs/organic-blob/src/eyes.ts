import type { EyeGeometry } from "@botavatar/engine";

export const eyes: EyeGeometry = {
  eyes: [
    { kind: "rect", x: -14, y: -12, width: 7, height: 24, rx: 3.5 },
    { kind: "rect", x: 7, y: -12, width: 7, height: 24, rx: 3.5 },
  ],
  rotation: { modulo: 9, spread: 4 },
};
