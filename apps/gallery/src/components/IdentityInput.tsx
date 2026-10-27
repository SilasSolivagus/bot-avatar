import type { StylePack } from "@botavatar/engine";
import { avatarAssignableLooks, avatarSampleIdentity } from "@botavatar/engine";
import { useMemo, useState } from "react";

/**
 * The first non-reserved family that wears `look`. `avatarSampleIdentity` takes a
 * family index, while the assignable set is made of looks: equivalent families share
 * a look and were collapsed, so the two numbers are not interchangeable.
 */
function familyForLook(pack: StylePack, look: number): number | null {
  for (let family = 0; family < pack.shapes.length; family++) {
    const shape = pack.shapes[family]!;
    if (shape.reserved) continue;
    if ((shape.look ?? family) === look) return family;
  }
  return null;
}

export interface IdentityInputProps {
  pack: StylePack;
  onAdd: (identity: string) => void;
}

export function IdentityInput({ pack, onAdd }: IdentityInputProps) {
  const [value, setValue] = useState("");
  const samples = useMemo(
    () =>
      avatarAssignableLooks(pack.shapes)
        .slice(0, 5)
        .flatMap((look) => {
          const family = familyForLook(pack, look);
          return family === null ? [] : [{ look, identity: avatarSampleIdentity(pack, family) }];
        }),
    [pack],
  );

  return (
    <div className="identity">
      <form
        className="identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          const identity = value.trim();
          if (identity.length === 0) return;
          onAdd(identity);
          setValue("");
        }}
      >
        <label className="field">
          <span className="field-label">Identity</span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder="bot id, name, email…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="action">
          Add
        </button>
      </form>
      <div className="samples" role="group" aria-label="Sample identities">
        <span className="field-label">Samples</span>
        <div className="samples-row">
          {samples.map((sample) => (
            <button
              key={sample.identity}
              type="button"
              className="chip"
              title={`Sample for look #${sample.look}`}
              onClick={() => onAdd(sample.identity)}
            >
              {sample.identity}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
