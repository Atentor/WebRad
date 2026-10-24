import type {
  ComponentNode,
  ComponentStyleModel,
  ComponentStyleProperties,
  ComponentStyleStateName,
  StyleLengthValue,
} from './types.js';

/**
 * A versioned, project-model-owned description of the visual library that is
 * created with every new project. Keeping the catalogue here makes the same
 * defaults available to project creation, page creation, and design-time
 * component insertion without coupling the model to the IDE registry.
 */
export interface DefaultComponentStyleDefinition {
  readonly name: string;
  readonly componentType: string;
  readonly states: Partial<Readonly<Record<ComponentStyleStateName, ComponentStyleProperties>>>;
}

function px(value: number): StyleLengthValue {
  return { value, unit: 'px' };
}

function gradient(
  direction: 'to-right' | 'to-bottom-right' | 'to-bottom',
  from: string,
  to: string,
): {
  readonly kind: 'linear';
  readonly direction: typeof direction;
  readonly from: string;
  readonly to: string;
} {
  return { kind: 'linear', direction, from, to };
}

const subtleSurface = gradient('to-bottom', '#ffffff', '#f8fafc');
const subtleBorder = gradient('to-bottom-right', '#dbeafe', '#e9d5ff');
const fieldSurface = gradient('to-bottom', '#ffffff', '#f8fbff');
const fieldBorder = gradient('to-bottom-right', '#bfdbfe', '#ddd6fe');

/**
 * The built-in Aurora library. It intentionally uses only structured style
 * values so the library is rendered identically by the designer and runtime.
 */
