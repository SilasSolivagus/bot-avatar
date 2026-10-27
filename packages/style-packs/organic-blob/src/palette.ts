import type { PaletteColor } from "@botavatar/engine";

/**
 * Eye fill is the page background in upstream (`tokens.background`, #141414),
 * one value for every colour. Per-colour eyes are supported by the type but
 * deliberately unused here: changing it would change how every avatar looks.
 */
const EYE = "#141414";

export const palette: readonly PaletteColor[] = [
  { id: "white", name: "Staff White", light: "#FFFFFF", dark: "#CBD5E1", eye: EYE, hex: "#FFFFFF" },
  { id: "violet", name: "Executive Violet", light: "#A97EFE", dark: "#7C3AED", eye: EYE, hex: "#8B5CF6" },
  { id: "green", name: "Emerald", light: "#00C972", dark: "#059669", eye: EYE, hex: "#10B981" },
  { id: "orange", name: "Forge Orange", light: "#FF781C", dark: "#EA580C", eye: EYE, hex: "#F97316" },
  { id: "cyan", name: "Cyber Cyan", light: "#1CC3B0", dark: "#0284C7", eye: EYE, hex: "#06B6D4" },
  { id: "blue", name: "Cobalt Blue", light: "#2A92FE", dark: "#1D4ED8", eye: EYE, hex: "#3B82F6" },
  { id: "yellow", name: "Amber Gold", light: "#FFAF38", dark: "#D97706", eye: EYE, hex: "#EAB308" },
  { id: "brown", name: "Caramel Bronze", light: "#A27952", dark: "#78350F", eye: EYE, hex: "#8D6E63" },
  { id: "red", name: "Crimson Red", light: "#FF3E51", dark: "#BE123C", eye: EYE, hex: "#EF4444" },
  { id: "magenta", name: "Neon Pink", light: "#FF5EB1", dark: "#BE185D", eye: EYE, hex: "#EC4899" },
  { id: "gray", name: "Slate Silver", light: "#94A3B8", dark: "#475569", eye: EYE, hex: "#64748B" },
];
