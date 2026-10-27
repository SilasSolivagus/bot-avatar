/**
 * A pack that cannot be served. Lives in its own module so `conformance.ts` can
 * throw it without importing `packs.ts`, which imports the conformance sweep.
 */
export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}
