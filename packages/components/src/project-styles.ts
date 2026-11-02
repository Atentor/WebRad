import { createContext } from 'react';
import type { ComponentStyleModel } from '@webrad/project-model';

/** The same style library used by the Inspector, including embedded component bindings. */
export const ProjectStylesContext = createContext<readonly ComponentStyleModel[]>([]);
