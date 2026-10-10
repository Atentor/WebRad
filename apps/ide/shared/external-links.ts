export const EXTERNAL_LINKS = {
  atentor: 'https://atentor.com',
  restgo: 'https://restgo.atentor.com',
  webrad: 'https://webrad.atentor.com',
} as const;

export type ExternalLinkTarget = keyof typeof EXTERNAL_LINKS;
