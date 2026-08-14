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
  generateFormTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { BuildDiagnostic, IdeCommand, ProjectSession } from '../../shared/contracts';
import { BottomPanel, type BottomPanelTab, type OutputEntry } from './components/BottomPanel';
import {
  CodeEditor,
  releaseMonacoWorkspace,
  type EditorCursorStatus,
  type EditorNavigationTarget,
} from './components/CodeEditor';
import { DesignerSurface } from './components/DesignerSurface';
import { EditorWorkspace, type DocumentTab, type ViewMode } from './components/EditorWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IdeShell } from './components/IdeShell';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ObjectInspector } from './components/ObjectInspector';
import { PreviewPane } from './components/PreviewPane';
import { ProjectExplorer } from './components/ProjectExplorer';
import { StatusBar } from './components/StatusBar';
import { ToolPalette } from './components/ToolPalette';
import { Toolbar } from './components/Toolbar';
import {
  countEditorProblems,
  mergeEditorProblems,
  normalizeBuildDiagnostics,
  normalizeMonacoMarkers,
  type EditorProblem,
  type MonacoMarkerLike,
} from './editor-problems';
import { canonicalMonacoResource } from './monaco-resource';
import { DesignerController } from './state/designer-controller';
import { ProjectController } from './state/project-controller';

function sourceKey(form: FormModel): string {
  return `forms/${form.name}.ts`;
}

function sourceUri(rootPath: string | null, projectId: string, relativePath: string): string {
  if (!rootPath) {
    return canonicalMonacoResource(`inmemory://webrad/${projectId}/${relativePath}`);
  }
  const portableRoot = rootPath.replaceAll('\\', '/');
  const base = portableRoot.endsWith('/') ? portableRoot.slice(0, -1) : portableRoot;
  const encoded = encodeURI(`${base}/${relativePath}`)
    .replaceAll('#', '%23')
    .replaceAll('?', '%3F');
  const resource = encoded.startsWith('//')
    ? `file:${encoded}`
    : encoded.startsWith('/')
      ? `file://${encoded}`
      : `file:///${encoded}`;
  return canonicalMonacoResource(resource);
}

