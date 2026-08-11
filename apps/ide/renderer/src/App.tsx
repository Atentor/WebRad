import {
  AddComponentCommand,
  BringToFrontCommand,
  MoveCommand,
  RemoveComponentCommand,
  ResizeCommand,
  SelectionManager,
  SendToBackCommand,
  snapPoint,
} from '@webrad/designer';
import {
  componentRegistry,
  requireComponentDefinition,
  type ComponentPropertyDefinition,
} from '@webrad/component-registry';
import {
  createForm,
  getComponent,
  type Bounds,
  type ComponentNode,
  type FormModel,
} from '@webrad/project-model';
import {
  createUserFormSource,
  ensureEventHandler,
  eventHandlerName,
  generateFormSource,
  generateRuntimeTypings,
} from '@webrad/language';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { IdeCommand, ProjectSession } from '../../shared/contracts';
import { BottomPanel, type OutputEntry } from './components/BottomPanel';
import { CodeEditor } from './components/CodeEditor';
import { DesignerSurface } from './components/DesignerSurface';
import { EditorWorkspace, type DocumentTab, type ViewMode } from './components/EditorWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IdeShell } from './components/IdeShell';
import { ObjectInspector } from './components/ObjectInspector';
import { PreviewPane } from './components/PreviewPane';
import { ProjectExplorer } from './components/ProjectExplorer';
import { StatusBar } from './components/StatusBar';
import { ToolPalette } from './components/ToolPalette';
import { Toolbar } from './components/Toolbar';
import { DesignerController } from './state/designer-controller';
import { ProjectController } from './state/project-controller';

function sourceKey(form: FormModel): string {
  return `forms/${form.name}.ts`;
}

