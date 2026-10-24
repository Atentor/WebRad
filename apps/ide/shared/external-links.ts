export const EXTERNAL_LINKS = {
  atentor: 'https://atentor.com',
  restgo: 'https://restgo.atentor.com',
  webrad: 'https://webrad.atentor.com',
  documentation: 'https://webrad.atentor.com/docs',
  issues: 'https://github.com/Atentor/WebRad/issues',
} as const;

export type ExternalLinkTarget = keyof typeof EXTERNAL_LINKS;
