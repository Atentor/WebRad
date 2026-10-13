import type { ReactElement, ReactNode } from 'react';
import type { ProjectAsset, ProjectPaletteColor } from '@webrad/project-model';
import { ProjectAssetsContext } from '@webrad/components';
import { ProjectColorPaletteContext } from './project-color-palette';

export function ProjectVisualResources({
  colors,
  assets,
  children,
}: {
  colors: readonly ProjectPaletteColor[];
  assets: readonly ProjectAsset[];
  children: ReactNode;
}): ReactElement {
  return (
    <ProjectColorPaletteContext.Provider value={colors}>
      <ProjectAssetsContext.Provider value={assets}>{children}</ProjectAssetsContext.Provider>
    </ProjectColorPaletteContext.Provider>
  );
}