function sourceUri(rootPath: string | null, projectId: string, relativePath: string): string {
  if (!rootPath) return `inmemory://webrad/${projectId}/${relativePath}`;
  const portableRoot = rootPath.replaceAll('\\', '/');
  const base = portableRoot.endsWith('/') ? portableRoot.slice(0, -1) : portableRoot;
  const encoded = encodeURI(`${base}/${relativePath}`)
    .replaceAll('#', '%23')
    .replaceAll('?', '%3F');
  if (encoded.startsWith('//')) return `file:${encoded}`;
  return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function selectionNodes(form: FormModel | null, ids: readonly string[]): readonly ComponentNode[] {
  if (!form) return [];
  const idSet = new Set(ids);
  return form.components.filter((component) => idSet.has(component.id));
}

function isTextEditingElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function executeTextEditingCommand(command: IdeCommand): void {
  const commandNames: Partial<Record<IdeCommand, string>> = {
    'edit.undo': 'undo',
    'edit.redo': 'redo',
    'edit.cut': 'cut',
    'edit.copy': 'copy',
    'edit.paste': 'paste',
    'edit.delete': 'delete',
  };
  const commandName = commandNames[command];
  if (commandName !== undefined) document.execCommand(commandName);
}

export function App(): ReactElement {
  const projectController = useMemo(() => new ProjectController(window.webrad), []);
  const designerController = useMemo(() => new DesignerController(), []);
  const selectionManager = useMemo(() => new SelectionManager(), []);
  const projectState = useSyncExternalStore(
    projectController.subscribe,
    projectController.getSnapshot,
    projectController.getSnapshot,
  );
  const [selection, setSelection] = useState(() => selectionManager.snapshot());
  const [openFormIds, setOpenFormIds] = useState<readonly string[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>('design');
  const [selectedPaletteType, setSelectedPaletteType] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [output, setOutput] = useState<readonly OutputEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<
    Awaited<ReturnType<typeof window.webrad.build.run>>['diagnostics']
  >([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [navigateTo, setNavigateTo] = useState<{ line: number; column?: number } | null>(null);
  const [visiblePanels, setVisiblePanels] = useState({
    explorer: true,
    palette: true,
    inspector: true,
    output: true,
  });
  const project = projectState.project;
  const activeForm =
    project?.forms.find((form) => form.id === activeFormId) ?? project?.forms[0] ?? null;
  const selectedComponents = useMemo(
    () => selectionNodes(activeForm, selection.ids),
    [activeForm, selection.ids],
  );
  const primaryComponent =
    activeForm && selection.primaryId
      ? (activeForm.components.find((component) => component.id === selection.primaryId) ?? null)
      : null;

  const addOutput = useCallback((category: string, message: string): void => {
    setOutput((current) => [
      ...current.slice(-499),
      {
        id: globalThis.crypto.randomUUID(),
        category,
        message,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const reportError = useCallback(
    (error: unknown, category = 'IDE'): void => {
      const normalized = asError(error);
      addOutput(category, normalized.message);
      setDiagnostics([{ category: 'error', message: normalized.message }]);
    },
    [addOutput],
  );

  const activateProjectSession = useCallback(
    (session: ProjectSession): void => {
      const initialFormId = session.project.entryForm || session.project.forms[0]?.id || null;
      setOpenFormIds(initialFormId ? [initialFormId] : []);
      setActiveFormId(initialFormId);
      setActiveView('design');
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
      setDiagnostics([]);
      addOutput('PROJECT', `Opened ${session.project.name}.`);
    },
    [addOutput, designerController, selectionManager],
  );

  useEffect(() => selectionManager.subscribe(setSelection), [selectionManager]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    selectionManager.retain(new Set(activeForm?.components.map((component) => component.id) ?? []));
  }, [activeForm, selectionManager]);

  useEffect(() => {
    const handleBoundaryError = (event: Event): void => {
      const detail = (event as CustomEvent<{ category?: string; message?: string }>).detail;
      if (detail?.message) addOutput(detail.category ?? 'IDE', detail.message);
    };
    window.addEventListener('webrad:error', handleBoundaryError);
    return () => window.removeEventListener('webrad:error', handleBoundaryError);
  }, [addOutput]);

  const openForm = useCallback(
    (formId: string): void => {
      if (!project?.forms.some((form) => form.id === formId)) return;
      setOpenFormIds((current) => (current.includes(formId) ? current : [...current, formId]));
      setActiveFormId(formId);
      selectionManager.clear();
    },
    [project, selectionManager],
  );

  const updateActiveForm = useCallback(
    (nextForm: FormModel): void => {
      if (!activeForm) return;
      projectController.updateForm(activeForm.id, () => nextForm);
    },
    [activeForm, projectController],
  );

  const commitDesignerCommand = useCallback(
    (command: Parameters<DesignerController['execute']>[1]): FormModel | null => {
      if (!activeForm) return null;
      const next = designerController.execute(activeForm, command);
      updateActiveForm(next);
      return next;
    },
    [activeForm, designerController, updateActiveForm],
  );

  const addComponentAt = useCallback(
    (type: string, point: { x: number; y: number }, requestedParentId: string): void => {
      if (!activeForm) return;
      try {
        const definition = requireComponentDefinition(type);
        const parentId = definition.visual ? requestedParentId : activeForm.rootComponentId;
        const parent = getComponent(activeForm, parentId);
        const snapped = project?.settings.snapToGrid
          ? snapPoint(point, project.settings.gridSize)
          : point;
        const x = definition.visual
          ? Math.max(0, Math.min(snapped.x, parent.bounds.width - definition.defaultBounds.width))
          : 0;
        const y = definition.visual
          ? Math.max(0, Math.min(snapped.y, parent.bounds.height - definition.defaultBounds.height))
          : 0;
        const node = componentRegistry.createComponent(type, {
          existingNames: activeForm.components,
          parentId,
          x,
          y,
        }) as ComponentNode;
        commitDesignerCommand(new AddComponentCommand(node, { parentId }));
        setSelectedPaletteType(null);
        selectionManager.selectSingle(node.id);
        addOutput('DESIGNER', `Added ${node.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activeForm, addOutput, commitDesignerCommand, project, reportError, selectionManager],
  );

  const moveComponents = useCallback(
    (ids: readonly string[], delta: { x: number; y: number }): void => {
      if (!activeForm) return;
      try {
        const selected = new Set(ids);
        const topLevelIds = ids.filter((id) => {
          let parentId = getComponent(activeForm, id).parentId;
          while (parentId !== null) {
            if (selected.has(parentId)) return false;
            parentId = getComponent(activeForm, parentId).parentId;
          }
          return true;
        });
        const groups = new Map<string, string[]>();
        for (const id of topLevelIds) {
          if (id === activeForm.rootComponentId) continue;
          const component = getComponent(activeForm, id);
          if (!component.parentId) continue;
          groups.set(component.parentId, [...(groups.get(component.parentId) ?? []), id]);
        }
        const commands = [...groups.values()].map(
          (group) => new MoveCommand(group, delta, { snapToGrid: false, constrainToParent: true }),
        );
        if (commands.length === 0) return;
        const next = designerController.executeMany(activeForm, 'Move selection', commands);
        updateActiveForm(next);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activeForm, designerController, reportError, updateActiveForm],
  );

  const resizeComponent = useCallback(
    (id: string, bounds: Bounds): void => {
      try {
        commitDesignerCommand(new ResizeCommand(id, bounds));
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [commitDesignerCommand, reportError],
  );

  const deleteSelection = useCallback((): void => {
    if (!activeForm) return;
    const ids = selection.ids.filter((id) => id !== activeForm.rootComponentId);
    if (ids.length === 0) return;
    try {
      commitDesignerCommand(new RemoveComponentCommand(ids));
      selectionManager.clear();
      addOutput('DESIGNER', `Deleted ${ids.length} component${ids.length === 1 ? '' : 's'}.`);
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [activeForm, addOutput, commitDesignerCommand, reportError, selection.ids, selectionManager]);

  const copySelection = useCallback((): void => {
    if (!activeForm) return;
    const ids = selection.ids.filter((id) => id !== activeForm.rootComponentId);
    if (ids.length === 0) return;
    try {
      designerController.copy(activeForm, ids);
      addOutput('DESIGNER', `Copied ${ids.length} component${ids.length === 1 ? '' : 's'}.`);
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [activeForm, addOutput, designerController, reportError, selection.ids]);

  const pasteSelection = useCallback((): void => {
    if (!activeForm || !project) return;
    try {
      const primary = selection.primaryId ? getComponent(activeForm, selection.primaryId) : null;
      const parentId =
        primary && componentRegistry.get(primary.type)?.canHaveChildren
          ? primary.id
          : (primary?.parentId ?? activeForm.rootComponentId);
      const result = designerController.paste(
        activeForm,
        parentId,
        project.settings.gridSize,
        project.settings.snapToGrid,
      );
      if (result.form !== activeForm) {
        updateActiveForm(result.form);
        selectionManager.set(result.selectedIds);
      }
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [
    activeForm,
    designerController,
    project,
    reportError,
    selection.primaryId,
    selectionManager,
    updateActiveForm,
  ]);

  const undo = useCallback((): void => {
    if (!activeForm || !designerController.canUndo(activeForm)) return;
    const next = designerController.undo(activeForm);
    updateActiveForm(next);
    selectionManager.retain(new Set(next.components.map((component) => component.id)));
  }, [activeForm, designerController, selectionManager, updateActiveForm]);

  const redo = useCallback((): void => {
    if (!activeForm || !designerController.canRedo(activeForm)) return;
    const next = designerController.redo(activeForm);
    updateActiveForm(next);
  }, [activeForm, designerController, updateActiveForm]);

  const changeZOrder = useCallback(
    (direction: 'front' | 'back'): void => {
      if (!activeForm) return;
      const ids = selection.ids.filter((id) => {
        if (id === activeForm.rootComponentId) return false;
        const component = activeForm.components.find((candidate) => candidate.id === id);
        return component !== undefined && componentRegistry.get(component.type)?.visual === true;
      });
      if (ids.length === 0) return;
      try {
        commitDesignerCommand(
          direction === 'front' ? new BringToFrontCommand(ids) : new SendToBackCommand(ids),
        );
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activeForm, commitDesignerCommand, reportError, selection.ids],
  );

  const changeProperty = useCallback(
    (_name: string, value: unknown, definition: ComponentPropertyDefinition): void => {
      if (!activeForm || selectedComponents.length === 0) return;
      try {
        if (
          selectedComponents.length === 1 &&
          selectedComponents[0]?.id === activeForm.rootComponentId &&
          definition.source === 'node' &&
          definition.name === 'name' &&
          typeof value === 'string'
        ) {
          projectController.renameForm(activeForm.id, value);
          return;
        }
        updateActiveForm(
          designerController.changeProperty(activeForm, selectedComponents, definition, value),
        );
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activeForm,
      designerController,
      projectController,
      reportError,
      selectedComponents,
      updateActiveForm,
    ],
  );

  const bindEvent = useCallback(
    (eventName: string, handlerName: string | null): void => {
      if (!activeForm || !selection.primaryId) return;
      try {
        updateActiveForm(
          designerController.bindEvent(activeForm, selection.primaryId, eventName, handlerName),
        );
      } catch (error) {
        reportError(error, 'LANGUAGE');
      }
    },
    [activeForm, designerController, reportError, selection.primaryId, updateActiveForm],
  );

  const createOrOpenEvent = useCallback(
    (componentId: string, eventName: string): void => {
      if (!activeForm) return;
      try {
        const component = getComponent(activeForm, componentId);
        const handlerName =
          component.events[eventName] ?? eventHandlerName(component.name, eventName);
        const key = sourceKey(activeForm);
        const currentSource = projectState.userSources[key] ?? createUserFormSource(activeForm);
        const edit = ensureEventHandler(currentSource, {
          className: activeForm.name,
          componentName: component.name,
          componentType: component.type,
          eventName,
          handlerName,
          fileName: key,
        });
        const nextForm = designerController.bindEvent(
          activeForm,
          component.id,
          eventName,
          handlerName,
        );
        updateActiveForm(nextForm);
        if (edit.changed) projectController.setUserSource(key, edit.sourceText);
        setOpenFormIds((current) =>
          current.includes(activeForm.id) ? current : [...current, activeForm.id],
        );
        setActiveFormId(activeForm.id);
        setActiveView('code');
        setNavigateTo({ line: edit.location.line, column: edit.location.column });
        addOutput(
          'LANGUAGE',
          edit.changed ? `Created ${handlerName}.` : `Opened existing ${handlerName}.`,
        );
      } catch (error) {
        reportError(error, 'LANGUAGE');
      }
    },
    [
      activeForm,
      addOutput,
      designerController,
      projectController,
      projectState.userSources,
      reportError,
      updateActiveForm,
    ],
  );

  const createDefaultEvent = useCallback(
    (componentId: string): void => {
      if (!activeForm) return;
      const component = getComponent(activeForm, componentId);
      const eventName = componentRegistry.get(component.type)?.defaultEvent;
      if (eventName) createOrOpenEvent(componentId, eventName);
    },
    [activeForm, createOrOpenEvent],
  );

  const prepareToReplaceProject = useCallback(async (): Promise<boolean> => {
    if (!projectState.dirty) return true;
    if (window.confirm('Save unsaved changes before continuing?')) {
      await projectController.save();
      return true;
    }
    return window.confirm('Discard the unsaved changes?');
  }, [projectController, projectState.dirty]);

  const createProject = useCallback(async (): Promise<void> => {
    const name = window.prompt('Project name', 'Project1')?.trim();
    if (!name) return;
    try {
      if (!(await prepareToReplaceProject())) return;
      const session = await projectController.create(name);
      if (session) {
        activateProjectSession(session);
        addOutput('PROJECT', `Created ${session.project.name}.`);
      }
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [activateProjectSession, addOutput, prepareToReplaceProject, projectController, reportError]);

  const openProject = useCallback(async (): Promise<void> => {
    try {
      if (!(await prepareToReplaceProject())) return;
      const session = await projectController.open();
      if (session) activateProjectSession(session);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [activateProjectSession, prepareToReplaceProject, projectController, reportError]);

  const saveProject = useCallback(async (): Promise<void> => {
    try {
      const session = await projectController.save();
      if (session) addOutput('PROJECT', `Saved ${session.project.name}.`);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [addOutput, projectController, reportError]);

  const closeProject = useCallback(async (): Promise<void> => {
    try {
      if (!(await prepareToReplaceProject())) return;
      projectController.close();
      setOpenFormIds([]);
      setActiveFormId(null);
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [
    designerController,
    prepareToReplaceProject,
    projectController,
    reportError,
    selectionManager,
  ]);

  const addFormToProject = useCallback((): void => {
    if (!project) return;
    const suggested = `Frm${project.forms.length + 1}`;
    const name = window.prompt('Form name', suggested)?.trim();
    if (!name) return;
    try {
      const form = createForm(name);
      projectController.addForm(form);
      setOpenFormIds((current) => (current.includes(form.id) ? current : [...current, form.id]));
      setActiveFormId(form.id);
      selectionManager.clear();
      addOutput('PROJECT', `Added form ${name}.`);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [addOutput, project, projectController, reportError, selectionManager]);

  const deleteForm = useCallback(
    (formId: string): void => {
      if (!project) return;
      const form = project.forms.find((candidate) => candidate.id === formId);
      if (!form || !window.confirm(`Delete ${form.name} from this project?`)) return;
      try {
        const fallbackId = project.forms.find((candidate) => candidate.id !== formId)?.id ?? null;
        projectController.removeForm(formId);
        setOpenFormIds((current) => {
          const remaining = current.filter((id) => id !== formId);
          return remaining.length === 0 && fallbackId ? [fallbackId] : remaining;
        });
        setActiveFormId((current) => (current === formId ? fallbackId : current));
        selectionManager.clear();
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [project, projectController, reportError, selectionManager],
  );

  const renameForm = useCallback(
    (formId: string, name: string): void => {
      try {
        projectController.renameForm(formId, name);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [projectController, reportError],
  );

  const runProject = useCallback(async (): Promise<void> => {
    if (!projectState.project || !projectState.rootPath) return;
    setBuilding(true);
    setDiagnostics([]);
    addOutput('COMPILER', 'Build started.');
    try {
      await projectController.save();
      const current = projectController.getSnapshot();
      if (!current.project || !current.rootPath) throw new Error('The project is no longer open.');
      const result = await window.webrad.build.run({
        rootPath: current.rootPath,
        project: current.project,
        userSources: { ...current.userSources },
      });
      setDiagnostics(result.diagnostics);
      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
        setActiveView('preview');
        addOutput('COMPILER', `Build completed in ${result.outputDirectory ?? 'dist'}.`);
      } else {
        setPreviewUrl(null);
        setVisiblePanels((currentPanels) => ({ ...currentPanels, output: true }));
        addOutput('COMPILER', 'Build failed. See Problems for details.');
      }
    } catch (error) {
      reportError(error, 'COMPILER');
    } finally {
      setBuilding(false);
    }
  }, [addOutput, projectController, projectState.project, projectState.rootPath, reportError]);

  const executeCommand = useCallback(
    (command: IdeCommand): void => {
      if (
        command.startsWith('edit.') &&
        (activeView !== 'design' || isTextEditingElement(document.activeElement))
      ) {
        executeTextEditingCommand(command);
        return;
      }
      switch (command) {
        case 'file.newProject':
          void createProject();
          break;
        case 'file.openProject':
          void openProject();
          break;
        case 'file.closeProject':
          void closeProject();
          break;
        case 'file.save':
        case 'file.saveAll':
          void saveProject();
          break;
        case 'edit.undo':
          undo();
          break;
        case 'edit.redo':
          redo();
          break;
        case 'edit.cut':
          copySelection();
          deleteSelection();
          break;
        case 'edit.copy':
          copySelection();
          break;
        case 'edit.paste':
          pasteSelection();
          break;
        case 'edit.delete':
          deleteSelection();
          break;
        case 'search.find':
          window.dispatchEvent(new Event('webrad:find'));
          break;
        case 'view.design':
          setActiveView('design');
          break;
        case 'view.code':
          setActiveView('code');
          break;
        case 'view.preview':
          setActiveView('preview');
          break;
        case 'view.projectExplorer':
          setVisiblePanels((current) => ({ ...current, explorer: !current.explorer }));
          break;
        case 'view.objectInspector':
          setVisiblePanels((current) => ({ ...current, inspector: !current.inspector }));
          break;
        case 'view.toolPalette':
          setVisiblePanels((current) => ({ ...current, palette: !current.palette }));
          break;
        case 'view.output':
          setVisiblePanels((current) => ({ ...current, output: !current.output }));
          break;
        case 'project.addForm':
          addFormToProject();
          break;
        case 'project.build':
        case 'run.run':
          void runProject();
          break;
        case 'file.exit':
          window.close();
          break;
      }
    },
    [
      addFormToProject,
      activeView,
      closeProject,
      copySelection,
      createProject,
      deleteSelection,
      openProject,
      pasteSelection,
      redo,
      runProject,
      saveProject,
      undo,
    ],
  );

  useEffect(() => window.webrad.commands.subscribe(executeCommand), [executeCommand]);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.key === 'F12') {
        event.preventDefault();
        setActiveView((current) => (current === 'design' ? 'code' : 'design'));
      } else if (event.key === 'F9') {
        event.preventDefault();
        void runProject();
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [runProject]);

  const documents: readonly DocumentTab[] = useMemo(
    () =>
      openFormIds.flatMap((id) => {
        const form = project?.forms.find((candidate) => candidate.id === id);
        return form
          ? [{ id, label: form.name, dirty: projectState.dirty, kind: 'form' as const }]
          : [];
      }),
    [openFormIds, project, projectState.dirty],
  );

  const extraLibraries = useMemo<Readonly<Record<string, string>>>(() => {
    if (!activeForm || !project) return Object.freeze({}) as Readonly<Record<string, string>>;
    const base = sourceUri(projectState.rootPath, project.id, `forms/${activeForm.name}`);
    return {
      'file:///node_modules/@webrad/runtime/index.d.ts': generateRuntimeTypings(),
      [`${base}.generated.ts`]: generateFormSource(activeForm),
    };
  }, [activeForm, project, projectState.rootPath]);

  const editorContent = !activeForm ? null : activeView === 'design' ? (
    <ErrorBoundary area="Designer">
      <DesignerSurface
        form={activeForm}
        settings={
          project?.settings ?? {
            gridSize: 8,
            snapToGrid: true,
            showGrid: true,
            outputDirectory: 'dist',
          }
        }
        selectedIds={selection.ids}
        selectedPaletteType={selectedPaletteType}
        zoom={zoom}
        onSelect={(ids, primaryId) => selectionManager.set(ids, primaryId)}
        onAddComponent={addComponentAt}
        onMoveComponents={moveComponents}
        onResizeComponent={resizeComponent}
        onDeleteSelection={deleteSelection}
        onCopy={copySelection}
        onPaste={pasteSelection}
        onUndo={undo}
        onRedo={redo}
        onBringToFront={() => changeZOrder('front')}
        onSendToBack={() => changeZOrder('back')}
        onZoomChange={setZoom}
        onDefaultEvent={createDefaultEvent}
      />
    </ErrorBoundary>
  ) : activeView === 'code' ? (
    <ErrorBoundary area="Monaco">
      <CodeEditor
        path={sourceUri(projectState.rootPath, project?.id ?? 'project', sourceKey(activeForm))}
        value={projectState.userSources[sourceKey(activeForm)] ?? createUserFormSource(activeForm)}
        theme={theme}
        extraLibraries={extraLibraries}
        navigateTo={navigateTo}
        onChange={(source) => projectController.setUserSource(sourceKey(activeForm), source)}
        onCursorChange={(line, column) => setCursor({ line, column })}
        onSave={() => void saveProject()}
      />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary area="Preview">
      <PreviewPane
        url={previewUrl}
        running={building}
        diagnostics={diagnostics}
        onRun={() => void runProject()}
      />
    </ErrorBoundary>
  );

  const status = !activeForm
    ? ({ kind: 'empty' } as const)
    : activeView === 'code'
      ? ({ kind: 'code', ...cursor } as const)
      : ({
          kind: 'designer',
          name: primaryComponent?.name ?? activeForm.name,
          bounds:
            primaryComponent && componentRegistry.get(primaryComponent.type)?.visual === true
              ? primaryComponent.bounds
              : undefined,
          zoom,
        } as const);

  return (
    <IdeShell
      toolbar={
        <Toolbar
          onCommand={executeCommand}
          canSave={project !== null && !projectState.saving}
          canRun={project !== null && projectState.rootPath !== null && !building}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />
      }
      explorer={
        visiblePanels.explorer ? (
          <ErrorBoundary area="Project Explorer">
            <ProjectExplorer
              project={project}
              activeFormId={activeFormId}
              onOpenForm={openForm}
              onAddForm={addFormToProject}
              onDeleteForm={deleteForm}
              onRenameForm={renameForm}
            />
          </ErrorBoundary>
        ) : null
      }
      palette={
        visiblePanels.palette ? (
          <ErrorBoundary area="Tool Palette">
            <ToolPalette
              selectedType={selectedPaletteType}
              onSelect={setSelectedPaletteType}
              onInsert={(type) => {
                if (!activeForm) return;
                const definition = requireComponentDefinition(type);
                addComponentAt(
                  type,
                  {
                    x: Math.round((activeForm.width - definition.defaultBounds.width) / 2),
                    y: Math.round((activeForm.height - definition.defaultBounds.height) / 2),
                  },
                  activeForm.rootComponentId,
                );
              }}
            />
          </ErrorBoundary>
        ) : null
      }
      editor={
        <EditorWorkspace
          documents={documents}
          activeDocumentId={activeFormId}
          activeView={activeView}
          onSelectDocument={openForm}
          onCloseDocument={(id) => {
            setOpenFormIds((current) => current.filter((candidate) => candidate !== id));
            if (activeFormId === id) {
              const remaining = openFormIds.filter((candidate) => candidate !== id);
              setActiveFormId(remaining.at(-1) ?? null);
            }
          }}
          onSelectView={setActiveView}
        >
          {editorContent}
        </EditorWorkspace>
      }
      inspector={
        visiblePanels.inspector ? (
          <ErrorBoundary area="Object Inspector">
            <ObjectInspector
              selection={selectedComponents}
              form={activeForm}
              definition={
                selectedComponents.length === 0 && activeForm
                  ? componentRegistry.get('WebForm')
                  : undefined
              }
              availableComponents={activeForm?.components}
              onPropertyChange={changeProperty}
              onEventChange={(eventName, handlerName) => bindEvent(eventName, handlerName)}
              onEventDoubleClick={(eventName) => {
                const targetId = selection.primaryId ?? activeForm?.rootComponentId;
                if (targetId) createOrOpenEvent(targetId, eventName);
              }}
            />
          </ErrorBoundary>
        ) : null
      }
      bottom={
        visiblePanels.output ? <BottomPanel diagnostics={diagnostics} output={output} /> : null
      }
      status={<StatusBar status={status} dirty={projectState.dirty} />}
    />
  );
}
