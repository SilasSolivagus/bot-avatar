import type { StylePack } from "@botavatar/engine";
import { Hono } from "hono";

export type Logger = (line: string) => void;

export interface AppOptions {
  packs: readonly StylePack[];
  logger?: Logger;
}

export function createApp({ packs, logger = () => {} }: AppOptions): Hono {
  const app = new Hono();
  const byId = new Map(packs.map((pack) => [pack.id, pack]));

  app.get("/health", (c) => c.json({ ok: true, packs: byId.size }));

  app.get("/v1/packs", (c) =>
    c.json({
      packs: packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        familyCount: pack.shapes.length,
      })),
    }),
  );

  return app;
}
