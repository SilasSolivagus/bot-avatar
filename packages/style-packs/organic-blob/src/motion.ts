export const motion = {
  durationMsByFamily: [1800, 1350, 1600, 2400, 2400, 1350, 1100, 1350, 1600, 1350],
  amplitude: 1,
  // One per family, mixing body and eye motion so neighbours differ.
  clipByFamily: [
    "breathe",
    "bob",
    "sway",
    "look-round",
    "breathe",
    "bob",
    "blink",
    "tilt",
    "bounce",
    "shake",
  ],
} as const;
