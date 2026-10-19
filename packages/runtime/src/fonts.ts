/** Font IDs are persisted in style properties and map to font-* utilities. */
export const WEBRAD_FONT_FAMILIES = [
  {
    id: 'roboto',
    label: 'Roboto',
    fallback: 'sans-serif',
    packageName: '@fontsource-variable/roboto',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    fallback: 'sans-serif',
    packageName: '@fontsource-variable/open-sans',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    fallback: 'monospace',
    packageName: '@fontsource-variable/jetbrains-mono',
  },
  {
    id: 'inter',
    label: 'Inter',
    fallback: 'sans-serif',
    packageName: '@fontsource-variable/inter',
  },
  { id: 'lato', label: 'Lato', fallback: 'sans-serif', packageName: '@fontsource/lato' },
  {
    id: 'montserrat',
    label: 'Montserrat',
    fallback: 'sans-serif',
    packageName: '@fontsource-variable/montserrat',
  },
  { id: 'poppins', label: 'Poppins', fallback: 'sans-serif', packageName: '@fontsource/poppins' },
  {
    id: 'nunito',
    label: 'Nunito',
    fallback: 'sans-serif',
    packageName: '@fontsource-variable/nunito',
  },
] as const;
