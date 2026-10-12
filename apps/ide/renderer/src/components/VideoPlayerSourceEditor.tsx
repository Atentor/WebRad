import { useState } from 'react';
import { VideoPlayerSourceSchema } from '@webrad/project-model';

interface Props {
  id: string;
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void;
}
function draft(value: unknown) {
  const parsed = VideoPlayerSourceSchema.safeParse(value);
  const source = parsed.success ? parsed.data : null;
  return {
    kind: source?.kind ?? 'none',
    text: source?.kind === 'restgo' ? source.videoId : (source?.url ?? ''),
    format: source?.kind === 'url' ? source.format : 'hls',
  };
}
export function VideoPlayerSourceEditor({ id, value, disabled, onChange }: Props) {
  const [configuration, setConfiguration] = useState(() => draft(value));
  const candidate =
    configuration.kind === 'none'
      ? null
      : configuration.kind === 'restgo'
        ? { kind: 'restgo', videoId: configuration.text.trim() }
        : { kind: 'url', url: configuration.text.trim(), format: configuration.format };
  const result = VideoPlayerSourceSchema.safeParse(candidate);
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <select
        id={id}
        aria-label="Video source type"
        className="wr-inspector-select"
        disabled={disabled}
        value={configuration.kind}
        onChange={(event) =>
          setConfiguration({ ...configuration, kind: event.target.value, text: '' })
        }
      >
        <option value="none">None (load by code)</option>
        <option value="restgo">RestGo video</option>
        <option value="url">HLS / DASH URL</option>
      </select>
      {configuration.kind !== 'none' && (
        <input
          aria-label={configuration.kind === 'restgo' ? 'RestGo video ID' : 'Manifest URL'}
          className="wr-inspector-input"
          value={configuration.text}
          disabled={disabled}
          placeholder={configuration.kind === 'restgo' ? 'Video ID' : 'https://…/master.m3u8'}
          onChange={(event) => setConfiguration({ ...configuration, text: event.target.value })}
        />
      )}
      {configuration.kind === 'url' && (
        <select
          aria-label="Manifest format"
          className="wr-inspector-select"
          value={configuration.format}
          disabled={disabled}
          onChange={(event) =>
            setConfiguration({ ...configuration, format: event.target.value as 'hls' | 'dash' })
          }
        >
          <option value="hls">HLS</option>
          <option value="dash">DASH</option>
        </select>
      )}
      {!result.success && configuration.text.length > 0 && (
        <span role="status">{result.error.issues[0]?.message}</span>
      )}
      <button
        type="button"
        className="wr-inspector-action"
        disabled={disabled || !result.success}
        onClick={() => {
          if (result.success) onChange(result.data);
        }}
      >
        Apply source
      </button>
    </div>
  );
}
