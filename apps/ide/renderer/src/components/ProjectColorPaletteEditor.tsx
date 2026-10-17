import type { ReactElement } from 'react';
import type { ProjectPaletteColor } from '@webrad/project-model';
import { ColorInput } from './ColorInput';
import { Icon } from './Icon';

interface ProjectColorPaletteEditorProps {
  readonly colors: readonly ProjectPaletteColor[];
  readonly onChange: (colors: readonly ProjectPaletteColor[]) => void;
}

export function ProjectColorPaletteEditor({
  colors,
  onChange,
}: ProjectColorPaletteEditorProps): ReactElement {
  const update = (
    index: number,
    patch: Partial<Pick<ProjectPaletteColor, 'color' | 'name'>>,
  ): void => {
    onChange(
      colors.map((current, currentIndex) =>
        currentIndex === index ? { ...current, ...patch } : current,
      ),
    );
  };
  return (
    <div className="wr-project-color-palette-editor">
      <div className="wr-project-color-palette-heading">
        <span>{colors.length} / 10 colors</span>
        <button
          type="button"
          disabled={colors.length >= 10}
          onClick={() =>
            onChange([
              ...colors,
              {
                id: `color-${crypto.randomUUID()}`,
                name: `Color ${colors.length + 1}`,
                color: '#334155',
              },
            ])
          }
        >
          <Icon name="add" /> Add color
        </button>
      </div>
      {colors.length === 0 && <p>Add colors to make them available in every color editor.</p>}
      <div className="wr-project-color-palette-rows">
        {colors.map((entry, index) => (
          <div className="wr-project-color-palette-row" key={entry.id}>
            <span>Color {index + 1}</span>
            <ColorInput
              label={`Palette color ${index + 1}`}
              value={/^#[0-9a-fA-F]{6}$/.test(entry.color) ? entry.color : '#000000'}
              showPalette={false}
              onChange={(color) => update(index, { color })}
            />
            <input
              aria-label={`Palette color ${index + 1} name`}
              type="text"
              maxLength={40}
              value={entry.name}
              onChange={(event) => update(index, { name: event.currentTarget.value })}
            />
            <input
              aria-label={`Palette color ${index + 1} hex`}
              type="text"
              spellCheck={false}
              maxLength={7}
              value={entry.color}
              placeholder="#RRGGBB"
              onChange={(event) => update(index, { color: event.currentTarget.value })}
            />
            <button
              type="button"
              aria-label={`Remove palette color ${index + 1}`}
              onClick={() =>
                onChange(colors.filter((_color, currentIndex) => currentIndex !== index))
              }
            >
              <Icon name="delete" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
