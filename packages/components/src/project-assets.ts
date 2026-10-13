import { createContext } from 'react';
import { projectAssetPath, type ProjectAsset } from '@webrad/project-model';

/** Portable assets are projected as data URLs in the IDE; authored paths stay intact. */
export const ProjectAssetsContext = createContext<readonly ProjectAsset[]>([]);

export function resolveProjectImageSource(source: string, assets: readonly ProjectAsset[]): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(source).replace(/^\.\//u, '');
  } catch {
    return source;
  }
  const asset = assets.find((candidate) => projectAssetPath(candidate) === decoded);
  return asset === undefined ? source : `data:${asset.mediaType};base64,${asset.base64}`;
}
