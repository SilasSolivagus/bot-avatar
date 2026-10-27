import type { ShapeFamily } from "@botavatar/engine";

/** The heart body: drawn when the hash lands on it, never handed to a new bot. */
export const HEART_FAMILY = 6;

export const shapes: readonly ShapeFamily[] = [
  {
    smoothingPasses: 2,
    outline: [
      [-43, 22], [-51, 16], [-53, 6], [-49, -4], [-40, -12], [-30, -13], [-27, -24],
      [-18, -34], [-6, -36], [4, -32], [12, -42], [25, -45], [37, -38], [43, -27],
      [42, -17], [51, -11], [56, 0], [54, 12], [46, 20], [30, 24], [0, 25], [-29, 25],
    ],
  },
  {
    smoothingPasses: 2,
    outline: [
      [0, -52], [12, -35], [28, -17], [39, 2], [42, 21], [34, 38], [19, 49],
      [0, 52], [-19, 49], [-34, 38], [-42, 21], [-39, 2], [-28, -17], [-12, -35],
    ],
  },
  {
    smoothingPasses: 2,
    outline: [
      [-42, -23], [-27, -40], [-7, -46], [14, -40], [33, -27], [46, -8], [46, 14],
      [35, 34], [14, 46], [-8, 46], [-29, 38], [-43, 21], [-48, 0],
    ],
  },
  {
    smoothingPasses: 1,
    outline: Array.from({ length: 40 }, (_, index) => {
      const angle = (index / 40) * Math.PI * 2;
      const radius = 44 + Math.cos(angle * 5) * 5;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
    }),
  },
  {
    smoothingPasses: 1,
    outline: Array.from({ length: 36 }, (_, index) => {
      const angle = (index / 36) * Math.PI * 2;
      const radius = 43 + Math.cos(angle * 6) * 7;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
    }),
  },
  {
    smoothingPasses: 1,
    outline: Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      return [
        Math.sign(x) * Math.sqrt(Math.abs(x)) * 46,
        Math.sign(y) * Math.sqrt(Math.abs(y)) * 43,
      ] as const;
    }),
  },
  {
    smoothingPasses: 2,
    reserved: true,
    look: HEART_FAMILY,
    outline: [
      [0, 48], [-14, 36], [-32, 20], [-45, 0], [-43, -20], [-29, -36], [-10, -39],
      [0, -27], [10, -39], [29, -36], [43, -20], [45, 0], [32, 20], [14, 36],
    ],
  },
  {
    smoothingPasses: 2,
    outline: [
      [-48, 35], [-38, 22], [-34, -8], [-27, -31], [-12, -44], [0, -48], [12, -44],
      [27, -31], [34, -8], [38, 22], [48, 35], [26, 42], [0, 44], [-26, 42],
    ],
  },
  {
    smoothingPasses: 2,
    look: 2,
    outline: [
      [-45, -19], [-28, -38], [-4, -46], [22, -41], [42, -25], [49, -2], [42, 23],
      [22, 42], [-4, 47], [-29, 38], [-46, 18], [-50, 0],
    ],
  },
  {
    smoothingPasses: 2,
    outline: [
      [-50, 0], [-45, -20], [-30, -38], [0, -48], [30, -38], [45, -20], [50, 0],
      [35, 10], [18, 12], [16, 38], [0, 46], [-16, 38], [-18, 12], [-35, 10],
    ],
  },
];
