import { useContext, useId, useRef, useState, type ReactElement } from 'react';
import { paletteColorId, paletteColorReference, resolvePaletteColor } from '@webrad/project-model';
import { ProjectColorPaletteContext } from '../project-color-palette';
import { Icon } from './Icon';
import '../color-palette.css';

interface PaletteColorButtonProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (color: string) => void;
}

/** Native popovers stay above scrolling inspectors and modal dialog content. */
export function PaletteColorButton({
  label,
  value,
  disabled,
  onChange,
}: PaletteColorButtonProps): ReactElement | null {
  const colors = useContext(ProjectColorPaletteContext).filter((entry) =>
    /^#[0-9a-fA-F]{6}$/.test(entry.color),
  );
  const popupId = useId();
  const popupRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const linkedId = paletteColorId(value);
  const linkedColor = colors.find((entry) => entry.id === linkedId);
  if (colors.length === 0) return null;

  const close = (): void => {
    popupRef.current?.hidePopover();
    buttonRef.current?.focus();
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="wr-color-palette-trigger"
        disabled={disabled}
        aria-label={`Predefined colors for ${label}`}
        aria-expanded={open}
        aria-controls={popupId}
        data-linked={linkedColor !== undefined}
        title={
          linkedColor === undefined ? 'Choose a project color' : `Linked to ${linkedColor.name}`
        }
        onClick={(event) => {
          event.preventDefault();
          const popup = popupRef.current;
          if (popup === null) return;
          if (open) {
            close();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
          popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 155))}px`;
          popup.showPopover();
          popup.querySelector<HTMLButtonElement>('button')?.focus();
        }}
      >
        <Icon name="palette" />
      </button>
      <span
        ref={popupRef}
        id={popupId}
        popover="auto"
        className="wr-color-palette-popover"
        role="group"
        aria-label={`Project colors for ${label}`}
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
          if (event.key === 'Tab') {
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const index = buttons.findIndex((button) => button === document.activeElement);
            const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            event.preventDefault();
            event.stopPropagation();
            buttons[next]?.focus();
          }
        }}
      >
        <strong>Project colors</strong>
        <span className="wr-color-palette-swatches">
          {colors.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-label={`Use ${entry.color.toUpperCase()} for ${label}`}
              aria-pressed={paletteColorId(value) === entry.id}
              title={`${entry.name} · ${entry.color.toUpperCase()}`}
              style={{ backgroundColor: entry.color }}
              onClick={(event) => {
                event.preventDefault();
                onChange(paletteColorReference(entry.id));
                close();
              }}
            />
          ))}
        </span>
      </span>
    </>
  );
}

interface ColorInputProps extends PaletteColorButtonProps {
  readonly id?: string;
  readonly className?: string;
  readonly showPalette?: boolean;
}

export function ColorInput({
  label,
  value,
  onChange,
  id,
  className,
  disabled,
  showPalette = true,
}: ColorInputProps): ReactElement {
  const colors = useContext(ProjectColorPaletteContext);
  return (
    <span className="wr-color-input">
      <input
        id={id}
        className={className}
        type="color"
        aria-label={label}
        value={resolvePaletteColor(value, colors)}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {showPalette && (
        <PaletteColorButton label={label} value={value} disabled={disabled} onChange={onChange} />
      )}
    </span>
  );
}
