import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { parseProject, type ComponentNode } from '@webrad/project-model';
import type { WebReportTemplate } from '@webrad/runtime/report-template';
import { ReportBuilderDialog } from '../../apps/ide/renderer/src/components/ReportBuilderDialog';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';

declare global {
  interface Window {
    reportEditorReview: {
      readonly open: (theme: 'light' | 'dark') => void;
      readonly snapshot: () => WebReportTemplate;
      readonly saveCount: () => number;
    };
  }
}

export function Harness({
  initial,
  components,
}: {
  readonly initial: ComponentNode;
  readonly components: readonly ComponentNode[];
}) {
  const [component, setComponent] = useState(initial);
  const [open, setOpen] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [saves, setSaves] = useState(0);
  useEffect(() => {
    window.reportEditorReview = {
      open: (theme) => {
        document.documentElement.dataset.theme = theme;
        flushSync(() => {
          setGeneration((value) => value + 1);
          setOpen(true);
        });
      },
      snapshot: () => component.props.reportTemplate as WebReportTemplate,
      saveCount: () => saves,
    };
    document.body.dataset.ready = 'true';
  }, [component, saves]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open Report Builder
      </button>
      {open && (
        <ReportBuilderDialog
          key={generation}
          component={component}
          availableComponents={components}
          onClose={() => setOpen(false)}
          onSave={(reportTemplate) => {
            setComponent({ ...component, props: { ...component.props, reportTemplate } });
            setSaves((value) => value + 1);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

void fetch('/project')
  .then((response) => response.json())
  .then((value: unknown) => {
    const project = parseProject(value);
    const components = project.pages[0]!.components;
    const component = components.find((item) => item.type === 'WebReportBuilder')!;
    createRoot(document.querySelector('#root')!).render(
      <Harness initial={component} components={components} />,
    );
  })
  .catch((error: unknown) => {
    document.body.dataset.error = error instanceof Error ? error.stack : String(error);
  });
