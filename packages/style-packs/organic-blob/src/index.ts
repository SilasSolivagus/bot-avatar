import type { StylePack } from "@botavatar/engine";
import { eyes } from "./eyes.js";
import { motion } from "./motion.js";
import { palette } from "./palette.js";
import { HEART_FAMILY, shapes } from "./shapes.js";

export { eyes, HEART_FAMILY, motion, palette, shapes };

export const organicBlob: StylePack = {
  id: "organic-blob",
  name: "Organic Blob",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes,
  palette,
  eyes,
  motion,
  assignment: "hash-only",
};
