import type { ReactElement, ReactNode } from 'react';
import {
  DEFAULT_PROJECT_THEMES,
  type ProjectAsset,
  type ComponentStyleModel,
  type ProjectThemeSettings,
  type ResolvedThemeMode,
} from '@webrad/project-model';
import { ProjectAssetsContext, ProjectStylesContext } from '@webrad/components';
import { ProjectThemeContext } from './project-theme';

export function ProjectVisualResources({
  assets,
  styles = [],
  themes = DEFAULT_PROJECT_THEMES,
  themeMode = 'light',
  children,
}: {
  assets: readonly ProjectAsset[];
  styles?: readonly ComponentStyleModel[];
  themes?: ProjectThemeSettings;
  themeMode?: ResolvedThemeMode;
  children: ReactNode;
}): ReactElement {
  return (
    <ProjectThemeContext.Provider value={{ themes, mode: themeMode }}>
      <ProjectStylesContext.Provider value={styles}>
        <ProjectAssetsContext.Provider value={assets}>{children}</ProjectAssetsContext.Provider>
      </ProjectStylesContext.Provider>
    </ProjectThemeContext.Provider>
  );
}
