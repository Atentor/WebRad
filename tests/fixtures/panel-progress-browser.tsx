import { createRoot } from 'react-dom/client';
import { useState, type ReactElement } from 'react';
import { ComponentView } from '@webrad/components';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { panelProgressProject } from './panel-progress';
export function Harness(): ReactElement {
  const project = panelProgressProject(false, 50);
  const panel = project.pages[0]!.components.find((node) => node.id === 'panel')!;
  const [value, setValue] = useState(50);
  const [enabled, setEnabled] = useState(true);
  return (
    <>
      <div id="designer-frame" style={{ width: 280, height: 160, margin: 20 }}>
        <ComponentView
          node={{
            ...panel,
            props: { ...panel.props, progressValue: value, progressEnabled: enabled },
          }}
          designTime
          styleClassName={resolveComponentStyleClassName(
            project.styles.find((style) => style.id === panel.styleId),
          )}
        >
          <button
            id="designer-child"
            style={{ position: 'absolute', left: 20, top: 20 }}
            onClick={() => setValue((current) => (current + 25) % 125)}
          >
            Advance
          </button>
        </ComponentView>
      </div>
      <button id="designer-disable" onClick={() => setEnabled((current) => !current)}>
        Toggle progress
      </button>
      <iframe src="/index.html" style={{ width: 850, height: 400, border: 0 }} />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