function matchingSourceKey(
  fileName: string,
  userSources: Readonly<Record<string, string>>,
  caseInsensitive: boolean,
): string | undefined {
  const portableFileName = fileName.replaceAll('\\', '/');
  const comparableFileName = caseInsensitive
    ? portableFileName.toLocaleLowerCase()
    : portableFileName;
  return Object.keys(userSources).find((sourcePath) => {
    const portableSourcePath = sourcePath.replaceAll('\\', '/');
    const comparableSourcePath = caseInsensitive
      ? portableSourcePath.toLocaleLowerCase()
      : portableSourcePath;
    return (
      comparableFileName === comparableSourcePath ||
      comparableFileName.endsWith(`/${comparableSourcePath}`)
    );
  });
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
  const [buildDiagnostics, setBuildDiagnostics] = useState<readonly BuildDiagnostic[]>([]);
  const [monacoMarkers, setMonacoMarkers] = useState<readonly MonacoMarkerLike[]>([]);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('output');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<EditorCursorStatus>({
    line: 1,
    column: 1,
    selectionLength: 0,
  });
  const [navigateTo, setNavigateTo] = useState<EditorNavigationTarget | null>(null);
  const navigationRequestRef = useRef(0);
  const buildRequestRef = useRef(0);
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
      setBuildDiagnostics([{ category: 'error', source: 'ide', message: normalized.message }]);
      setBottomPanelTab('problems');
      setVisiblePanels((current) => ({ ...current, output: true }));
    },
    [addOutput],
  );

  const activateProjectSession = useCallback(
    (session: ProjectSession): void => {
      releaseMonacoWorkspace();
      const initialFormId = session.project.entryForm || session.project.forms[0]?.id || null;
      setOpenFormIds(initialFormId ? [initialFormId] : []);
      setActiveFormId(initialFormId);
      setActiveView('design');
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
      setBottomPanelTab('output');
      addOutput('PROJECT', `Opened ${session.project.name}.`);
    },
    [addOutput, designerController, selectionManager],
  );

  useEffect(() => selectionManager.subscribe(setSelection), [selectionManager]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const observedProjectRevisionRef = useRef(projectState.revision);
  useEffect(() => {
    if (observedProjectRevisionRef.current === projectState.revision) return;
    observedProjectRevisionRef.current = projectState.revision;
    buildRequestRef.current += 1;
    setBuilding(false);
    setBuildDiagnostics([]);
    setPreviewUrl(null);
  }, [projectState.revision]);

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
        setNavigateTo({
          resource: sourceUri(
            projectState.rootPath,
            project?.id ?? 'project',
            sourceKey(activeForm),
          ),
          line: edit.location.line,
          column: edit.location.column,
          requestId: (navigationRequestRef.current += 1),
        });
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
      project,
      projectState.rootPath,
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

  const openNewProjectDialog = useCallback(async (): Promise<void> => {
    try {
      if (!(await prepareToReplaceProject())) return;
      setNewProjectError(null);
      setNewProjectDialogOpen(true);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [prepareToReplaceProject, reportError]);

  const submitNewProject = useCallback(
    async (name: string): Promise<void> => {
      setCreatingProject(true);
      setNewProjectError(null);
      try {
        const session = await projectController.create(name);
        if (session) {
          activateProjectSession(session);
          addOutput('PROJECT', `Created ${session.project.name}.`);
          setNewProjectDialogOpen(false);
        }
      } catch (error) {
        const normalized = asError(error);
        setNewProjectError(normalized.message);
        reportError(normalized, 'PROJECT');
      } finally {
        setCreatingProject(false);
      }
    },
    [activateProjectSession, addOutput, projectController, reportError],
  );

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
      releaseMonacoWorkspace();
      setOpenFormIds([]);
      setActiveFormId(null);
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
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
    const requestId = (buildRequestRef.current += 1);
    setBuilding(true);
    setBuildDiagnostics([]);
    setBottomPanelTab('build');
    setVisiblePanels((current) => ({ ...current, output: true }));
    addOutput('COMPILER', 'Build started.');
    try {
      await projectController.save();
      const current = projectController.getSnapshot();
      if (!current.project || !current.rootPath) throw new Error('The project is no longer open.');
      if (requestId !== buildRequestRef.current) return;
      const buildRevision = current.revision;
      const buildRootPath = current.rootPath;
      const result = await window.webrad.build.run({
        rootPath: current.rootPath,
        project: current.project,
        userSources: { ...current.userSources },
      });
      const latest = projectController.getSnapshot();
      if (
        requestId !== buildRequestRef.current ||
        latest.rootPath !== buildRootPath ||
        latest.revision !== buildRevision
      ) {
        addOutput('COMPILER', 'Ignored an outdated build result after the project changed.');
        return;
      }
      setBuildDiagnostics(result.diagnostics);
      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
        setActiveView('preview');
        addOutput('COMPILER', `Build completed in ${result.outputDirectory ?? 'dist'}.`);
      } else {
        setPreviewUrl(null);
        setVisiblePanels((currentPanels) => ({ ...currentPanels, output: true }));
        setBottomPanelTab('problems');
        addOutput('COMPILER', 'Build failed. See Problems for details.');
      }
    } catch (error) {
      if (requestId === buildRequestRef.current) reportError(error, 'COMPILER');
    } finally {
      if (requestId === buildRequestRef.current) setBuilding(false);
    }
  }, [addOutput, projectController, projectState.project, projectState.rootPath, reportError]);

  const executeCommand = useCallback(
    (command: IdeCommand): void => {
      // Native menu accelerators bypass the inert workbench and DOM event propagation.
      if (newProjectDialogOpen) return;
      if (
        command.startsWith('edit.') &&
        (activeView !== 'design' || isTextEditingElement(document.activeElement))
      ) {
        executeTextEditingCommand(command);
        return;
      }
      switch (command) {
        case 'file.newProject':
          void openNewProjectDialog();
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
      deleteSelection,
      newProjectDialogOpen,
      openNewProjectDialog,
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
        const target = event.target;
        if (
          activeView === 'code' &&
          target instanceof Element &&
          target.closest('.monaco-editor') !== null
        ) {
          return;
        }
        event.preventDefault();
        setActiveView((current) => (current === 'design' ? 'code' : 'design'));
      } else if (event.key === 'F9') {
        event.preventDefault();
        void runProject();
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [activeView, runProject]);

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

  const editorFormComponents = useMemo(
    () =>
      activeForm?.components
        .filter((component) => component.id !== activeForm.rootComponentId)
        .map((component) => ({ name: component.name, type: component.type })) ?? [],
    [activeForm],
  );

  const projectSources = useMemo<Readonly<Record<string, string>>>(() => {
    if (!project) return Object.freeze({}) as Readonly<Record<string, string>>;
    return Object.fromEntries(
      Object.entries(projectState.userSources).map(([relativePath, source]) => [
        sourceUri(projectState.rootPath, project.id, relativePath),
        source,
      ]),
    );
  }, [project, projectState.rootPath, projectState.userSources]);

  const sourcePathByResource = useMemo(
    () =>
      new Map(
        Object.keys(projectState.userSources).map((relativePath) => [
          sourceUri(projectState.rootPath, project?.id ?? 'project', relativePath),
          relativePath,
        ]),
      ),
    [project?.id, projectState.rootPath, projectState.userSources],
  );

  const extraLibraries = useMemo<Readonly<Record<string, string>>>(() => {
    if (!project) return Object.freeze({}) as Readonly<Record<string, string>>;
    return Object.fromEntries([
      ['file:///node_modules/@webrad/runtime/index.d.ts', generateRuntimeTypings()],
      ...project.forms.map(
        (form) =>
          [
            sourceUri(projectState.rootPath, project.id, `forms/${form.name}.generated.d.ts`),
            generateFormTypings(form),
          ] as const,
      ),
    ]);
  }, [project, projectState.rootPath]);

  const buildProblems = useMemo(
    () =>
      normalizeBuildDiagnostics(buildDiagnostics, {
        resolveResource: (file) => {
          const key = matchingSourceKey(
            file,
            projectState.userSources,
            window.webrad.platform === 'win32',
          );
          return key === undefined
            ? undefined
            : sourceUri(projectState.rootPath, project?.id ?? 'project', key);
        },
        getSourceText: (file) => {
          const key = matchingSourceKey(
            file,
            projectState.userSources,
            window.webrad.platform === 'win32',
          );
          return key === undefined ? undefined : projectState.userSources[key];
        },
      }),
    [buildDiagnostics, project?.id, projectState.rootPath, projectState.userSources],
  );

  const problems = useMemo(
    () => mergeEditorProblems(normalizeMonacoMarkers(monacoMarkers), buildProblems),
    [buildProblems, monacoMarkers],
  );
  const problemCounts = useMemo(() => countEditorProblems(problems), [problems]);

  const updateEditorSource = useCallback(
    (resource: string, source: string): void => {
      const canonicalResource = canonicalMonacoResource(resource);
      const comparableResource =
        window.webrad.platform === 'win32'
          ? canonicalResource.toLocaleLowerCase()
          : canonicalResource;
      const relativePath =
        sourcePathByResource.get(canonicalResource) ??
        [...sourcePathByResource].find(([candidate]) => {
          const comparableCandidate =
            window.webrad.platform === 'win32' ? candidate.toLocaleLowerCase() : candidate;
          return comparableCandidate === comparableResource;
        })?.[1];
      if (relativePath !== undefined) projectController.setUserSource(relativePath, source);
    },
    [projectController, sourcePathByResource],
  );

  const activateProblem = useCallback(
    (problem: EditorProblem): void => {
      if (!project) return;
      if (problem.range === undefined) {
        const formIndex =
          problem.path?.[0] === 'forms' && typeof problem.path[1] === 'number'
            ? problem.path[1]
            : undefined;
        const form = formIndex === undefined ? undefined : project.forms[formIndex];
        if (form === undefined) return;
        openForm(form.id);
        setActiveView('design');
        const componentIndex =
          problem.path?.[2] === 'components' && typeof problem.path[3] === 'number'
            ? problem.path[3]
            : undefined;
        const component =
          componentIndex === undefined ? undefined : form.components[componentIndex];
        if (component === undefined) selectionManager.clear();
        else selectionManager.set([component.id], component.id);
        return;
      }
      const canonicalProblemResource =
        problem.resource === undefined ? undefined : canonicalMonacoResource(problem.resource);
      const comparableResource =
        canonicalProblemResource === undefined || window.webrad.platform !== 'win32'
          ? canonicalProblemResource
          : canonicalProblemResource.toLocaleLowerCase();
      const relativePath =
        (canonicalProblemResource === undefined
          ? undefined
          : (sourcePathByResource.get(canonicalProblemResource) ??
            [...sourcePathByResource].find(([candidate]) => {
              const comparableCandidate =
                window.webrad.platform === 'win32' ? candidate.toLocaleLowerCase() : candidate;
              return comparableCandidate === comparableResource;
            })?.[1])) ??
        (problem.file === undefined
          ? undefined
          : matchingSourceKey(
              problem.file,
              projectState.userSources,
              window.webrad.platform === 'win32',
            ));
      if (relativePath === undefined) return;
      const form = project.forms.find((candidate) => sourceKey(candidate) === relativePath);
      if (form === undefined) return;
      const resource = sourceUri(projectState.rootPath, project.id, relativePath);
      openForm(form.id);
      setActiveView('code');
      setNavigateTo({
        resource,
        line: problem.range.startLineNumber,
        column: problem.range.startColumn,
        endLine: problem.range.endLineNumber,
        endColumn: problem.range.endColumn,
        requestId: (navigationRequestRef.current += 1),
      });
    },
    [
      openForm,
      project,
      projectState.rootPath,
      projectState.userSources,
      selectionManager,
      sourcePathByResource,
    ],
  );

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
        breadcrumb={[project?.name ?? 'Project', 'Forms', `${activeForm.name}.ts`]}
        extraLibraries={extraLibraries}
        formComponents={editorFormComponents}
        projectSources={projectSources}
        buildProblems={buildProblems}
        navigateTo={navigateTo}
        onSourceChange={updateEditorSource}
        onMarkersChange={setMonacoMarkers}
        onCursorChange={setCursor}
        onSave={() => void saveProject()}
      />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary area="Preview">
      <PreviewPane
        url={previewUrl}
        running={building}
        diagnostics={buildDiagnostics}
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
    <>
      <div
        className="wr-ide-modal-host"
        inert={newProjectDialogOpen ? true : undefined}
        aria-hidden={newProjectDialogOpen ? true : undefined}
      >
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
            visiblePanels.output ? (
              <BottomPanel
                activeTab={bottomPanelTab}
                problems={problems}
                output={output}
                building={building}
                onActiveTabChange={setBottomPanelTab}
                onProblemActivate={activateProblem}
              />
            ) : null
          }
          status={
            <StatusBar
              status={status}
              dirty={projectState.dirty}
              problemCounts={problemCounts}
              onShowProblems={() => {
                setVisiblePanels((current) => ({ ...current, output: true }));
                setBottomPanelTab('problems');
              }}
            />
          }
        />
      </div>
      {newProjectDialogOpen && (
        <NewProjectDialog
          busy={creatingProject}
          error={newProjectError}
          onClearError={() => setNewProjectError(null)}
          onCancel={() => {
            setNewProjectDialogOpen(false);
            setNewProjectError(null);
          }}
          onCreate={(name) => void submitNewProject(name)}
        />
      )}
    </>
  );
}
