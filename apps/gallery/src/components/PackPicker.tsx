import type { GalleryPack } from "../packs.js";

export interface PackPickerProps {
  packs: readonly GalleryPack[];
  value: string;
  onChange: (packId: string) => void;
}

export function PackPicker({ packs, value, onChange }: PackPickerProps) {
  return (
    <label className="field">
      <span className="field-label">Style pack</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {packs.map((entry) => (
          <option key={entry.pack.id} value={entry.pack.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}
