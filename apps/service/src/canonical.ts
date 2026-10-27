export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

/** Deterministic JSON: object keys sorted at every depth, arrays in order, unrepresentable values rejected. */
export function canonicalJson(value: unknown): string {
  return write(value, new Set<object>());
}

function write(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalError(`cannot canonicalise ${value}`);
      return JSON.stringify(value);
    case "object": {
      const object = value as object;
      if (seen.has(object)) throw new CanonicalError("cannot canonicalise a circular structure");
      seen.add(object);
      try {
        if (Array.isArray(value)) {
          const entries: string[] = [];
          for (let index = 0; index < value.length; index += 1) {
            entries.push(write(value[index], seen));
          }
          return `[${entries.join(",")}]`;
        }
        const proto = Object.getPrototypeOf(object) as object | null;
        if (proto !== null && proto !== Object.prototype) {
          const name = (proto.constructor as { name?: string } | undefined)?.name;
          throw new CanonicalError(`cannot canonicalise ${name ?? "an object with a non-plain prototype"}`);
        }
        const entries = Object.keys(object as Record<string, unknown>)
          .sort()
          .map((key) => {
            const entry = (object as Record<string, unknown>)[key];
            if (entry === undefined) throw new CanonicalError(`cannot canonicalise undefined at ${key}`);
            return `${JSON.stringify(key)}:${write(entry, seen)}`;
          });
        return `{${entries.join(",")}}`;
      } finally {
        seen.delete(object);
      }
    }
    default:
      throw new CanonicalError(`cannot canonicalise a ${typeof value}`);
  }
}
