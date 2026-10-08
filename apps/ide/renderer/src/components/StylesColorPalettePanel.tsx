import { useState, type ReactElement } from 'react';
import { ProjectColorPaletteEditor } from './ProjectColorPaletteEditor';
import {
  DEFAULT_PROJECT_COLOR_PALETTE,
  ProjectColorPaletteSchema,
  type ProjectPaletteColor,
} from '@webrad/project-model';

interface StylesColorPalettePanelProps {
  readonly colors: readonly ProjectPaletteColor[];
  readonly onSave: (colors: readonly ProjectPaletteColor[]) => void;
  readonly onClose: () => void;
}

export function StylesColorPalettePanel({
  colors,
  onSave,
  onClose,
}: StylesColorPalettePanelProps): ReactElement {
  const [draft, setDraft] = useState(colors);
  const [error, setError] = useState<string | null>(null);
  const save = (): void => {
    const validated = ProjectColorPaletteSchema.safeParse(draft);
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? 'Invalid palette.');
      return;
    }
    try {
      onSave(validated.data);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The palette could not be saved.');
    }
  };
  return (
    <section className="wr-styles-color-palette-panel" aria-label="Project color palette">
      <h2>Color palette</h2>
      <p>
        Define up to 10 colors to use in component properties, styles, gradients, and project
        options. Linked components and styles follow changes to these colors.
      </p>
      <ProjectColorPaletteEditor
        colors={draft}
        onChange={(next) => {
          setDraft(next);
          setError(null);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setDraft(DEFAULT_PROJECT_COLOR_PALETTE);
          setError(null);
        }}
      >
        Restore Aurora
      </button>
      {error !== null && <p role="alert">{error}</p>}
      <div className="wr-styles-color-palette-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={save}>
          Save palette
        </button>
      </div>
    </section>
  );
}
