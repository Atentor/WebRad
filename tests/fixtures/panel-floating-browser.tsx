import { createRoot } from 'react-dom/client';
import { DesignerSurface } from '../../apps/ide/renderer/src/components/DesignerSurface';
import { panelFloatingProject } from './panel-floating';
const project = panelFloatingProject();
const noop = () => {};
createRoot(document.getElementById('root')!).render(
  <DesignerSurface
    page={project.pages[0]!}
    settings={project.settings}
    selectedIds={['floating-panel']}
    selectedPaletteType={null}
    zoom={100}
    onSelect={noop}
    onAddComponent={noop}
    onMoveComponents={noop}
    onResizeComponent={noop}
    onDeleteSelection={noop}
    onCopy={noop}
    onPaste={noop}
    onUndo={noop}
    onRedo={noop}
    onBringToFront={noop}
    onSendToBack={noop}
    onZoomChange={noop}
    onComponentActivate={noop}
  />,
);
