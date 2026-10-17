import { projectAssetPath, type ProjectAsset } from '@webrad/project-model';
import type { ReactElement } from 'react';

export function ProjectAssetPreview({ asset }: { asset: ProjectAsset }): ReactElement {
  const url = `data:${asset.mediaType};base64,${asset.base64}`;
  return (
    <section className="wr-asset-preview" aria-label="Project asset">
      <h2>{asset.fileName}</h2>
      <p>{asset.mediaType}</p>
      <label>
        Application path
        <input
          readOnly
          aria-label="Asset application path"
          value={projectAssetPath(asset).split('/').map(encodeURIComponent).join('/')}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      {asset.mediaType.startsWith('image/') && <img src={url} alt={asset.fileName} />}
      {asset.mediaType.startsWith('audio/') && <audio controls src={url} />}
      {asset.mediaType.startsWith('video/') && <video controls src={url} />}
      <a href={url} download={asset.fileName}>
        Download asset
      </a>
    </section>
  );
}
