import { createContext } from 'react';

export interface SettingsValidationError {
  readonly path: string;
  readonly message: string;
}

export const SettingsValidationContext = createContext<SettingsValidationError | null>(null);
