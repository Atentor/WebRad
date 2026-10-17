import { createContext } from 'react';
import type { ProjectPaletteColor } from '@webrad/project-model';

/** Project-owned choices, projected into every design-time color editor. */
export const ProjectColorPaletteContext = createContext<readonly ProjectPaletteColor[]>([]);
