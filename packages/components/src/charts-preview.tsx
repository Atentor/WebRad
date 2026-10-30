import type { ChartsConfiguration } from '@webrad/project-model';
import { renderChartsSvg, type WebChartSeriesData } from '@webrad/runtime';
import { useEffect, useRef, type ReactElement } from 'react';
import './charts-fonts.css';

interface ChartsPreviewProps {
  readonly configuration: ChartsConfiguration;
  readonly sample?: boolean;
}

/** Illustrative data exists only in this design-time projection. */
export function ChartsPreview({ configuration, sample = true }: ChartsPreviewProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const series =
      configuration.series.length === 0
        ? [{ id: 'sample', name: 'Series 1', color: '#6366f1' }]
        : configuration.series;
    const data: readonly WebChartSeriesData[] = sample
      ? series.map((source, seriesIndex) => ({
          id: source.id,
          name: source.name,
          color: source.color,
          points: ['Jan', 'Feb', 'Mar', 'Apr', 'May'].map((label, index) => ({
            label,
            value: ([28, 46, 35, 62, 49][(index + seriesIndex) % 5] ?? 28) + seriesIndex * 8,
          })),
        }))
      : [];
    const render = (): void => {
      const width = Math.max(180, host.clientWidth || 640);
      const height = Math.max(140, host.clientHeight || 360);
      host.replaceChildren(
        renderChartsSvg(host.ownerDocument, configuration, data, {
          width,
          height,
          interactive: false,
        }),
      );
    };
    render();
    const Observer = host.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer === undefined ? undefined : new Observer(render);
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      host.replaceChildren();
    };
  }, [configuration, sample]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      {sample && (
        <span
          style={{
            position: 'absolute',
            right: 10,
            bottom: 5,
            pointerEvents: 'none',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            opacity: 0.6,
          }}
        >
          SAMPLE DATA
        </span>
      )}
    </div>
  );
}
