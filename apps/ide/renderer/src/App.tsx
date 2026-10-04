import { type DesignerViewportName } from '@webrad/designer';
import { ActivityBar } from './components/ActivityBar';
import { DesignerSidebar, type DesignerSidebarMode } from './components/DesignerSidebar';
import { ElementTree } from './components/ElementTree';
import {
  AddComponentCommand,
  BringToFrontCommand,
  ChangePropertyCommand,
  MoveCommand,
  ReorderComponentsCommand,
  RemoveComponentCommand,
  ResizeCommand,
  SelectionManager,
  SendToBackCommand,
  snapPoint,
} from '@webrad/designer';
import {
  componentRegistry,
  requireComponentDefinition,
  resolveComponentDesignerPresentation,
  type ComponentDesignerAction,
  type ComponentPropertyDefinition,
} from '@webrad/component-registry';
import {
  applyDefaultComponentStyle,
  createPage,
  createReusableElement,
  DEFAULT_PROJECT_SETTINGS,
  getComponent,
  type ApiClientConfiguration,
  type Bounds,
  type ComponentNode,
  type ComponentStyleModel,
  type DataGridConfiguration,
  type PageModel,
  type ProjectSettings,
} from '@webrad/project-model';
import {
  createUserPageSource,
  createUserReusableElementSource,
  ensureEventHandler,
  eventHandlerName,
  generateEnvironmentTypings,
  generatePageTypings,
  generateReusableElementTypings,
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
import { ApiClientTesterDialog } from './components/ApiClientTesterDialog';
import {
  CodeEditor,
  releaseMonacoWorkspace,
  type EditorCursorStatus,
  type EditorNavigationTarget,
} from './components/CodeEditor';
import { DesignerSurface } from './components/DesignerSurface';
import { AddPageDialog, type AddDocumentKind } from './components/AddPageDialog';
import { DataGridConfigurationDialog } from './components/DataGridConfigurationDialog';
import { EditorWorkspace, type DocumentTab, type ViewMode } from './components/EditorWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IdeShell } from './components/IdeShell';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ObjectInspector } from './components/ObjectInspector';
import { PreviewPane } from './components/PreviewPane';
import { ProjectExplorer } from './components/ProjectExplorer';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';

import { StatusBar } from './components/StatusBar';
import { StylesWorkspace } from './components/StylesWorkspace';
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

const STYLES_DOCUMENT_ID = 'webrad:project-styles';

type ActiveWorkspace = 'page' | 'styles';

function sourceKey(page: PageModel, kind: 'page' | 'reusable'): string {
  return kind === 'reusable' ? `reusables/${page.name}.ts` : `pages/${page.name}.ts`;
}

function createUserSource(page: PageModel, kind: 'page' | 'reusable'): string {
  return kind === 'reusable' ? createUserReusableElementSource(page) : createUserPageSource(page);
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

function selectionNodes(page: PageModel | null, ids: readonly string[]): readonly ComponentNode[] {
  if (!page) return [];
  const idSet = new Set(ids);
  return page.components.filter((component) => idSet.has(component.id));
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
  const [openPageIds, setOpenPageIds] = useState<readonly string[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('page');
  const [activeView, setActiveView] = useState<ViewMode>('design');
  const [selectedPaletteType, setSelectedPaletteType] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [viewportName, setViewportName] = useState<DesignerViewportName>('desktop');
  const [sidebarMode, setSidebarMode] = useState<DesignerSidebarMode>('builder');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [output, setOutput] = useState<readonly OutputEntry[]>([]);
  const [buildDiagnostics, setBuildDiagnostics] = useState<readonly BuildDiagnostic[]>([]);
  const [monacoMarkers, setMonacoMarkers] = useState<readonly MonacoMarkerLike[]>([]);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('output');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compiledStylesCss, setCompiledStylesCss] = useState('');
  const [building, setBuilding] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [addDocumentDialogKind, setAddDocumentDialogKind] = useState<AddDocumentKind | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [projectSettingsDialogOpen, setProjectSettingsDialogOpen] = useState(false);
  const [apiClientTesterComponentId, setApiClientTesterComponentId] = useState<string | null>(null);
  const [dataGridConfiguratorComponentId, setDataGridConfiguratorComponentId] = useState<
    string | null
  >(null);
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
  const stylesCompileRequestRef = useRef(0);
  const [visiblePanels, setVisiblePanels] = useState({
    explorer: true,
    palette: true,
    inspector: true,
    output: false,
  });
  const project = projectState.project;
  const projectStyles = project?.styles;
  const stylesActive = activeWorkspace === 'styles' && project !== null;
  const activePage = stylesActive
    ? null
    : (project?.pages.find((page) => page.id === activePageId) ??
      project?.reusableElements.find((reusableElement) => reusableElement.id === activePageId) ??
      null);
  const activeDocumentKind =
    activePage === null
      ? null
      : project?.pages.some((page) => page.id === activePage.id)
        ? 'page'
        : 'reusable';
  const selectedComponents = useMemo(
    () => selectionNodes(activePage, selection.ids),
    [activePage, selection.ids],
  );
  const primaryComponent =
    activePage && selection.primaryId
      ? (activePage.components.find((component) => component.id === selection.primaryId) ?? null)
      : null;
  const apiClientTesterComponent = useMemo(() => {
    if (activePage === null || apiClientTesterComponentId === null) return null;
    return (
      activePage.components.find((component) => component.id === apiClientTesterComponentId) ?? null
    );
  }, [activePage, apiClientTesterComponentId]);
  const dataGridConfiguratorComponent = useMemo(() => {
    if (activePage === null || dataGridConfiguratorComponentId === null) return null;
    return (
      activePage.components.find((component) => component.id === dataGridConfiguratorComponentId) ??
      null
    );
  }, [activePage, dataGridConfiguratorComponentId]);

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
      setSidebarMode('builder');
      setViewportName('desktop');
      setSelectedPaletteType(null);
      releaseMonacoWorkspace();
      const initialPageId = session.project.entryPage || session.project.pages[0]?.id || null;
      setOpenPageIds(initialPageId ? [initialPageId] : []);
      setActivePageId(initialPageId);
      setStylesOpen(false);
      setActiveWorkspace('page');
      setActiveView('design');
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
      setCompiledStylesCss('');
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
      setBottomPanelTab('output');
      setApiClientTesterComponentId(null);
      setDataGridConfiguratorComponentId(null);
      setAddDocumentDialogKind(null);
      setProjectSettingsDialogOpen(false);
      addOutput('PROJECT', `Opened ${session.project.name}.`);
    },
    [addOutput, designerController, selectionManager],
  );

  useEffect(() => {
    let active = true;
    void projectController
      .restoreLastProject()
      .then((session) => {
        if (active && session) activateProjectSession(session);
      })
      .catch((error: unknown) => {
        if (active) {
          addOutput('PROJECT', `Could not reopen the last project: ${asError(error).message}`);
        }
      });
    return () => {
      active = false;
    };
  }, [activateProjectSession, addOutput, projectController]);

  useEffect(() => selectionManager.subscribe(setSelection), [selectionManager]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const requestId = (stylesCompileRequestRef.current += 1);
    if (projectStyles === undefined) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void window.webrad.styles
        .compile({ styles: projectStyles })
        .then((result) => {
          if (requestId === stylesCompileRequestRef.current) setCompiledStylesCss(result.css);
        })
        .catch((error: unknown) => {
          if (requestId !== stylesCompileRequestRef.current) return;
          setCompiledStylesCss('');
          addOutput('IDE', `Could not compile the live style preview: ${asError(error).message}`);
        });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [addOutput, projectStyles]);

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
    selectionManager.retain(new Set(activePage?.components.map((component) => component.id) ?? []));
  }, [activePage, selectionManager]);

  useEffect(() => {
    const handleBoundaryError = (event: Event): void => {
      const detail = (event as CustomEvent<{ category?: string; message?: string }>).detail;
      if (detail?.message) addOutput(detail.category ?? 'IDE', detail.message);
    };
    window.addEventListener('webrad:error', handleBoundaryError);
    return () => window.removeEventListener('webrad:error', handleBoundaryError);
  }, [addOutput]);

  const openPage = useCallback(
    (pageId: string): void => {
      const document =
        project?.pages.find((page) => page.id === pageId) ??
        project?.reusableElements.find((reusableElement) => reusableElement.id === pageId);
      if (document === undefined) return;
      setOpenPageIds((current) => (current.includes(pageId) ? current : [...current, pageId]));
      setActivePageId(pageId);
      setActiveWorkspace('page');
      setActiveView('design');
      selectionManager.clear();
    },
    [project, selectionManager],
  );

  const openStyles = useCallback((): void => {
    if (!project) return;
    setStylesOpen(true);
    setActiveWorkspace('styles');
    selectionManager.clear();
  }, [project, selectionManager]);

  const updateActivePage = useCallback(
    (nextPage: PageModel): void => {
      if (!activePage) return;
      if (activeDocumentKind === 'reusable') {
        projectController.updateReusableElement(activePage.id, () => nextPage);
      } else {
        projectController.updatePage(activePage.id, () => nextPage);
      }
    },
    [activeDocumentKind, activePage, projectController],
  );

  const commitDesignerCommand = useCallback(
    (command: Parameters<DesignerController['execute']>[1]): PageModel | null => {
      if (!activePage) return null;
      const next = designerController.execute(activePage, command);
      updateActivePage(next);
      return next;
    },
    [activePage, designerController, updateActivePage],
  );

  const addComponentAt = useCallback(
    (type: string, point: { x: number; y: number }, requestedParentId: string): void => {
      if (!activePage) return;
      try {
        const definition = requireComponentDefinition(type);
        const appearsOnCanvas = resolveComponentDesignerPresentation(definition) === 'canvas';
        const requestedParent = getComponent(activePage, requestedParentId);
        const requestedParentDefinition = componentRegistry.get(requestedParent.type);
        const parentId =
          appearsOnCanvas && requestedParentDefinition?.canHaveChildren === true
            ? requestedParent.id
            : activePage.rootComponentId;
        const parent = getComponent(activePage, parentId);
        const snapped = project?.settings.snapToGrid
          ? snapPoint(point, project.settings.gridSize)
          : point;
        const x = appearsOnCanvas
          ? Math.max(0, Math.min(snapped.x, parent.bounds.width - definition.defaultBounds.width))
          : 0;
        const y = appearsOnCanvas
          ? Math.max(0, Math.min(snapped.y, parent.bounds.height - definition.defaultBounds.height))
          : 0;
        const createdNode = componentRegistry.createComponent(type, {
          existingNames: activePage.components,
          parentId,
          x,
          y,
        }) as ComponentNode;
        const node = definition.visual
          ? applyDefaultComponentStyle(createdNode, project?.styles ?? [])
          : createdNode;
        commitDesignerCommand(new AddComponentCommand(node, { parentId }));
        setSelectedPaletteType(null);
        selectionManager.selectSingle(node.id);
        addOutput('DESIGNER', `Added ${node.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activePage, addOutput, commitDesignerCommand, project, reportError, selectionManager],
  );

  const addReusableElementAt = useCallback(
    (
      reusableElementId: string,
      point: { x: number; y: number },
      requestedParentId: string,
    ): void => {
      if (!activePage || !project?.reusableElements.some((item) => item.id === reusableElementId)) {
        return;
      }
      try {
        if (activeDocumentKind === 'reusable' && reusableElementId === activePage.id) {
          throw new Error('A reusable component cannot contain an instance of itself.');
        }
        const definition = requireComponentDefinition('WebReusableElement');
        const parent = getComponent(activePage, requestedParentId);
        const snapped = project.settings.snapToGrid
          ? snapPoint(point, project.settings.gridSize)
          : point;
        const x = Math.max(
          0,
          Math.min(snapped.x, parent.bounds.width - definition.defaultBounds.width),
        );
        const y = Math.max(
          0,
          Math.min(snapped.y, parent.bounds.height - definition.defaultBounds.height),
        );
        const node = componentRegistry.createComponent('WebReusableElement', {
          existingNames: activePage.components,
          parentId: requestedParentId,
          x,
          y,
          props: { reusableElementId },
        }) as ComponentNode;
        commitDesignerCommand(new AddComponentCommand(node, { parentId: requestedParentId }));
        selectionManager.selectSingle(node.id);
        addOutput('DESIGNER', `Added reusable component ${node.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activeDocumentKind,
      activePage,
      addOutput,
      commitDesignerCommand,
      project,
      reportError,
      selectionManager,
    ],
  );

  const moveComponents = useCallback(
    (ids: readonly string[], delta: { x: number; y: number }): void => {
      if (!activePage) return;
      try {
        const selected = new Set(ids);
        const topLevelIds = ids.filter((id) => {
          let parentId = getComponent(activePage, id).parentId;
          while (parentId !== null) {
            if (selected.has(parentId)) return false;
            parentId = getComponent(activePage, parentId).parentId;
          }
          return true;
        });
        const groups = new Map<string, string[]>();
        for (const id of topLevelIds) {
          if (id === activePage.rootComponentId) continue;
          const component = getComponent(activePage, id);
          if (!component.parentId) continue;
          groups.set(component.parentId, [...(groups.get(component.parentId) ?? []), id]);
        }
        const commands = [...groups.values()].map((group) => {
          const hasFloatingReusableElement = group.some((id) => {
            const component = getComponent(activePage, id);
            return (
              component.type === 'WebReusableElement' && component.props.placement === 'floating'
            );
          });
          return new MoveCommand(group, delta, {
            snapToGrid: false,
            constrainToParent: !hasFloatingReusableElement,
          });
        });
        if (commands.length === 0) return;
        const next = designerController.executeMany(activePage, 'Move selection', commands);
        updateActivePage(next);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activePage, designerController, reportError, updateActivePage],
  );

  const reorderComponents = useCallback(
    (parentId: string, componentIds: readonly string[], beforeComponentId: string | null): void => {
      try {
        commitDesignerCommand(
          new ReorderComponentsCommand(parentId, componentIds, beforeComponentId),
        );
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [commitDesignerCommand, reportError],
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
    if (!activePage) return;
    const ids = selection.ids.filter((id) => id !== activePage.rootComponentId);
    if (ids.length === 0) return;
    try {
      commitDesignerCommand(new RemoveComponentCommand(ids));
      selectionManager.clear();
      addOutput('DESIGNER', `Deleted ${ids.length} component${ids.length === 1 ? '' : 's'}.`);
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [activePage, addOutput, commitDesignerCommand, reportError, selection.ids, selectionManager]);

  const copySelection = useCallback((): void => {
    if (!activePage) return;
    const ids = selection.ids.filter((id) => id !== activePage.rootComponentId);
    if (ids.length === 0) return;
    try {
      designerController.copy(activePage, ids);
      addOutput('DESIGNER', `Copied ${ids.length} component${ids.length === 1 ? '' : 's'}.`);
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [activePage, addOutput, designerController, reportError, selection.ids]);

  const pasteSelection = useCallback((): void => {
    if (!activePage || !project) return;
    try {
      const primary = selection.primaryId ? getComponent(activePage, selection.primaryId) : null;
      const parentId =
        primary && componentRegistry.get(primary.type)?.canHaveChildren
          ? primary.id
          : (primary?.parentId ?? activePage.rootComponentId);
      const result = designerController.paste(
        activePage,
        parentId,
        project.settings.gridSize,
        project.settings.snapToGrid,
      );
      if (result.page !== activePage) {
        updateActivePage(result.page);
        selectionManager.set(result.selectedIds);
      }
    } catch (error) {
      reportError(error, 'DESIGNER');
    }
  }, [
    activePage,
    designerController,
    project,
    reportError,
    selection.primaryId,
    selectionManager,
    updateActivePage,
  ]);

  const undo = useCallback((): void => {
    if (!activePage || !designerController.canUndo(activePage)) return;
    const next = designerController.undo(activePage);
    updateActivePage(next);
    selectionManager.retain(new Set(next.components.map((component) => component.id)));
  }, [activePage, designerController, selectionManager, updateActivePage]);

  const redo = useCallback((): void => {
    if (!activePage || !designerController.canRedo(activePage)) return;
    const next = designerController.redo(activePage);
    updateActivePage(next);
  }, [activePage, designerController, updateActivePage]);

  const changeZOrder = useCallback(
    (direction: 'front' | 'back'): void => {
      if (!activePage) return;
      const ids = selection.ids.filter((id) => {
        if (id === activePage.rootComponentId) return false;
        const component = activePage.components.find((candidate) => candidate.id === id);
        const definition =
          component === undefined ? undefined : componentRegistry.get(component.type);
        return (
          definition !== undefined && resolveComponentDesignerPresentation(definition) === 'canvas'
        );
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
    [activePage, commitDesignerCommand, reportError, selection.ids],
  );

  const changeProperty = useCallback(
    (_name: string, value: unknown, definition: ComponentPropertyDefinition): void => {
      if (!activePage || selectedComponents.length === 0) return;
      try {
        if (
          selectedComponents.length === 1 &&
          selectedComponents[0]?.id === activePage.rootComponentId &&
          definition.source === 'node' &&
          definition.name === 'name' &&
          typeof value === 'string'
        ) {
          if (activeDocumentKind === 'reusable') {
            projectController.renameReusableElement(activePage.id, value);
          } else {
            projectController.renamePage(activePage.id, value);
          }
          return;
        }
        updateActivePage(
          designerController.changeProperty(activePage, selectedComponents, definition, value),
        );
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      activeDocumentKind,
      designerController,
      projectController,
      reportError,
      selectedComponents,
      updateActivePage,
    ],
  );

  const createStyle = useCallback(
    (name: string, componentType: string): string | null => {
      try {
        const definition = componentRegistry.get(componentType);
        if (definition?.visual !== true) {
          throw new Error(
            `Styles can only target registered visual components (${componentType}).`,
          );
        }
        const style = projectController.createStyle(name, componentType);
        addOutput('PROJECT', `Created style ${style.name}.`);
        return style.id;
      } catch (error) {
        reportError(error, 'PROJECT');
        return null;
      }
    },
    [addOutput, projectController, reportError],
  );

  const updateStyle = useCallback(
    (style: ComponentStyleModel): void => {
      try {
        projectController.updateStyle(style);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [projectController, reportError],
  );

  const deleteStyle = useCallback(
    (styleId: string): void => {
      try {
        const style = projectStyles?.find((candidate) => candidate.id === styleId);
        projectController.removeStyle(styleId);
        addOutput('PROJECT', `Deleted style ${style?.name ?? styleId}.`);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [addOutput, projectController, projectStyles, reportError],
  );

  const changeStyle = useCallback(
    (styleId: string | null): void => {
      if (!activePage) return;
      try {
        const root = activePage.components.find(
          (component) => component.id === activePage.rootComponentId,
        );
        const targets = selectedComponents.length > 0 ? selectedComponents : root ? [root] : [];
        if (targets.length === 0) return;
        if (styleId !== null) {
          const style = projectStyles?.find((candidate) => candidate.id === styleId);
          if (style === undefined) throw new Error(`Style ${styleId} does not exist.`);
          const incompatible = targets.find((component) => component.type !== style.componentType);
          if (incompatible !== undefined) {
            throw new Error(
              `Style ${style.name} targets ${style.componentType}, not ${incompatible.type}.`,
            );
          }
        }
        updateActivePage(designerController.changeStyle(activePage, targets, styleId));
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      designerController,
      projectStyles,
      reportError,
      selectedComponents,
      updateActivePage,
    ],
  );

  const bindEvent = useCallback(
    (eventName: string, handlerName: string | null): void => {
      if (!activePage || !selection.primaryId) return;
      try {
        updateActivePage(
          designerController.bindEvent(activePage, selection.primaryId, eventName, handlerName),
        );
      } catch (error) {
        reportError(error, 'LANGUAGE');
      }
    },
    [activePage, designerController, reportError, selection.primaryId, updateActivePage],
  );

  const createOrOpenEvent = useCallback(
    (componentId: string, eventName: string): void => {
      if (!activePage) return;
      if (activeDocumentKind === null) return;
      try {
        const component = getComponent(activePage, componentId);
        const eventDefinition = componentRegistry
          .get(component.type)
          ?.events.find((candidate) => candidate.name === eventName);
        const handlerName =
          component.events[eventName] ?? eventHandlerName(component.name, eventName);
        const key = sourceKey(activePage, activeDocumentKind);
        const currentSource =
          projectState.userSources[key] ?? createUserSource(activePage, activeDocumentKind);
        const edit = ensureEventHandler(currentSource, {
          className: activePage.name,
          componentName: component.name,
          componentType: component.type,
          eventName,
          eventDetailType: eventDefinition?.eventDetailType,
          eventDetailProperties: eventDefinition?.eventDetailProperties,
          handlerName,
          fileName: key,
        });
        const nextPage = designerController.bindEvent(
          activePage,
          component.id,
          eventName,
          handlerName,
        );
        updateActivePage(nextPage);
        if (edit.changed) projectController.setUserSource(key, edit.sourceText);
        setOpenPageIds((current) =>
          current.includes(activePage.id) ? current : [...current, activePage.id],
        );
        setActivePageId(activePage.id);
        setActiveWorkspace('page');
        setActiveView('code');
        setNavigateTo({
          resource: sourceUri(projectState.rootPath, project?.id ?? 'project', key),
          line: edit.cursor.line,
          column: edit.cursor.column,
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
      activePage,
      activeDocumentKind,
      addOutput,
      designerController,
      projectController,
      project,
      projectState.rootPath,
      projectState.userSources,
      reportError,
      updateActivePage,
    ],
  );

  const runDesignerAction = useCallback(
    (action: ComponentDesignerAction, component: ComponentNode): void => {
      selectionManager.selectSingle(component.id);
      if (action === 'api-client-tester') {
        setApiClientTesterComponentId(component.id);
      } else if (action === 'data-grid-configurator') {
        setDataGridConfiguratorComponentId(component.id);
      }
    },
    [selectionManager],
  );

  const activateComponent = useCallback(
    (componentId: string): void => {
      if (!activePage) return;
      try {
        const component = getComponent(activePage, componentId);
        const definition = componentRegistry.get(component.type);
        if (definition?.designerAction !== undefined) {
          runDesignerAction(definition.designerAction, component);
          return;
        }
        if (typeof definition?.defaultEvent === 'string') {
          createOrOpenEvent(componentId, definition.defaultEvent);
        }
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activePage, createOrOpenEvent, reportError, runDesignerAction],
  );

  const saveApiClientConfiguration = useCallback(
    (baseUrl: string, configuration: ApiClientConfiguration): void => {
      if (!activePage || apiClientTesterComponent === null) return;
      try {
        const next = designerController.executeMany(activePage, 'Configure API Client', [
          new ChangePropertyCommand(apiClientTesterComponent.id, 'baseUrl', baseUrl),
          new ChangePropertyCommand(apiClientTesterComponent.id, 'apiClientConfig', configuration),
        ]);
        updateActivePage(next);
        setApiClientTesterComponentId(null);
        addOutput('DESIGNER', `Configured API Client ${apiClientTesterComponent.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      addOutput,
      apiClientTesterComponent,
      designerController,
      reportError,
      updateActivePage,
    ],
  );

  const saveDataGridConfiguration = useCallback(
    (configuration: DataGridConfiguration): void => {
      if (!activePage || dataGridConfiguratorComponent === null) return;
      try {
        const next = designerController.executeMany(activePage, 'Configure Data Grid', [
          new ChangePropertyCommand(
            dataGridConfiguratorComponent.id,
            'dataGridConfig',
            configuration,
          ),
        ]);
        updateActivePage(next);
        setDataGridConfiguratorComponentId(null);
        addOutput('DESIGNER', `Configured Data Grid ${dataGridConfiguratorComponent.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      addOutput,
      dataGridConfiguratorComponent,
      designerController,
      reportError,
      updateActivePage,
    ],
  );

  const saveProjectSettings = useCallback(
    (settings: ProjectSettings): void => {
      try {
        projectController.updateProjectSettings(settings);
        setProjectSettingsDialogOpen(false);
        addOutput('PROJECT', 'Saved general project settings.');
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [addOutput, projectController, reportError],
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
      setOpenPageIds([]);
      setActivePageId(null);
      setStylesOpen(false);
      setActiveWorkspace('page');
      selectionManager.clear();
      designerController.clear();
      stylesCompileRequestRef.current += 1;
      setPreviewUrl(null);
      setCompiledStylesCss('');
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
      setApiClientTesterComponentId(null);
      setDataGridConfiguratorComponentId(null);
      setAddDocumentDialogKind(null);
      setProjectSettingsDialogOpen(false);
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

  const openAddDocumentDialog = useCallback(
    (kind: AddDocumentKind): void => {
      if (!project) return;
      setAddDocumentDialogKind(kind);
    },
    [project],
  );

  const addPageToProject = useCallback((): void => {
    openAddDocumentDialog('page');
  }, [openAddDocumentDialog]);

  const addReusableElementToProject = useCallback((): void => {
    openAddDocumentDialog('reusable');
  }, [openAddDocumentDialog]);

  const submitAddDocument = useCallback(
    (name: string): void => {
      const kind = addDocumentDialogKind;
      if (!project || kind === null) return;
      try {
        const document = kind === 'page' ? createPage(name) : createReusableElement(name);
        if (kind === 'page') projectController.addPage(document);
        else projectController.addReusableElement(document);
        setOpenPageIds((current) =>
          current.includes(document.id) ? current : [...current, document.id],
        );
        setActivePageId(document.id);
        setActiveWorkspace('page');
        setActiveView('design');
        selectionManager.clear();
        setAddDocumentDialogKind(null);
        addOutput('PROJECT', `Added ${kind === 'page' ? 'page' : 'reusable component'} ${name}.`);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [addDocumentDialogKind, addOutput, project, projectController, reportError, selectionManager],
  );

  const deletePage = useCallback(
    (pageId: string): void => {
      if (!project) return;
      const page = project.pages.find((candidate) => candidate.id === pageId);
      if (!page || !window.confirm(`Delete ${page.name} from this project?`)) return;
      try {
        const fallbackId = project.pages.find((candidate) => candidate.id !== pageId)?.id ?? null;
        projectController.removePage(pageId);
        setOpenPageIds((current) => {
          const remaining = current.filter((id) => id !== pageId);
          return remaining.length === 0 && fallbackId ? [fallbackId] : remaining;
        });
        setActivePageId((current) => (current === pageId ? fallbackId : current));
        selectionManager.clear();
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [project, projectController, reportError, selectionManager],
  );

  const renamePage = useCallback(
    (pageId: string, name: string): void => {
      try {
        projectController.renamePage(pageId, name);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [projectController, reportError],
  );

  const deleteReusableElement = useCallback(
    (reusableElementId: string): void => {
      if (!project) return;
      const reusableElement = project.reusableElements.find(
        (candidate) => candidate.id === reusableElementId,
      );
      if (
        !reusableElement ||
        !window.confirm(`Delete reusable component ${reusableElement.name} from this project?`)
      ) {
        return;
      }
      try {
        projectController.removeReusableElement(reusableElementId);
        const fallbackId = project.pages[0]?.id ?? null;
        setOpenPageIds((current) => {
          const remaining = current.filter((id) => id !== reusableElementId);
          if (activePageId !== reusableElementId || fallbackId === null) return remaining;
          return remaining.includes(fallbackId) ? remaining : [...remaining, fallbackId];
        });
        if (activePageId === reusableElementId) {
          setActivePageId(fallbackId);
          setActiveView('design');
        }
        selectionManager.clear();
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [activePageId, project, projectController, reportError, selectionManager],
  );

  const renameReusableElement = useCallback(
    (reusableElementId: string, name: string): void => {
      try {
        projectController.renameReusableElement(reusableElementId, name);
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
    (command: IdeCommand, target?: 'designer'): void => {
      // Native menu accelerators bypass the inert workbench and DOM event propagation.
      if (newProjectDialogOpen || addDocumentDialogKind !== null || projectSettingsDialogOpen) {
        return;
      }
      if (
        target !== 'designer' &&
        command.startsWith('edit.') &&
        activeView === 'code' &&
        (!isTextEditingElement(document.activeElement) ||
          document.activeElement?.closest('.monaco-editor') !== null)
      ) {
        window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: command }));
        return;
      }
      if (
        target !== 'designer' &&
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
          if (activeWorkspace === 'page') setActiveView('design');
          break;
        case 'view.code':
          if (activeWorkspace === 'page') setActiveView('code');
          break;
        case 'view.preview':
          if (activeWorkspace === 'page') setActiveView('preview');
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
        case 'project.addPage':
          addPageToProject();
          break;
        case 'project.addReusableElement':
          addReusableElementToProject();
          break;
        case 'project.build':
        case 'run.run':
          void runProject();
          break;
        case 'file.exit':
          window.close();
          break;
        case 'view.toggleTheme':
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
          break;
      }
    },
    [
      addPageToProject,
      addReusableElementToProject,
      activeWorkspace,
      activeView,
      addDocumentDialogKind,
      closeProject,
      copySelection,
      deleteSelection,
      newProjectDialogOpen,
      openNewProjectDialog,
      openProject,
      pasteSelection,
      projectSettingsDialogOpen,
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
        if (activeWorkspace === 'styles') return;
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
  }, [activeView, activeWorkspace, runProject]);

  const documents: readonly DocumentTab[] = useMemo(() => {
    const pageDocuments: readonly DocumentTab[] = openPageIds.flatMap<DocumentTab>((id) => {
      const page = project?.pages.find((candidate) => candidate.id === id);
      if (page !== undefined) {
        return [{ id, label: page.name, dirty: projectState.dirty, kind: 'page' as const }];
      }
      const reusableElement = project?.reusableElements.find((candidate) => candidate.id === id);
      return reusableElement === undefined
        ? []
        : [
            {
              id,
              label: reusableElement.name,
              dirty: projectState.dirty,
              kind: 'reusable' as const,
            },
          ];
    });
    return stylesOpen
      ? [
          ...pageDocuments,
          {
            id: STYLES_DOCUMENT_ID,
            label: 'Styles',
            dirty: projectState.dirty,
            kind: 'styles' as const,
          },
        ]
      : pageDocuments;
  }, [openPageIds, project, projectState.dirty, stylesOpen]);

  const editorPageComponents = useMemo(
    () =>
      activePage?.components
        .filter((component) => component.id !== activePage.rootComponentId)
        .map((component) => ({ name: component.name, type: component.type })) ?? [],
    [activePage],
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
      [
        sourceUri(projectState.rootPath, project.id, 'webrad-environment.d.ts'),
        generateEnvironmentTypings(project.settings.environmentVariables),
      ],
      ...project.pages.map(
        (page) =>
          [
            sourceUri(projectState.rootPath, project.id, `pages/${page.name}.generated.d.ts`),
            generatePageTypings(page),
          ] as const,
      ),
      ...project.reusableElements.map(
        (reusableElement) =>
          [
            sourceUri(
              projectState.rootPath,
              project.id,
              `reusables/${reusableElement.name}.generated.d.ts`,
            ),
            generateReusableElementTypings(reusableElement),
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
        const pageIndex =
          problem.path?.[0] === 'pages' && typeof problem.path[1] === 'number'
            ? problem.path[1]
            : undefined;
        const page = pageIndex === undefined ? undefined : project.pages[pageIndex];
        if (page === undefined) return;
        openPage(page.id);
        setActiveView('design');
        const componentIndex =
          problem.path?.[2] === 'components' && typeof problem.path[3] === 'number'
            ? problem.path[3]
            : undefined;
        const component =
          componentIndex === undefined ? undefined : page.components[componentIndex];
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
      const document =
        project.pages.find((candidate) => sourceKey(candidate, 'page') === relativePath) ??
        project.reusableElements.find(
          (candidate) => sourceKey(candidate, 'reusable') === relativePath,
        );
      if (document === undefined) return;
      const resource = sourceUri(projectState.rootPath, project.id, relativePath);
      openPage(document.id);
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
      openPage,
      project,
      projectState.rootPath,
      projectState.userSources,
      selectionManager,
      sourcePathByResource,
    ],
  );

  const activeSourceKey =
    activePage === null || activeDocumentKind === null
      ? null
      : sourceKey(activePage, activeDocumentKind);
  const primaryComponentDefinition =
    primaryComponent === null ? undefined : componentRegistry.get(primaryComponent.type);
  const primaryComponentAppearsOnCanvas =
    primaryComponentDefinition !== undefined &&
    resolveComponentDesignerPresentation(primaryComponentDefinition) === 'canvas';

  const editorContent = stylesActive ? (
    <ErrorBoundary area="Styles">
      <StylesWorkspace
        styles={project?.styles ?? []}
        compiledCss={compiledStylesCss}
        onCreateStyle={createStyle}
        onUpdateStyle={updateStyle}
        onDeleteStyle={deleteStyle}
      />
    </ErrorBoundary>
  ) : !activePage ? null : activeView === 'design' ? (
    <ErrorBoundary area="Designer">
      <DesignerSurface
        page={activePage}
        reusableElements={project?.reusableElements}
        styles={project?.styles}
        compiledStylesCss={compiledStylesCss}
        settings={project?.settings ?? DEFAULT_PROJECT_SETTINGS}
        selectedIds={selection.ids}
        selectedPaletteType={selectedPaletteType}
        zoom={zoom}
        onSelect={(ids, primaryId) => selectionManager.set(ids, primaryId)}
        onAddComponent={addComponentAt}
        onAddReusableElement={addReusableElementAt}
        onMoveComponents={moveComponents}
        onReorderComponents={reorderComponents}
        onResizeComponent={resizeComponent}
        onDeleteSelection={deleteSelection}
        onCopy={copySelection}
        onPaste={pasteSelection}
        onUndo={undo}
        onRedo={redo}
        onBringToFront={() => changeZOrder('front')}
        onSendToBack={() => changeZOrder('back')}
        onZoomChange={setZoom}
        onComponentActivate={activateComponent}
        onOpenReusableElement={openPage}
        viewportName={viewportName}
        onViewportChange={setViewportName}
        showToolbar={false}
      />
    </ErrorBoundary>
  ) : activeView === 'code' ? (
    <ErrorBoundary area="Monaco">
      <CodeEditor
        path={sourceUri(projectState.rootPath, project?.id ?? 'project', activeSourceKey ?? '')}
        value={
          activeSourceKey === null || activeDocumentKind === null
            ? ''
            : (projectState.userSources[activeSourceKey] ??
              createUserSource(activePage, activeDocumentKind))
        }
        theme={theme}
        breadcrumb={[
          project?.name ?? 'Project',
          activeDocumentKind === 'reusable' ? 'Reusable Components' : 'Pages',
          `${activePage.name}.ts`,
        ]}
        extraLibraries={extraLibraries}
        pageComponents={editorPageComponents}
        projectSources={projectSources}
        buildProblems={buildProblems}
        navigateTo={navigateTo}
        onSourceChange={updateEditorSource}
        onMarkersChange={(markers) => {
          setMonacoMarkers(markers);
          if (markers.some((marker) => marker.severity >= 4)) {
            setVisiblePanels((current) => ({ ...current, output: true }));
            setBottomPanelTab('problems');
          }
        }}
        onCursorChange={setCursor}
        onSave={() => void saveProject()}
      />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary area="Preview">
      <PreviewPane url={previewUrl} running={building} diagnostics={buildDiagnostics} />
    </ErrorBoundary>
  );

  const status = !activePage
    ? ({ kind: 'empty' } as const)
    : activeView === 'code'
      ? ({ kind: 'code', ...cursor } as const)
      : ({
          kind: 'designer',
          name: primaryComponent?.name ?? activePage.name,
          bounds: primaryComponentAppearsOnCanvas ? primaryComponent?.bounds : undefined,
          zoom,
        } as const);
  const modalOpen =
    newProjectDialogOpen ||
    addDocumentDialogKind !== null ||
    iconPickerOpen ||
    projectSettingsDialogOpen ||
    apiClientTesterComponent !== null ||
    dataGridConfiguratorComponent !== null;

  return (
    <>
      <div
        className="wr-ide-modal-host"
        inert={modalOpen ? true : undefined}
        aria-hidden={modalOpen ? true : undefined}
      >
        <IdeShell
          toolbar={
            <Toolbar
              onCommand={executeCommand}
              canSave={project !== null && !projectState.saving}
              canRun={project !== null && projectState.rootPath !== null && !building}
              documents={documents}
              activeDocumentId={stylesActive ? STYLES_DOCUMENT_ID : activePageId}
              onSelectDocument={(id) => {
                if (id === STYLES_DOCUMENT_ID) openStyles();
                else openPage(id);
              }}
              onCloseDocument={(id) => {
                if (id === STYLES_DOCUMENT_ID) {
                  setStylesOpen(false);
                  if (activeWorkspace === 'styles') setActiveWorkspace('page');
                  return;
                }
                setOpenPageIds((current) => {
                  const remaining = current.filter((candidate) => candidate !== id);
                  if (activePageId !== id) return remaining;
                  const nextId = remaining.at(-1) ?? null;
                  setActivePageId(nextId);
                  return remaining;
                });
              }}
              canUndo={
                activePage !== null &&
                (activeView === 'code' || designerController.canUndo(activePage))
              }
              canRedo={
                activePage !== null &&
                (activeView === 'code' || designerController.canRedo(activePage))
              }
              projectName={project?.name}
              dirty={projectState.dirty}
              saving={projectState.saving}
              building={building}
              selectedName={primaryComponent?.name}
              selectedIcon={primaryComponentDefinition?.icon}
              onClearSelection={() => selectionManager.clear()}
              zoom={zoom}
              zoomEnabled={activePage !== null && activeView === 'design'}
              onZoomChange={setZoom}
              issueCount={problemCounts.total}
              onShowProblems={() => {
                setVisiblePanels((current) => ({ ...current, output: true }));
                setBottomPanelTab('problems');
              }}
              canArrange={
                activeView === 'design' &&
                selectedComponents.some(
                  (node) =>
                    node.id !== activePage?.rootComponentId &&
                    componentRegistry.get(node.type)?.visual === true,
                )
              }
              onBringToFront={() => changeZOrder('front')}
              onSendToBack={() => changeZOrder('back')}
            />
          }
          explorer={
            <DesignerSidebar
              mode={sidebarMode}
              onModeChange={setSidebarMode}
              page={activePage}
              viewport={viewportName}
              onViewportChange={(viewport) => {
                setViewportName(viewport);
                if (!stylesActive) setActiveView('design');
              }}
              onInspectPage={() => {
                if (activePage)
                  selectionManager.set([activePage.rootComponentId], activePage.rootComponentId);
              }}
              tree={
                visiblePanels.explorer ? (
                  <ElementTree
                    page={activePage}
                    selectedIds={selection.ids}
                    onSelect={(ids, primaryId) => {
                      setSelectedPaletteType(null);
                      selectionManager.set(ids, primaryId);
                    }}
                    onEditCommand={(command) => executeCommand(command, 'designer')}
                  />
                ) : null
              }
              explorer={
                visiblePanels.explorer ? (
                  <ErrorBoundary area="Project Explorer">
                    <ProjectExplorer
                      project={project}
                      activePageId={
                        stylesActive || activeDocumentKind === 'reusable' ? null : activePageId
                      }
                      onOpenPage={openPage}
                      onAddPage={addPageToProject}
                      onDeletePage={deletePage}
                      onRenamePage={renamePage}
                      activeReusableElementId={
                        stylesActive || activeDocumentKind !== 'reusable' ? null : activePageId
                      }
                      onOpenReusableElement={openPage}
                      onAddReusableElement={addReusableElementToProject}
                      onDeleteReusableElement={deleteReusableElement}
                      onRenameReusableElement={renameReusableElement}
                    />
                  </ErrorBoundary>
                ) : null
              }
            />
          }
          palette={
            visiblePanels.palette ? (
              <ErrorBoundary area="Tool Palette">
                <ToolPalette
                  compact
                  selectedType={selectedPaletteType}
                  onSelect={setSelectedPaletteType}
                  onInsert={(type) => {
                    if (!activePage) return;
                    const definition = requireComponentDefinition(type);
                    const selectedContainer =
                      primaryComponent !== null &&
                      componentRegistry.get(primaryComponent.type)?.canHaveChildren === true
                        ? primaryComponent
                        : activePage.components.find(
                            (component) => component.id === activePage.rootComponentId,
                          );
                    if (selectedContainer === undefined) return;
                    addComponentAt(
                      type,
                      {
                        x: Math.round(
                          (selectedContainer.bounds.width - definition.defaultBounds.width) / 2,
                        ),
                        y: Math.round(
                          (selectedContainer.bounds.height - definition.defaultBounds.height) / 2,
                        ),
                      },
                      selectedContainer.id,
                    );
                  }}
                  allowNonvisual
                />
              </ErrorBoundary>
            ) : null
          }
          activity={
            <ActivityBar
              activeView={activeView}
              stylesActive={stylesActive}
              projectActive={sidebarMode === 'project'}
              hasProject={project !== null}
              hasDocument={activePageId !== null}
              outputVisible={visiblePanels.output}
              onSelectView={(view) => {
                setActiveWorkspace('page');
                setActiveView(view);
                if (view === 'design') setSidebarMode('builder');
              }}
              onShowProject={() => {
                setVisiblePanels((current) => ({ ...current, explorer: true }));
                setSidebarMode('project');
              }}
              onOpenStyles={openStyles}
              onOpenSettings={() => setProjectSettingsDialogOpen(true)}
              onToggleOutput={() =>
                setVisiblePanels((current) => ({ ...current, output: !current.output }))
              }
            />
          }
          editor={
            <EditorWorkspace
              documents={documents}
              activeDocumentId={stylesActive ? STYLES_DOCUMENT_ID : activePageId}
            >
              {editorContent}
            </EditorWorkspace>
          }
          inspector={
            visiblePanels.inspector ? (
              <ErrorBoundary area="Object Inspector">
                <ObjectInspector
                  selection={selectedComponents}
                  page={activePage}
                  definition={
                    selectedComponents.length === 0 && activePage
                      ? componentRegistry.get(
                          activePage.components.find(
                            (component) => component.id === activePage.rootComponentId,
                          )?.type ?? 'WebPage',
                        )
                      : undefined
                  }
                  availableComponents={activePage?.components}
                  availableReusableElements={project?.reusableElements}
                  styles={project?.styles}
                  onStyleChange={changeStyle}
                  onPropertyChange={changeProperty}
                  onDesignerAction={(action, component) => runDesignerAction(action, component)}
                  onIconPickerOpenChange={setIconPickerOpen}
                  onEventChange={(eventName, handlerName) => bindEvent(eventName, handlerName)}
                  onEventDoubleClick={(eventName) => {
                    const targetId = selection.primaryId ?? activePage?.rootComponentId;
                    if (targetId) createOrOpenEvent(targetId, eventName);
                  }}
                  eventsEnabled
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
      {addDocumentDialogKind !== null && project !== null && (
        <AddPageDialog
          key={addDocumentDialogKind}
          kind={addDocumentDialogKind}
          suggestedName={(() => {
            const occupiedNames = new Set([
              ...project.pages.map((page) => page.name),
              ...project.reusableElements.map((reusableElement) => reusableElement.name),
            ]);
            const prefix = addDocumentDialogKind === 'page' ? 'Page' : 'Reusable';
            let sequence = addDocumentDialogKind === 'page' ? 2 : 1;
            while (occupiedNames.has(`${prefix}${String(sequence)}`)) sequence += 1;
            return `${prefix}${String(sequence)}`;
          })()}
          occupiedNames={[
            ...project.pages.map((page) => page.name),
            ...project.reusableElements.map((reusableElement) => reusableElement.name),
          ]}
          onCancel={() => setAddDocumentDialogKind(null)}
          onCreate={submitAddDocument}
        />
      )}
      {projectSettingsDialogOpen && project !== null && (
        <ProjectSettingsDialog
          projectName={project.name}
          settings={project.settings}
          onClose={() => setProjectSettingsDialogOpen(false)}
          onSave={saveProjectSettings}
        />
      )}
      {apiClientTesterComponent !== null && (
        <ApiClientTesterDialog
          component={apiClientTesterComponent}
          onClose={() => setApiClientTesterComponentId(null)}
          onSave={saveApiClientConfiguration}
        />
      )}
      {dataGridConfiguratorComponent !== null && (
        <DataGridConfigurationDialog
          availableComponents={activePage?.components ?? []}
          component={dataGridConfiguratorComponent}
          onClose={() => setDataGridConfiguratorComponentId(null)}
          onSave={saveDataGridConfiguration}
        />
      )}
    </>
  );
}
