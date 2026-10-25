import type { ReactElement, ReactNode } from 'react';
import {
  DEFAULT_PROJECT_THEMES,
  type ProjectAsset,
  type ProjectThemeSettings,
  type ResolvedThemeMode,
} from '@webrad/project-model';
import { ProjectAssetsContext } from '@webrad/components';
import { ProjectThemeContext } from './project-theme';

export function ProjectVisualResources({
  assets,
  themes = DEFAULT_PROJECT_THEMES,
  themeMode = 'light',
  children,
}: {
  assets: readonly ProjectAsset[];
  themes?: ProjectThemeSettings;
  themeMode?: ResolvedThemeMode;
  children: ReactNode;
}): ReactElement {
  return (
    <ProjectThemeContext.Provider value={{ themes, mode: themeMode }}>
      <ProjectAssetsContext.Provider value={assets}>{children}</ProjectAssetsContext.Provider>
    </ProjectThemeContext.Provider>
  );
}
