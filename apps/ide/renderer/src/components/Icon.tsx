import { projectIcon } from '@webrad/runtime/icon';
import { createElement, type ReactElement } from 'react';
import { resolveIdeIcon, type IdeIconName } from '../ide-icons';

export type IconName = IdeIconName;

interface IconProps {
  readonly name: IconName;
  readonly className?: string;
}

/** Upstream Lucide artwork for IDE controls, without an icon font or network request. */
export function Icon({ name, className = '' }: IconProps): ReactElement {
  const icon = resolveIdeIcon(name);
  const state = projectIcon({ icon });
  return (
    <svg
      className={`wr-icon${className.length > 0 ? ` ${className}` : ''}`}
      data-lucide-icon={icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={state.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {state.nodes.map(([tag, attributes], index) =>
        createElement(tag, { ...attributes, key: index }),
      )}
    </svg>
  );
}
