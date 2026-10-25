import { useContext, useId, useRef, useState, type ReactElement } from 'react';
import {
  paletteColorId,
  customThemeColorId,
  customThemeColorReference,
  themeColorId,
  themeColorReference,
  THEME_COLOR_NAMES,
  resolveProjectColor,
} from '@webrad/project-model';
import { ProjectThemeContext, useProjectColorResolver } from '../project-theme';
import { Icon } from './Icon';
import '../theme-colors.css';

interface ThemeColorButtonProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly includeRoles?: boolean;
  readonly onChange: (color: string) => void;
}

/** Native popovers stay above scrolling inspectors and modal dialog content. */
export function ThemeColorButton({
  label,
  value,
  disabled,
  includeRoles = true,
  onChange,
}: ThemeColorButtonProps): ReactElement | null {
  const { themes, mode } = useContext(ProjectThemeContext);
  const customId = customThemeColorId(value) ?? paletteColorId(value);
  const role = themeColorId(value);
  const colors = [
    ...(includeRoles
      ? THEME_COLOR_NAMES.map((name) => ({
          id: `role:${name}`,
          name,
          reference: themeColorReference(name),
          selected: role === name,
        }))
      : []),
    ...themes.customColors.map((entry) => ({
      id: `custom:${entry.id}`,
      name: entry.name,
      reference: customThemeColorReference(entry.id),
      selected: customId === entry.id,
    })),
  ];
  const popupId = useId();
  const popupRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const linked = colors.find((entry) => entry.selected);
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
        className="wr-theme-color-trigger"
        disabled={disabled}
        aria-label={`Predefined colors for ${label}`}
        aria-expanded={open}
        aria-controls={popupId}
        data-linked={linked !== undefined}
        title={linked === undefined ? 'Choose a theme color' : `Linked to theme ${linked.name}`}
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
          popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - Math.min(460, window.innerHeight * 0.6)))}px`;
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
        className="wr-theme-color-popover"
        role="group"
        aria-label={`Theme colors for ${label}`}
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
        <strong>Theme colors · {mode === 'dark' ? 'Dark' : 'Light'}</strong>
        <span className="wr-color-theme-swatches">
          {colors.map((entry) => (
            <button
              type="button"
              key={entry.id}
              aria-label={`Use theme ${entry.name} for ${label}`}
              aria-pressed={entry.selected}
              title={entry.name}
              onClick={(event) => {
                event.preventDefault();
                onChange(entry.reference);
                close();
              }}
            >
              <span
                style={{ backgroundColor: resolveProjectColor(entry.reference, themes, mode) }}
              />
              {entry.name}
            </button>
          ))}
        </span>
      </span>
    </>
  );
}

interface ColorInputProps extends ThemeColorButtonProps {
  readonly id?: string;
  readonly className?: string;
  readonly showThemeColors?: boolean;
}

export function ColorInput({
  label,
  value,
  onChange,
  id,
  className,
  disabled,
  showThemeColors = true,
  includeRoles = true,
}: ColorInputProps): ReactElement {
  const resolveColor = useProjectColorResolver();
  const resolved = resolveColor(value);
  return (
    <span className="wr-color-input">
      <input
        id={id}
        className={className}
        type="color"
        aria-label={label}
        value={/^#[a-f0-9]{6}$/iu.test(resolved) ? resolved : '#000000'}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {showThemeColors && (
        <ThemeColorButton
          label={label}
          value={value}
          disabled={disabled}
          onChange={onChange}
          includeRoles={includeRoles}
        />
      )}
    </span>
  );
}
