import { createContext, useContext } from 'react';
import {
  DEFAULT_PROJECT_THEMES,
  resolveProjectColor,
  type ProjectThemeSettings,
  type ResolvedThemeMode,
} from '@webrad/project-model';
import './themes.css';

export const ProjectThemeContext = createContext<{
  readonly themes: ProjectThemeSettings;
  readonly mode: ResolvedThemeMode;
}>({ themes: DEFAULT_PROJECT_THEMES, mode: 'light' });

export function useProjectColorResolver(): (value: string) => string {
  const { themes, mode } = useContext(ProjectThemeContext);
  return (value) => resolveProjectColor(value, themes, mode);
}
