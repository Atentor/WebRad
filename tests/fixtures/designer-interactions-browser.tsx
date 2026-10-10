import { useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  AddComponentCommand,
  MoveCommand,
  ReorderComponentsCommand,
  ResizeCommand,
  type Command,
  type DesignerViewportName,
} from '@webrad/designer';
import {
  addComponent,
  createPage,
  DEFAULT_PROJECT_SETTINGS,
  type PageModel,
} from '@webrad/project-model';
import { DesignerSurface } from '../../apps/ide/renderer/src/components/DesignerSurface';
import { DesignerController } from '../../apps/ide/renderer/src/state/designer-controller';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';
import '../../apps/ide/renderer/src/panels.css';
import '../../apps/ide/renderer/src/designer-chrome.css';

function fixturePage(): PageModel {
  let page = createPage('DesignerReview', { width: 800, height: 450 });
  for (const [id, type, parentId, x, y] of [
    ['button', 'WebButton', page.rootComponentId, 37, 41],
    ['panel', 'WebPanel', page.rootComponentId, 240, 100],
    ['child', 'WebLabel', 'panel', 24, 24],
  ] as const) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent(type, {
        id,
        name: id,
        parentId,
        x,
        y,
        props: id === 'button' ? { margin: 12 } : {},
      }),
      parentId,
    );
  }
  return page;
}

export function Harness(): ReactElement {
  const [controller] = useState(() => new DesignerController());
  const [page, setPage] = useState(fixturePage);
  const [selectedIds, select] = useState<readonly string[]>([]);
  const [zoom, setZoom] = useState(100);
  const [viewport, setViewport] = useState<DesignerViewportName>('desktop');
  const history = controller.synchronize(page);
  const execute = (command: Command<PageModel>): void => setPage(controller.execute(page, command));
  return (
    <>
      <button
        id="reset"
        onClick={() => {
          controller.clear();
          select([]);
          setPage(fixturePage());
        }}
      >
        Reset
      </button>
      <select
        id="theme"
        aria-label="Review theme"
        onChange={(event) => {
          document.documentElement.dataset.theme = event.currentTarget.value;
        }}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
      <output id="snapshot" hidden>
        {JSON.stringify({
          page,
          selectedIds,
          undoDepth: history.undoDepth,
          redoDepth: history.redoDepth,
        })}
      </output>
      <div style={{ height: 610, width: 1100 }}>
        <DesignerSurface
          page={page}
          settings={{ ...DEFAULT_PROJECT_SETTINGS, snapToGrid: false }}
          selectedIds={selectedIds}
          selectedPaletteType={null}
          zoom={zoom}
          viewportName={viewport}
          onViewportChange={setViewport}
          onSelect={select}
          onAddComponent={(type, point, parentId) =>
            execute(
              new AddComponentCommand(
                defaultComponentRegistry.createComponent(type, {
                  id: `drop-${page.components.length}`,
                  name: `Dropped${page.components.length}`,
                  parentId,
                  x: point.x,
                  y: point.y,
                }),
                { parentId },
              ),
            )
          }
          onMoveComponents={(ids, delta) =>
            execute(new MoveCommand(ids, delta, { snapToGrid: false, constrainToParent: false }))
          }
          onResizeComponent={(id, bounds) => execute(new ResizeCommand(id, bounds))}
          onReorderComponents={(parent, ids, before) =>
            execute(new ReorderComponentsCommand(parent, ids, before))
          }
          onUndo={() => setPage(controller.undo(page))}
          onRedo={() => setPage(controller.redo(page))}
          onCopy={() => controller.copy(page, selectedIds)}
          onPaste={() => setPage(controller.paste(page).page)}
          onDeleteSelection={() => undefined}
          onBringToFront={() => undefined}
          onSendToBack={() => undefined}
          onZoomChange={setZoom}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
