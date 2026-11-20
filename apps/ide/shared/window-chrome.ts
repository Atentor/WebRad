export const APPLICATION_MENU_LABELS = [
  'File',
  'Edit',
  'Search',
  'View',
  'Project',
  'Run',
  'Tools',
  'Help',
] as const;

export type ApplicationMenuLabel = (typeof APPLICATION_MENU_LABELS)[number];

export interface ApplicationMenuRequest {
  label: ApplicationMenuLabel;
  x: number;
  y: number;
}