export const DEFAULT_COMPONENT_STYLE_DEFINITIONS = [
  {
    name: 'Default Page',
    componentType: 'WebPage',
    states: {
      base: {
        backgroundGradient: gradient('to-bottom', '#f8fbff', '#eef2ff'),
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
      },
    },
  },
  {
    name: 'Default Panel',
    componentType: 'WebPanel',
    states: {
      base: {
        fontFamily: 'roboto',
        backgroundGradient: subtleSurface,
        panelProgressColor: '#2563eb',
        panelProgressTrackColor: '#dbeafe',
        panelProgressThickness: 3,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: subtleBorder,
        borderRadius: px(6),
        boxShadow: 'sm',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
    },
  },
  {
    name: 'Default Popup',
    componentType: 'WebPopup',
    states: {
      base: {
        backgroundGradient: subtleSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: subtleBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        boxShadow: 'md',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
    },
  },
  {
    name: 'Default Label',
    componentType: 'WebLabel',
    states: {
      base: {
        textColor: '#334155',
        borderRadius: px(6),
        fontFamily: 'roboto',
        fontSize: px(14),
        fontWeight: 'semibold',
        lineHeight: px(20),
      },
    },
  },
  {
    name: 'Default Edit',
    componentType: 'WebEdit',
    states: {
      base: {
        backgroundGradient: fieldSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        boxShadow: 'sm',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
        boxShadow: 'md',
      },
      disabled: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
        textColor: '#64748b',
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Text Area',
    componentType: 'WebTextArea',
    states: {
      base: {
        backgroundGradient: fieldSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        boxShadow: 'sm',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
        boxShadow: 'md',
      },
      disabled: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
        textColor: '#64748b',
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Button',
    componentType: 'WebButton',
    states: {
      base: {
        backgroundGradient: gradient('to-bottom-right', '#2563eb', '#7c3aed'),
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: gradient('to-bottom-right', '#60a5fa', '#a78bfa'),
        borderRadius: px(6),
        textColor: '#ffffff',
        fontFamily: 'roboto',
        fontWeight: 'semibold',
        buttonContentMode: 'text-icon',
        buttonIconPosition: 'left',
        buttonIconSize: px(16),
        boxShadow: 'sm',
        cursor: 'pointer',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: {
        backgroundGradient: gradient('to-bottom-right', '#3b82f6', '#8b5cf6'),
        borderGradient: gradient('to-bottom-right', '#93c5fd', '#c4b5fd'),
        boxShadow: 'md',
        translateY: px(-1),
      },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
      },
      active: {
        backgroundGradient: gradient('to-bottom-right', '#1d4ed8', '#6d28d9'),
        boxShadow: 'sm',
        translateY: px(0),
      },
      disabled: {
        backgroundColor: '#64748b',
        borderColor: '#64748b',
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Repeating Group',
    componentType: 'WebRepeatingGroup',
    states: {
      base: {
        backgroundColor: '#ffffff',
        borderWidth: px(1),
        borderStyle: 'solid',
        borderColor: '#cbd5e1',
        borderRadius: px(6),
        textColor: '#334155',
        fontFamily: 'roboto',
        fontSize: px(14),
      },
    },
  },
  {
    name: 'Default Data Grid',
    componentType: 'WebDataGrid',
    states: {
      base: {
        backgroundGradient: subtleSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: subtleBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        fontSize: px(14),
        boxShadow: 'sm',
        dataGridHeaderBackgroundColor: '#e0e7ff',
        dataGridHeaderTextColor: '#1e3a8a',
        dataGridHeaderBorderColor: '#c7d2fe',
        dataGridHeaderFontWeight: 'semibold',
        dataGridFooterBackgroundColor: '#f8fafc',
        dataGridFooterTextColor: '#334155',
        dataGridFooterBorderColor: '#dbeafe',
        dataGridFooterFontWeight: 'medium',
        dataGridButtonContentMode: 'text-icon',
        dataGridButtonIconPosition: 'left',
        dataGridButtonIconSize: px(16),
        dataGridButtonIconColor: 'current',
        dataGridButtonBackgroundColor: '#e0e7ff',
        dataGridButtonTextColor: '#1e3a8a',
        dataGridButtonBorderColor: '#c7d2fe',
        dataGridButtonBorderWidth: px(1),
        dataGridButtonBorderStyle: 'solid',
        dataGridButtonBorderRadius: px(6),
        dataGridButtonPaddingX: px(8),
        dataGridButtonPaddingY: px(4),
        dataGridButtonFontWeight: 'semibold',
        dataGridCheckboxAccentColor: '#2563eb',
        dataGridCheckboxSize: px(16),
        dataGridCheckboxTextColor: '#334155',
        dataGridCheckboxFontWeight: 'medium',
        dataGridCheckboxGap: px(6),
        toggleCheckedColor: '#2563eb',
        toggleThumbColor: '#ffffff',
      },
    },
  },
  {
    name: 'Default Check Box',
    componentType: 'WebCheckBox',
    states: {
      base: {
        borderRadius: px(6),
        textColor: '#334155',
        fontFamily: 'roboto',
        fontSize: px(14),
        fontWeight: 'medium',
        cursor: 'pointer',
        transitionProperty: 'colors',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
      },
      disabled: {
        textColor: '#64748b',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Toggle',
    componentType: 'WebToggle',
    states: {
      base: {
        fontFamily: 'roboto',
        backgroundGradient: gradient('to-bottom', '#e2e8f0', '#cbd5e1'),
        toggleCheckedColor: '#2563eb',
        toggleThumbColor: '#ffffff',
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        borderRadius: px(6),
        boxShadow: 'sm',
        cursor: 'pointer',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
      },
      active: { boxShadow: 'none' },
      disabled: {
        toggleCheckedColor: '#94a3b8',
        toggleThumbColor: '#f1f5f9',
        opacity: 60,
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Icons',
    componentType: 'WebIcon',
    states: {
      base: {
        textColor: '#2563eb',
        borderWidth: px(0),
        borderRadius: px(4),
        fontFamily: 'roboto',
      },
      disabled: { opacity: 60, cursor: 'not-allowed' },
    },
  },
  {
    name: 'Default Menu',
    componentType: 'WebMenu',
    states: {
      base: {
        borderWidth: px(0),
        borderRadius: px(16),
        boxShadow: 'none',
        fontFamily: 'roboto',
      },
      disabled: { opacity: 60 },
    },
  },
  {
    name: 'Default ProgressBar',
    componentType: 'WebProgressBar',
    states: {
      base: {
        backgroundGradient: fieldSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        progressColor: '#2563eb',
        progressTrackColor: '#e2e8f0',
        progressThickness: 8,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        fontSize: px(12),
        fontWeight: 'semibold',
      },
      disabled: { progressColor: '#94a3b8', opacity: 60 },
    },
  },
  {
    name: 'Default Combo Box',
    componentType: 'WebComboBox',
    states: {
      base: {
        backgroundGradient: fieldSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        boxShadow: 'sm',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
        boxShadow: 'md',
      },
      disabled: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
        textColor: '#64748b',
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
  {
    name: 'Default Image',
    componentType: 'WebImage',
    states: {
      base: {
        fontFamily: 'roboto',
        backgroundGradient: gradient('to-bottom-right', '#eff6ff', '#f5f3ff'),
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: subtleBorder,
        borderRadius: px(6),
        boxShadow: 'sm',
        objectFit: 'cover',
        objectPosition: 'center',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md', scale: 102 },
    },
  },
  {
    name: 'Default Video Player',
    componentType: 'WebVideoPlayer',
    states: {
      base: {
        backgroundGradient: gradient('to-bottom', '#334155', '#0f172a'),
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: gradient('to-bottom-right', '#60a5fa', '#a78bfa'),
        borderRadius: px(6),
        textColor: '#ffffff',
        fontFamily: 'roboto',
        boxShadow: 'sm',
        objectFit: 'contain',
        objectPosition: 'center',
        transitionProperty: 'shadow',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#60a5fa',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
        boxShadow: 'md',
      },
      disabled: { opacity: 60, boxShadow: 'none' },
    },
  },
  {
    name: 'Default List Box',
    componentType: 'WebListBox',
    states: {
      base: {
        backgroundGradient: fieldSurface,
        borderWidth: px(1),
        borderStyle: 'solid',
        borderGradient: fieldBorder,
        borderRadius: px(6),
        textColor: '#0f172a',
        fontFamily: 'roboto',
        boxShadow: 'sm',
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { boxShadow: 'md' },
      focus: {
        ringWidth: px(2),
        ringColor: '#93c5fd',
        ringOffsetWidth: px(2),
        ringOffsetColor: '#ffffff',
        boxShadow: 'md',
      },
      disabled: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
        textColor: '#64748b',
        boxShadow: 'none',
        cursor: 'not-allowed',
      },
    },
  },
] as const satisfies readonly DefaultComponentStyleDefinition[];

/** A deterministic ID lets a project recreate its seeded library predictably. */
export function defaultComponentStyleId(projectId: string, componentType: string): string {
  return `${projectId}:default-style:${componentType}`;
}

/** Finds the protected default style for a visual component type. */
export function findDefaultComponentStyle(
  styles: readonly ComponentStyleModel[],
  componentType: string,
): ComponentStyleModel | undefined {
  return styles.find(
    (style) => style.componentType === componentType && style.preset === 'default',
  );
}

/** Binds a node to its type's default style unless it already has an explicit style. */
export function applyDefaultComponentStyle(
  component: ComponentNode,
  styles: readonly ComponentStyleModel[],
): ComponentNode {
  if (component.styleId !== undefined) return component;
  const style = findDefaultComponentStyle(styles, component.type);
  return style === undefined ? component : { ...component, styleId: style.id };
}
