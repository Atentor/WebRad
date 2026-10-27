import { menuInspectorTarget, type ProjectTemplateId } from '@webrad/component-registry';
import { useUpdates } from './use-updates';
import { UpdateInstallingDialog } from './components/UpdateIndicator';
import { ProjectAssetPreview } from './components/ProjectAssetPreview';
import { AboutDialog } from './components/AboutDialog';
import { DeployDialog } from './components/DeployDialog';
import { useDeploy } from './use-deploy';
import { useBuildApplication } from './use-build-application';
import { BuildApplicationDialog } from './components/BuildApplicationDialog';
import type { NativeBuildResponse } from '../../shared/native-build-contracts';
import { type DesignerViewportName } from '@webrad/designer';
import { ActivityBar } from './components/ActivityBar';
import { DesignerSidebar, type DesignerSidebarMode } from './components/DesignerSidebar';
import { ElementTree } from './components/ElementTree';
import {
  AddComponentCommand,
  BringToFrontCommand,
  ChangePropertyCommand,
  MoveCommand,
  ReparentComponentsCommand,
  ReorderComponentsCommand,
  RemoveComponentCommand,
  ResizeCommand,
  SelectionManager,
  SendToBackCommand,
  normalizeTopLevelIds,
  projectInsertionBounds,
} from '@webrad/designer';
import {
  componentRegistry,
  REUSABLE_COMPONENT_TEMPLATES,
  getCurrentRowBindableProperties,
  requireComponentDefinition,
  resolveComponentDesignerPresentation,
  type ComponentDesignerAction,
  type ComponentPropertyDefinition,
} from '@webrad/component-registry';
import {
  pageClassName,
  applyDefaultComponentStyle,
  projectSourceFilePath,
  portableFileNameKey,
  createPage,
  createReusableElement,
  DEFAULT_PROJECT_SETTINGS,
  projectThemeCss,
  type ResolvedThemeMode,
  type ProjectThemePresetId,
  getComponent,
  type ApiClientConfiguration,
  type Bounds,
  type ComponentNode,
  type ComponentStyleModel,
  type DataGridConfiguration,
  type ComboBoxConfiguration,
  type RepeatingGroupConfiguration,
  type CurrentRowBinding,
  normalizeCurrentRowBindings,
  type PageModel,
  type ProjectSettings,
  type RestGoProjectSettings,
} from '@webrad/project-model';
import {
  createUserPageSource,
  createUserReusableElementSource,
  currentRowHandlerType,
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
import type {
  BuildDiagnostic,
  DeployResponse,
  IdeCommand,
  ProjectSession,
} from '../../shared/contracts';
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
import { MenuConfigurationDialog } from './components/MenuConfigurationDialog';
import type { WebMenuConfiguration } from '@webrad/runtime/menu-model';
import { ComboBoxConfigurationDialog } from './components/ComboBoxConfigurationDialog';
import { ComboBoxItemsDialog } from './components/ComboBoxItemsDialog';
import { RepeatingGroupConfigurationDialog } from './components/RepeatingGroupConfigurationDialog';
import { ReportBuilderDialog } from './components/ReportBuilderDialog';
import type { WebReportTemplate } from '@webrad/runtime/report-template';
import { CurrentRowBindingsDialog } from './components/CurrentRowBindingsDialog';
import { designerInsertionBounds } from './components/designer-insertion-bounds';
import {
  currentRowGroup,
  repeatingGroupSource,
  compatibleCurrentRowField,
} from './components/repeating-group-editor';
import { EditorWorkspace, type DocumentTab, type ViewMode } from './components/EditorWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IdeShell } from './components/IdeShell';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ObjectInspector } from './components/ObjectInspector';
import { PreviewWorkspace } from './components/PreviewWorkspace';
import { ProjectExplorer } from './components/ProjectExplorer';
import { normalizeHistoryDocument } from './state/project-history';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { RestGoWorkspace } from './components/RestGoWorkspace';
import { RestGoSidebar, type RestGoSection } from './components/RestGoSidebar';

import { StatusBar } from './components/StatusBar';
import { StylesWorkspace } from './components/StylesWorkspace';
import { StyleComponentList } from './components/StyleComponentList';
import { ProjectVisualResources } from './ProjectVisualResources';
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
import { editCommandTarget, executeTextEditingCommand } from './workbench-commands';
import { DesignerController } from './state/designer-controller';
import { ProjectController } from './state/project-controller';
import { synchronizeProjectRestGoClients } from './state/restgo-api-sync';
import { restGoCatalogToPublishedApis } from './components/restgo-workspace-model';
import type { RestGoAdminCatalog } from '../../shared/restgo-admin';
import { useDebugger } from './state/useDebugger';
import { DebuggerPanel } from './components/DebuggerPanel';
import type { DebugLocation } from '../../shared/debugger-contracts';

const STYLES_DOCUMENT_ID = 'webrad:project-styles';
const RESTGO_DOCUMENT_ID = 'webrad:restgo';

type ActiveWorkspace = 'page' | 'styles' | 'restgo';

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

export function App(): ReactElement {
  const projectController = useMemo(() => new ProjectController(window.webrad), []);
  const updates = useUpdates(projectController);
  const checkForUpdates = updates.check;
  const designerController = useMemo(
    () =>
      new DesignerController((page) =>
        normalizeHistoryDocument(page, projectController.getSnapshot().project),
      ),
    [projectController],
  );
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
  const [restGoOpen, setRestGoOpen] = useState(false);
  const [restGoVisited, setRestGoVisited] = useState(false);
  const [restGoSection, setRestGoSection] = useState<RestGoSection>('connection');

  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('page');
  const [activeView, setActiveView] = useState<ViewMode>('design');
  const [selectedPaletteType, setSelectedPaletteType] = useState<string | null>(null);
  const cancelPaletteInsertion = useCallback(() => setSelectedPaletteType(null), []);
  const [styleComponentType, setStyleComponentType] = useState('WebPage');
  const [zoom, setZoom] = useState(100);
  const [viewportName, setViewportName] = useState<DesignerViewportName>('desktop');
  const [sidebarMode, setSidebarMode] = useState<DesignerSidebarMode>('builder');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [projectPreviewTheme, setProjectPreviewTheme] = useState<ResolvedThemeMode>('light');
  const [output, setOutput] = useState<readonly OutputEntry[]>([]);
  const [buildDiagnostics, setBuildDiagnostics] = useState<readonly BuildDiagnostic[]>([]);
  const [monacoMarkers, setMonacoMarkers] = useState<readonly MonacoMarkerLike[]>([]);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('output');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const previewActiveRef = useRef(false);
  const previewBuildPendingRef = useRef(false);
  const previewSaveContextRef = useRef<{ projectId: string; rootPath: string } | null>(null);
  const previewReturnFocusRef = useRef<HTMLElement | null>(null);
  const [compiledStylesCss, setCompiledStylesCss] = useState('');
  const [building, setBuilding] = useState(false);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [addDocumentDialogKind, setAddDocumentDialogKind] = useState<AddDocumentKind | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [projectSettingsDialogOpen, setProjectSettingsDialogOpen] = useState(false);
  const [projectSettingsInitialSection, setProjectSettingsInitialSection] = useState<
    'general' | 'build'
  >('general');
  const [apiClientTesterComponentId, setApiClientTesterComponentId] = useState<string | null>(null);
  const [menuConfiguratorComponentId, setMenuConfiguratorComponentId] = useState<string | null>(
    null,
  );
  const [comboBoxEditorMode, setComboBoxEditorMode] = useState<'api' | 'items' | 'values'>('api');
  const [comboBoxConfiguratorComponentId, setComboBoxConfiguratorComponentId] = useState<
    string | null
  >(null);
  const [dataGridConfiguratorComponentId, setDataGridConfiguratorComponentId] = useState<
    string | null
  >(null);
  const [repeatingGroupConfiguratorComponentId, setRepeatingGroupConfiguratorComponentId] =
    useState<string | null>(null);
  const [reportBuilderComponentId, setReportBuilderComponentId] = useState<string | null>(null);
  const [currentRowBindingsComponentId, setCurrentRowBindingsComponentId] = useState<string | null>(
    null,
  );
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
  const restGoActive = activeWorkspace === 'restgo' && project !== null;
  const activePage =
    stylesActive || restGoActive
      ? null
      : (project?.pages.find((page) => page.id === activePageId) ??
        project?.reusableElements.find((reusableElement) => reusableElement.id === activePageId) ??
        null);
  const activeSourceFile =
    stylesActive || restGoActive
      ? undefined
      : project?.sourceFiles?.find((file) => file.id === activePageId);
  const activeAsset =
    stylesActive || restGoActive
      ? undefined
      : project?.assets?.find((asset) => asset.id === activePageId);
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
  const menuConfiguratorDocument = [
    ...(activePage ? [activePage] : []),
    ...(project?.reusableElements ?? []),
  ].find((document) =>
    document.components.some((component) => component.id === menuConfiguratorComponentId),
  );
  const menuConfiguratorComponent =
    menuConfiguratorDocument?.components.find(
      (component) => component.id === menuConfiguratorComponentId,
    ) ?? null;
  const comboBoxConfiguratorComponent = useMemo(
    () =>
      activePage?.components.find(
        (component) => component.id === comboBoxConfiguratorComponentId,
      ) ?? null,
    [activePage, comboBoxConfiguratorComponentId],
  );
  const repeatingGroupConfiguratorComponent = useMemo(
    () =>
      activePage?.components.find(
        (component) => component.id === repeatingGroupConfiguratorComponentId,
      ) ?? null,
    [activePage, repeatingGroupConfiguratorComponentId],
  );
  const reportBuilderComponent = useMemo(
    () =>
      activePage?.components.find((component) => component.id === reportBuilderComponentId) ?? null,
    [activePage, reportBuilderComponentId],
  );
  const currentRowBindingsComponent = useMemo(
    () =>
      activePage?.components.find((component) => component.id === currentRowBindingsComponentId) ??
      null,
    [activePage, currentRowBindingsComponentId],
  );
  const currentRowBindingsGroup =
    currentRowBindingsComponent === null
      ? undefined
      : currentRowGroup(currentRowBindingsComponent, activePage?.components ?? []);
  const codeEditorVisible =
    activeWorkspace === 'page' &&
    !previewActive &&
    (activeSourceFile !== undefined || (activePage !== null && activeView === 'code'));

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

  useEffect(() => {
    void window.webrad.lifecycle.setPreviewMode(previewActive).catch((error: unknown) => {
      reportError(error, 'IPC');
    });
  }, [previewActive, reportError]);

  const activateProjectSession = useCallback(
    (session: ProjectSession): void => {
      const initialTheme = session.project.settings.themes.initialMode;
      setProjectPreviewTheme(
        initialTheme === 'system'
          ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : initialTheme,
      );
      setSidebarMode('builder');
      setViewportName('desktop');
      setSelectedPaletteType(null);
      releaseMonacoWorkspace();
      const initialPageId = session.project.entryPage || session.project.pages[0]?.id || null;
      setOpenPageIds(initialPageId ? [initialPageId] : []);
      setActivePageId(initialPageId);
      setStylesOpen(false);
      setRestGoOpen(false);
      setRestGoVisited(false);
      setRestGoSection('connection');

      setActiveWorkspace('page');
      setActiveView('design');
      selectionManager.clear();
      designerController.clear();
      setPreviewUrl(null);
      previewActiveRef.current = false;
      setPreviewActive(false);
      setCompiledStylesCss('');
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
      setBottomPanelTab('output');
      setApiClientTesterComponentId(null);
      setMenuConfiguratorComponentId(null);
      setDataGridConfiguratorComponentId(null);
      setRepeatingGroupConfiguratorComponentId(null);
      setReportBuilderComponentId(null);
      setCurrentRowBindingsComponentId(null);
      setComboBoxConfiguratorComponentId(null);
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
    const current = projectController.getSnapshot();
    if (observedProjectRevisionRef.current === current.revision) return;
    observedProjectRevisionRef.current = current.revision;
    const saveContext = previewSaveContextRef.current;
    // Save may prune empty handlers. That clean revision belongs to this run;
    // authored edits and project changes must still invalidate it.
    if (
      saveContext !== null &&
      !current.dirty &&
      current.project?.id === saveContext.projectId &&
      current.rootPath === saveContext.rootPath
    )
      return;
    buildRequestRef.current += 1;
    if (!previewBuildPendingRef.current) setBuilding(false);
    setBuildDiagnostics([]);
    setPreviewUrl(null);
    previewActiveRef.current = false;
    setPreviewActive(false);
  }, [projectController, projectState.revision]);

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
        project?.reusableElements.find((reusableElement) => reusableElement.id === pageId) ??
        project?.sourceFiles?.find((file) => file.id === pageId) ??
        project?.assets?.find((asset) => asset.id === pageId);
      if (document === undefined) return;
      setOpenPageIds((current) => (current.includes(pageId) ? current : [...current, pageId]));
      setActivePageId(pageId);
      setActiveWorkspace('page');
      setActiveView(project?.sourceFiles?.some((file) => file.id === pageId) ? 'code' : 'design');
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

  const openRestGo = useCallback((): void => {
    if (!project) return;
    setRestGoOpen(true);
    setRestGoVisited(true);
    setActiveWorkspace('restgo');
    selectionManager.clear();
  }, [project, selectionManager]);

  const updateActivePage = useCallback(
    (nextPage: PageModel): void => {
      if (!activePage || nextPage === activePage) return;
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
    (
      type: string,
      point: { x: number; y: number },
      requestedParentId: string,
      beforeComponentId?: string | null,
    ): void => {
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
        const parentBounds = designerInsertionBounds(
          parent,
          activePage,
          document.querySelector<HTMLElement>('.wr-page-surface'),
          zoom / 100,
        );
        const bounds = projectInsertionBounds(
          appearsOnCanvas ? point : { x: 0, y: 0 },
          definition.defaultBounds,
          parentBounds,
          project?.settings.snapToGrid ? project.settings.gridSize : undefined,
        );
        const createdNode = componentRegistry.createComponent(type, {
          existingNames: activePage.components,
          parentId,
          x: bounds.x,
          y: bounds.y,
        }) as ComponentNode;
        const node = definition.visual
          ? applyDefaultComponentStyle(createdNode, project?.styles ?? [])
          : createdNode;
        const siblingIndex = beforeComponentId ? parent.children.indexOf(beforeComponentId) : -1;
        commitDesignerCommand(
          new AddComponentCommand(node, {
            parentId,
            ...(siblingIndex >= 0 ? { siblingIndex } : {}),
          }),
        );
        setSelectedPaletteType(null);
        selectionManager.selectSingle(node.id);
        addOutput('DESIGNER', `Added ${node.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activePage, addOutput, commitDesignerCommand, project, reportError, selectionManager, zoom],
  );

  const addReusableElementAt = useCallback(
    (
      reusableElementId: string,
      point: { x: number; y: number },
      requestedParentId: string,
      beforeComponentId?: string | null,
    ): void => {
      const reusable = project?.reusableElements.find((item) => item.id === reusableElementId);
      if (!project || !activePage || !reusable) {
        return;
      }
      try {
        if (activeDocumentKind === 'reusable' && reusableElementId === activePage.id) {
          throw new Error('A reusable component cannot contain an instance of itself.');
        }
        const reusableRoot = getComponent(reusable, reusable.rootComponentId);
        const parent = getComponent(activePage, requestedParentId);
        const parentBounds = designerInsertionBounds(
          parent,
          activePage,
          document.querySelector<HTMLElement>('.wr-page-surface'),
          zoom / 100,
        );
        const bounds = projectInsertionBounds(
          point,
          reusable,
          parentBounds,
          project.settings.snapToGrid ? project.settings.gridSize : undefined,
        );
        const node = componentRegistry.createComponent('WebReusableElement', {
          existingNames: activePage.components,
          parentId: requestedParentId,
          x: bounds.x,
          y: bounds.y,
          width: reusable.width,
          height: reusable.height,
          props: { reusableElementId },
        }) as ComponentNode;
        const placement = {
          ...node,
          layout: {
            ...node.layout,
            item: { ...reusableRoot.layout.item },
          },
        };
        const siblingIndex = beforeComponentId ? parent.children.indexOf(beforeComponentId) : -1;
        commitDesignerCommand(
          new AddComponentCommand(placement, {
            parentId: requestedParentId,
            ...(siblingIndex >= 0 ? { siblingIndex } : {}),
          }),
        );
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
      zoom,
    ],
  );

  const moveComponents = useCallback(
    (ids: readonly string[], delta: { x: number; y: number }): void => {
      if (!activePage) return;
      try {
        const topLevelIds = normalizeTopLevelIds(activePage, ids);
        const groups = new Map<string, string[]>();
        for (const id of topLevelIds) {
          if (id === activePage.rootComponentId) continue;
          const component = getComponent(activePage, id);
          if (!component.parentId) continue;
          groups.set(component.parentId, [...(groups.get(component.parentId) ?? []), id]);
        }
        // Designer geometry already accounts for responsive dimensions, intrinsic
        // content, padding and zoom. Persist its delta without applying fallback bounds again.
        const commands = [...groups.values()].map(
          (group) => new MoveCommand(group, delta, { snapToGrid: false, constrainToParent: false }),
        );
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

  const reparentComponents = useCallback(
    (
      ids: readonly string[],
      parentId: string,
      bounds: ReadonlyMap<string, Bounds>,
      beforeComponentId: string | null,
    ): void => {
      try {
        commitDesignerCommand(
          new ReparentComponentsCommand(ids, parentId, bounds, beforeComponentId),
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

  const duplicateStyle = useCallback(
    (styleId: string): string | null => {
      try {
        const style = projectController.duplicateStyle(styleId);
        addOutput('PROJECT', 'Duplicated style ' + style.name + '.');
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
        const definition = componentRegistry.get(component.type);
        const eventDefinition = (
          definition?.eventsForNode?.(component, {
            document: activePage,
            reusableElements: project?.reusableElements,
          }) ?? definition?.events
        )?.find((candidate) => candidate.name === eventName);
        const handlerName =
          component.events[eventName] ?? eventHandlerName(pageClassName(component.name), eventName);
        const key = sourceKey(activePage, activeDocumentKind);
        const currentSource =
          projectState.userSources[key] ?? createUserSource(activePage, activeDocumentKind);
        const edit = ensureEventHandler(currentSource, {
          className: pageClassName(activePage.name),
          componentName: pageClassName(component.name),
          componentType: component.type,
          eventName,
          eventType: eventDefinition?.eventType,
          eventDetailType: eventDefinition?.eventDetailType,
          eventDetailProperties: eventDefinition?.eventDetailProperties,
          currentRowType: currentRowHandlerType(activePage, component.id),
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
      } else if (action === 'menu-configurator') {
        setMenuConfiguratorComponentId(
          menuInspectorTarget(component, {
            document: activePage ?? undefined,
            reusableElements: project?.reusableElements,
          })?.id ?? component.id,
        );
      } else if (action === 'data-grid-configurator') {
        setDataGridConfiguratorComponentId(component.id);
      } else if (action === 'repeating-group-configurator') {
        setRepeatingGroupConfiguratorComponentId(component.id);
      } else if (action === 'report-builder') {
        setReportBuilderComponentId(component.id);
      } else if (action === 'current-row-bindings') {
        setCurrentRowBindingsComponentId(component.id);
      } else if (action === 'combo-box-configurator') {
        setComboBoxEditorMode('api');
        setComboBoxConfiguratorComponentId(component.id);
      } else if (action === 'combo-box-items' || action === 'combo-box-values') {
        setComboBoxEditorMode(action === 'combo-box-items' ? 'items' : 'values');
        setComboBoxConfiguratorComponentId(component.id);
      }
    },
    [selectionManager, activePage, project?.reusableElements],
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

  const saveReportTemplate = useCallback(
    (template: WebReportTemplate): void => {
      if (activePage === null || reportBuilderComponent === null) return;
      try {
        updateActivePage(
          designerController.executeMany(activePage, 'Configure Report Builder', [
            new ChangePropertyCommand(reportBuilderComponent.id, 'reportTemplate', template),
          ]),
        );
        setReportBuilderComponentId(null);
        addOutput('DESIGNER', `Configured Report Builder ${reportBuilderComponent.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      reportBuilderComponent,
      designerController,
      updateActivePage,
      addOutput,
      reportError,
    ],
  );

  const saveRepeatingGroupConfiguration = useCallback(
    (configuration: RepeatingGroupConfiguration): void => {
      if (activePage === null || repeatingGroupConfiguratorComponent === null) return;
      try {
        const fields = repeatingGroupSource(activePage.components, configuration).fields;
        const commands = [
          new ChangePropertyCommand(
            repeatingGroupConfiguratorComponent.id,
            'repeatingGroupConfig',
            configuration,
          ),
        ];
        for (const component of activePage.components) {
          if (
            currentRowGroup(component, activePage.components)?.id !==
            repeatingGroupConfiguratorComponent.id
          )
            continue;
          const bindings = normalizeCurrentRowBindings(component.props.currentRowBindings);
          const definition = componentRegistry.get(component.type);
          const properties =
            definition === undefined ? [] : getCurrentRowBindableProperties(definition);
          const nextBindings = bindings.filter((binding) =>
            properties.some(
              (property) =>
                property.name === binding.property &&
                fields.some(
                  (field) =>
                    field.path === binding.fieldPath && compatibleCurrentRowField(property, field),
                ),
            ),
          );
          if (nextBindings.length !== bindings.length)
            commands.push(
              new ChangePropertyCommand(component.id, 'currentRowBindings', nextBindings),
            );
        }
        updateActivePage(
          designerController.executeMany(activePage, 'Configure Repeating Group', commands),
        );
        setRepeatingGroupConfiguratorComponentId(null);
        addOutput(
          'DESIGNER',
          `Configured Repeating Group ${repeatingGroupConfiguratorComponent.name}.`,
        );
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      repeatingGroupConfiguratorComponent,
      designerController,
      updateActivePage,
      addOutput,
      reportError,
    ],
  );

  const saveCurrentRowBindings = useCallback(
    (bindings: readonly CurrentRowBinding[]): void => {
      if (activePage === null || currentRowBindingsComponent === null) return;
      try {
        updateActivePage(
          designerController.executeMany(activePage, 'Bind Current Row', [
            new ChangePropertyCommand(
              currentRowBindingsComponent.id,
              'currentRowBindings',
              bindings,
            ),
          ]),
        );
        setCurrentRowBindingsComponentId(null);
        addOutput('DESIGNER', `Bound current row values for ${currentRowBindingsComponent.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      currentRowBindingsComponent,
      designerController,
      updateActivePage,
      addOutput,
      reportError,
    ],
  );

  const saveComboBoxConfiguration = useCallback(
    (configuration: ComboBoxConfiguration | null): void => {
      if (!activePage || comboBoxConfiguratorComponent === null) return;
      try {
        const next = designerController.executeMany(activePage, 'Configure ComboBox', [
          new ChangePropertyCommand(
            comboBoxConfiguratorComponent.id,
            'comboBoxConfig',
            configuration,
          ),
        ]);
        updateActivePage(next);
        setComboBoxConfiguratorComponentId(null);
        addOutput('DESIGNER', `Configured ComboBox ${comboBoxConfiguratorComponent.name}.`);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      comboBoxConfiguratorComponent,
      designerController,
      updateActivePage,
      addOutput,
      reportError,
    ],
  );

  const saveComboBoxItems = useCallback(
    (items: readonly string[], values: readonly string[]): void => {
      if (activePage === null || comboBoxConfiguratorComponent === null) return;
      try {
        const next = designerController.executeMany(activePage, 'Edit ComboBox items', [
          new ChangePropertyCommand(comboBoxConfiguratorComponent.id, 'items', [...items]),
          new ChangePropertyCommand(comboBoxConfiguratorComponent.id, 'values', [...values]),
        ]);
        updateActivePage(next);
        setComboBoxConfiguratorComponentId(null);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [activePage, comboBoxConfiguratorComponent, designerController, updateActivePage, reportError],
  );

  const saveMenuConfiguration = useCallback(
    (configuration: WebMenuConfiguration): void => {
      if (!activePage || !menuConfiguratorComponent) return;
      try {
        const next = designerController.executeMany(
          menuConfiguratorDocument ?? activePage,
          'Configure Menu',
          [new ChangePropertyCommand(menuConfiguratorComponent.id, 'configuration', configuration)],
        );
        if (next.id === activePage.id) updateActivePage(next);
        else projectController.updateReusableElement(next.id, () => next);
        setMenuConfiguratorComponentId(null);
      } catch (error) {
        reportError(error, 'DESIGNER');
      }
    },
    [
      activePage,
      menuConfiguratorComponent,
      designerController,
      updateActivePage,
      reportError,
      menuConfiguratorDocument,
      projectController,
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

  const saveRestGoSettings = useCallback(
    (settings: RestGoProjectSettings): void => {
      projectController.updateProjectSettings({ restGo: settings });
      addOutput('PROJECT', 'Updated RestGo connection settings. Save the project to persist them.');
    },
    [projectController, addOutput],
  );

  const synchronizeRestGoClients = useCallback(
    (catalog: RestGoAdminCatalog, projectId: string, baseUrl: string): string | undefined => {
      const result = synchronizeProjectRestGoClients(
        projectController,
        designerController,
        projectId,
        baseUrl,
        restGoCatalogToPublishedApis(catalog),
      );
      if (result.updated > 0)
        addOutput(
          'PROJECT',
          `Updated ${String(result.updated)} RestGo API Client(s). Save the project to persist them.`,
        );
      return result.issues.length > 0
        ? `Some API Clients could not be synchronized: ${result.issues.join(' ')}`
        : undefined;
    },
    [projectController, designerController, addOutput],
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
    async (
      name: string,
      templateId: ProjectTemplateId,
      themePresetId: ProjectThemePresetId,
    ): Promise<void> => {
      setCreatingProject(true);
      setNewProjectError(null);
      try {
        const session = await projectController.create(name, templateId, themePresetId);
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
      setMenuConfiguratorComponentId(null);
      releaseMonacoWorkspace();
      setOpenPageIds([]);
      setActivePageId(null);
      setStylesOpen(false);
      setActiveWorkspace('page');
      selectionManager.clear();
      designerController.clear();
      setRestGoOpen(false);

      setRestGoVisited(false);
      stylesCompileRequestRef.current += 1;
      setPreviewUrl(null);
      setCompiledStylesCss('');
      setBuildDiagnostics([]);
      setMonacoMarkers([]);
      setApiClientTesterComponentId(null);
      setDataGridConfiguratorComponentId(null);
      setComboBoxConfiguratorComponentId(null);
      setRepeatingGroupConfiguratorComponentId(null);
      setReportBuilderComponentId(null);
      setCurrentRowBindingsComponentId(null);
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
    (name: string, templateId?: string): void => {
      const kind = addDocumentDialogKind;
      if (!project || kind === null) return;
      try {
        if (kind === 'model' || kind === 'unit') {
          const file = projectController.addSourceFile(kind, name);
          setOpenPageIds((current) => [...current, file.id]);
          setActivePageId(file.id);
          setActiveWorkspace('page');
          setActiveView('code');
          selectionManager.clear();
          setAddDocumentDialogKind(null);
          addOutput('PROJECT', `Added ${kind} ${name}.`);
          return;
        }
        const template = REUSABLE_COMPONENT_TEMPLATES.find(
          (entry) => entry.id === (templateId ?? 'blank'),
        );
        const created =
          kind === 'page'
            ? createPage(name)
            : (template?.create(name) ?? createReusableElement(name));
        const document = {
          ...created,
          components: created.components.map((node) =>
            kind === 'reusable' && node.id === created.rootComponentId
              ? node
              : applyDefaultComponentStyle(node, project.styles),
          ),
        };
        if (kind === 'page') projectController.addPage(document);
        else projectController.addReusableElement(document, template?.createSource?.(document));
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

  const importProjectAsset = useCallback(async (): Promise<void> => {
    const current = projectController.getSnapshot();
    if (!current.project || !current.rootPath) return;
    try {
      const asset = await window.webrad.project.importAsset(current.rootPath);
      if (
        asset === null ||
        projectController.getSnapshot().project?.id !== current.project.id ||
        projectController.getSnapshot().rootPath !== current.rootPath
      )
        return;
      projectController.addAsset(asset);
      setOpenPageIds((ids) => [...ids, asset.id]);
      setActivePageId(asset.id);
      setActiveWorkspace('page');
      setActiveView('design');
      selectionManager.clear();
      addOutput('PROJECT', `Imported asset ${asset.fileName}.`);
    } catch (error) {
      reportError(error, 'PROJECT');
    }
  }, [projectController, addOutput, reportError, selectionManager]);

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

  const deleteProjectResource = useCallback(
    (id: string): void => {
      if (!project) return;
      const source = project.sourceFiles?.find((file) => file.id === id);
      const asset = project.assets?.find((candidate) => candidate.id === id);
      const name = source?.name ?? asset?.fileName;
      if (
        !name ||
        !window.confirm(
          `Delete ${source?.kind ?? 'asset'} ${name} from this project? References in your code will not be changed.`,
        )
      )
        return;
      try {
        if (source) projectController.removeSourceFile(id);
        else projectController.removeAsset(id);
        const fallbackId = project.pages[0]?.id ?? null;
        setOpenPageIds((current) => {
          const remaining = current.filter((openId) => openId !== id);
          return activePageId === id && fallbackId && !remaining.includes(fallbackId)
            ? [...remaining, fallbackId]
            : remaining;
        });
        if (activePageId === id) {
          setActivePageId(fallbackId);
          setActiveView('design');
        }
        selectionManager.clear();
        addOutput('PROJECT', `Deleted ${source?.kind ?? 'asset'} ${name}.`);
      } catch (error) {
        reportError(error, 'PROJECT');
      }
    },
    [activePageId, addOutput, project, projectController, reportError, selectionManager],
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

  const navigateDebugLocation = useCallback(
    (location: DebugLocation): void => {
      const current = projectController.getSnapshot();
      if (!current.project) return;
      const document =
        current.project.pages.find((page) => sourceKey(page, 'page') === location.path) ??
        current.project.reusableElements.find(
          (page) => sourceKey(page, 'reusable') === location.path,
        ) ??
        current.project.sourceFiles?.find((file) => projectSourceFilePath(file) === location.path);
      if (!document) return;
      openPage(document.id);
      setActiveView('code');
      setNavigateTo({
        resource: sourceUri(current.rootPath, current.project.id, location.path),
        line: location.line,
        column: location.column,
        requestId: ++navigationRequestRef.current,
      });
    },
    [openPage, projectController],
  );
  const showDebugger = useCallback((): void => {
    setVisiblePanels((current) => ({ ...current, output: true }));
    setBottomPanelTab('debug');
  }, []);
  const acceptDebugDiagnostics = useCallback((diagnostics: readonly BuildDiagnostic[]): void => {
    setBuildDiagnostics(diagnostics);
    if (diagnostics.some((item) => item.category === 'error')) setBottomPanelTab('problems');
  }, []);
  const debuggerSession = useDebugger({
    controller: projectController,
    project,
    onOutput: addOutput,
    onShow: showDebugger,
    onNavigate: navigateDebugLocation,
    onDiagnostics: acceptDebugDiagnostics,
  });
  const {
    busy: debugBusy,
    command: debugCommand,
    start: debugStart,
    active: debugActive,
    state: debugState,
  } = debuggerSession;

  const configureDeploy = useCallback(() => {
    setProjectSettingsInitialSection('build');
    setProjectSettingsDialogOpen(true);
  }, []);
  const acceptDeployResult = useCallback(
    (result: DeployResponse): void => {
      setBuildDiagnostics(result.diagnostics);
      addOutput(
        'COMPILER',
        result.success
          ? `Deploy completed: ${result.fileCount ?? 0} files in ${result.outputDirectory ?? ''}.`
          : 'Deploy failed. See Problems for details.',
      );
      if (!result.success) {
        setBottomPanelTab('problems');
        setVisiblePanels((current) => ({ ...current, output: true }));
      }
    },
    [addOutput],
  );
  const acceptNativeBuildResult = useCallback(
    (result: NativeBuildResponse, exportingCi: boolean): void => {
      setBuildDiagnostics(result.diagnostics);
      addOutput(
        'COMPILER',
        result.cancelled
          ? 'Build Application cancelled.'
          : result.success
            ? `${exportingCi ? 'CI project exported' : 'Build Application completed'}: ${result.outputDirectory ?? ''}.`
            : 'Build Application failed. See Problems for details.',
      );
      if (!result.success && !result.cancelled) {
        setBottomPanelTab('problems');
        setVisiblePanels((current) => ({ ...current, output: true }));
      }
    },
    [addOutput],
  );
  const nativeBuild = useBuildApplication({
    controller: projectController,
    isBlocked: (): boolean => building || debugBusy || debugActive || deploy.busy,
    onResult: acceptNativeBuildResult,
  });
  const { open: openBuildApplication, busy: nativeBuildBusy } = nativeBuild;
  const deploy = useDeploy({
    controller: projectController,
    blocked: building || debugBusy || debugActive || nativeBuild.busy,
    onConfigure: configureDeploy,
    onResult: acceptDeployResult,
  });
  const { run: deployProject } = deploy;
  const modalOpen =
    updates.state.status === 'installing' ||
    aboutDialogOpen ||
    newProjectDialogOpen ||
    addDocumentDialogKind !== null ||
    iconPickerOpen ||
    projectSettingsDialogOpen ||
    nativeBuild.state !== null ||
    deploy.state !== null ||
    apiClientTesterComponent !== null ||
    menuConfiguratorComponent !== null ||
    dataGridConfiguratorComponent !== null ||
    repeatingGroupConfiguratorComponent !== null ||
    reportBuilderComponent !== null ||
    (currentRowBindingsComponent !== null && currentRowBindingsGroup !== undefined) ||
    comboBoxConfiguratorComponent !== null;

  const stopPreview = useCallback((): void => {
    previewActiveRef.current = false;
    setPreviewActive(false);
    setPreviewUrl(null);
    const returnFocus = previewReturnFocusRef.current;
    previewReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus();
    });
  }, []);

  const runProject = useCallback(async (): Promise<void> => {
    const initial = projectController.getSnapshot();
    if (!initial.project || !initial.rootPath) return;
    if (
      previewActiveRef.current ||
      previewBuildPendingRef.current ||
      building ||
      debugBusy ||
      deploy.busy ||
      nativeBuild.busy
    )
      return;
    previewReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previewActiveRef.current = true;
    previewBuildPendingRef.current = true;
    previewSaveContextRef.current = { projectId: initial.project.id, rootPath: initial.rootPath };
    setPreviewActive(true);
    setPreviewUrl(null);
    let requestId = (buildRequestRef.current += 1);
    setBuilding(true);
    setBuildDiagnostics([]);
    addOutput('COMPILER', 'Build started.');
    try {
      await debugCommand('stop');
      if (!previewActiveRef.current) return;
      await projectController.save();
      const current = projectController.getSnapshot();
      if (!current.project || !current.rootPath) throw new Error('The project is no longer open.');
      if (
        requestId !== buildRequestRef.current ||
        !previewActiveRef.current ||
        current.project.id !== initial.project.id ||
        current.rootPath !== initial.rootPath
      )
        return;
      // Accept the saved model before issuing the build, including when its
      // revision effect has not run yet. Later edits retain normal invalidation.
      observedProjectRevisionRef.current = current.revision;
      previewSaveContextRef.current = null;
      requestId = buildRequestRef.current += 1;
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
        !previewActiveRef.current ||
        latest.rootPath !== buildRootPath ||
        latest.revision !== buildRevision
      ) {
        addOutput('COMPILER', 'Ignored an outdated build result after the project changed.');
        return;
      }
      setBuildDiagnostics(result.diagnostics);
      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
        addOutput('COMPILER', `Build completed in ${result.outputDirectory ?? 'dist'}.`);
      } else {
        setPreviewUrl(null);
        if (!result.diagnostics.some((diagnostic) => diagnostic.category === 'error')) {
          setBuildDiagnostics([
            ...result.diagnostics,
            { category: 'error', message: 'The compiler did not produce a runnable preview.' },
          ]);
        }
        setVisiblePanels((currentPanels) => ({ ...currentPanels, output: true }));
        setBottomPanelTab('problems');
        addOutput('COMPILER', 'Build failed. See Problems for details.');
      }
    } catch (error) {
      if (requestId === buildRequestRef.current && previewActiveRef.current) {
        setBuildDiagnostics([{ category: 'error', message: asError(error).message }]);
        setVisiblePanels((current) => ({ ...current, output: true }));
        setBottomPanelTab('problems');
        reportError(error, 'COMPILER');
      }
    } finally {
      previewSaveContextRef.current = null;
      previewBuildPendingRef.current = false;
      setBuilding(false);
    }
  }, [
    addOutput,
    projectController,
    reportError,
    building,
    debugBusy,
    deploy.busy,
    nativeBuild.busy,
    debugCommand,
  ]);

  const executeCommand = useCallback(
    (command: IdeCommand, target?: 'designer'): void => {
      // Native menu commands must not reach the hidden authoring workspace.
      if (previewActiveRef.current && command !== 'run.stop' && command !== 'file.exit') return;
      // Native menu accelerators bypass the inert workbench and DOM event propagation.
      if (
        modalOpen &&
        !(
          command === 'view.toggleTheme' &&
          (dataGridConfiguratorComponent !== null ||
            comboBoxConfiguratorComponent !== null ||
            repeatingGroupConfiguratorComponent !== null ||
            reportBuilderComponent !== null ||
            currentRowBindingsComponent !== null)
        )
      ) {
        return;
      }
      if (target !== 'designer' && command.startsWith('edit.')) {
        const editTarget = editCommandTarget(
          codeEditorVisible,
          activeWorkspace === 'page' && activePage !== null && activeView === 'design',
          document.activeElement,
        );
        if (editTarget === 'editor') {
          window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: command }));
          return;
        }
        if (editTarget === 'text') {
          executeTextEditingCommand(command);
          return;
        }
      }
      switch (command) {
        case 'help.checkUpdates':
          void checkForUpdates();
          break;
        case 'help.about':
          setAboutDialogOpen(true);
          break;
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
          if (activeWorkspace === 'page' && activePage !== null) setActiveView('design');
          break;
        case 'view.code':
          if (activeWorkspace === 'page') setActiveView('code');
          break;
        case 'view.preview':
          void runProject();
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
        case 'project.addModel':
          openAddDocumentDialog('model');
          break;
        case 'project.addUnit':
          openAddDocumentDialog('unit');
          break;
        case 'project.importAsset':
          void importProjectAsset();
          break;
        case 'project.build':
        case 'run.run':
          void runProject();
          break;
        case 'run.stop':
          if (previewActiveRef.current) stopPreview();
          break;
        case 'project.deploy':
          void deployProject();
          break;
        case 'project.buildApplication':
          openBuildApplication();
          break;
        case 'view.debugger':
          showDebugger();
          break;
        case 'debug.start':
          if (!building && !deploy.busy && !nativeBuildBusy && project) {
            setActiveWorkspace('page');
            setActiveView('code');
            void debugStart();
          }
          break;
        case 'debug.pause':
          if (debugState.status === 'running') void debugCommand('pause');
          break;
        case 'debug.stepOver':
        case 'debug.stepInto':
        case 'debug.stepOut':
          if (debugState.status === 'paused')
            void debugCommand(
              command === 'debug.stepOver'
                ? 'stepOver'
                : command === 'debug.stepInto'
                  ? 'stepInto'
                  : 'stepOut',
            );
          break;
        case 'debug.stop':
          void debugCommand('stop');
          break;
        case 'debug.restart':
          if (debugActive) void debugCommand('restart');
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
      checkForUpdates,
      addPageToProject,
      addReusableElementToProject,
      openAddDocumentDialog,
      importProjectAsset,
      activeWorkspace,
      activePage,
      activeView,
      codeEditorVisible,
      modalOpen,
      closeProject,
      copySelection,
      deleteSelection,
      openNewProjectDialog,
      openProject,
      pasteSelection,
      redo,
      runProject,
      stopPreview,
      deployProject,
      deploy.busy,
      openBuildApplication,
      nativeBuildBusy,
      saveProject,
      undo,
      dataGridConfiguratorComponent,
      comboBoxConfiguratorComponent,
      repeatingGroupConfiguratorComponent,
      reportBuilderComponent,
      currentRowBindingsComponent,
      showDebugger,
      debugStart,
      debugCommand,
      debugActive,
      debugState.status,
      building,
      project,
    ],
  );

  useEffect(() => window.webrad.commands.subscribe(executeCommand), [executeCommand]);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat || modalOpen) return;
      if (event.key === 'F5') {
        event.preventDefault();
        executeCommand(
          event.shiftKey
            ? event.ctrlKey || event.metaKey
              ? 'debug.restart'
              : 'debug.stop'
            : 'debug.start',
        );
      } else if (event.key === 'F10' || event.key === 'F11') {
        event.preventDefault();
        executeCommand(
          event.key === 'F10'
            ? 'debug.stepOver'
            : event.shiftKey
              ? 'debug.stepOut'
              : 'debug.stepInto',
        );
      } else if (event.key === 'F9' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        executeCommand('run.run');
      }
    };
    // Capture F12 before Monaco consumes it for definition navigation.
    const viewKeyHandler = (event: KeyboardEvent): void => {
      if (
        event.key !== 'F12' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        modalOpen ||
        previewActiveRef.current ||
        activeWorkspace !== 'page' ||
        activePage === null ||
        activeSourceFile ||
        activeAsset
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setActiveView((current) => (current === 'design' ? 'code' : 'design'));
      if (activeView !== 'design') setSidebarMode('builder');
    };
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keydown', viewKeyHandler, true);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('keydown', viewKeyHandler, true);
    };
  }, [
    activeView,
    activeWorkspace,
    activePage,
    activeSourceFile,
    activeAsset,
    executeCommand,
    modalOpen,
  ]);

  const documents: readonly DocumentTab[] = useMemo(() => {
    const pageDocuments: readonly DocumentTab[] = openPageIds.flatMap<DocumentTab>((id) => {
      const page = project?.pages.find((candidate) => candidate.id === id);
      if (page !== undefined) {
        return [{ id, label: page.name, dirty: projectState.dirty, kind: 'page' as const }];
      }
      const sourceFile = project?.sourceFiles?.find((candidate) => candidate.id === id);
      const asset = project?.assets?.find((candidate) => candidate.id === id);
      if (sourceFile || asset)
        return [
          {
            id,
            label: sourceFile ? `${sourceFile.name}.ts` : (asset?.fileName ?? ''),
            dirty: projectState.dirty,
            kind: 'code',
          },
        ];
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
    return [
      ...pageDocuments,
      ...(stylesOpen
        ? [
            {
              id: STYLES_DOCUMENT_ID,
              label: 'Styles',
              dirty: projectState.dirty,
              kind: 'styles' as const,
            },
          ]
        : []),
      ...(restGoOpen
        ? [{ id: RESTGO_DOCUMENT_ID, label: 'RestGo', dirty: false, kind: 'restgo' as const }]
        : []),
    ];
  }, [openPageIds, project, projectState.dirty, stylesOpen, restGoOpen]);

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
        ) ??
        project.sourceFiles?.find((file) => projectSourceFilePath(file) === relativePath);
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

  const pageEditorContent = stylesActive ? (
    <ErrorBoundary area="Styles">
      <StylesWorkspace
        themes={project?.settings.themes}
        previewTheme={projectPreviewTheme}
        onPreviewThemeChange={setProjectPreviewTheme}
        onUpdateThemes={(themes, linkDefaults) => {
          projectController.updateThemes(themes, linkDefaults);
          addOutput('PROJECT', 'Updated application themes.');
        }}
        styles={project?.styles ?? []}
        selectedComponentType={styleComponentType}
        onSelectComponentType={setStyleComponentType}
        compiledCss={compiledStylesCss}
        onCreateStyle={createStyle}
        onDuplicateStyle={duplicateStyle}
        onUpdateStyle={updateStyle}
        onDeleteStyle={deleteStyle}
      />
    </ErrorBoundary>
  ) : activeAsset ? (
    <ProjectAssetPreview asset={activeAsset} />
  ) : activeSourceFile ? (
    <ErrorBoundary area="Monaco">
      <CodeEditor
        sourcePath={projectSourceFilePath(activeSourceFile)}
        debugBreakpoints={debuggerSession.breakpoints}
        debugLocation={debuggerSession.location}
        debugHoverContext={debuggerSession.hoverContext}
        debugging={debuggerSession.active || debuggerSession.busy}
        onToggleBreakpoint={debuggerSession.toggleBreakpoint}
        onBreakpointsMoved={debuggerSession.moveBreakpoints}
        path={sourceUri(
          projectState.rootPath,
          project?.id ?? 'project',
          projectSourceFilePath(activeSourceFile),
        )}
        value={projectState.userSources[projectSourceFilePath(activeSourceFile)] ?? ''}
        theme={theme}
        breadcrumb={[
          project?.name ?? 'Project',
          activeSourceFile.kind === 'model' ? 'Models' : 'Units',
          `${activeSourceFile.name}.ts`,
        ]}
        extraLibraries={extraLibraries}
        pageComponents={[]}
        projectSources={projectSources}
        buildProblems={buildProblems}
        navigateTo={navigateTo}
        onSourceChange={updateEditorSource}
        onMarkersChange={setMonacoMarkers}
        onCursorChange={setCursor}
        onSave={() => void saveProject()}
      />
    </ErrorBoundary>
  ) : !activePage ? null : activeView === 'design' ? (
    <ErrorBoundary area="Designer">
      <DesignerSurface
        previewTheme={projectPreviewTheme}
        page={activePage}
        reusableElements={project?.reusableElements}
        styles={project?.styles}
        compiledStylesCss={compiledStylesCss}
        settings={project?.settings ?? DEFAULT_PROJECT_SETTINGS}
        selectedIds={selection.ids}
        selectedPaletteType={selectedPaletteType}
        onCancelInsertion={cancelPaletteInsertion}
        zoom={zoom}
        onSelect={(ids, primaryId) => selectionManager.set(ids, primaryId)}
        onAddComponent={addComponentAt}
        onAddReusableElement={addReusableElementAt}
        onMoveComponents={moveComponents}
        onReorderComponents={reorderComponents}
        onReparentComponents={reparentComponents}
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
  ) : (
    <ErrorBoundary area="Monaco">
      <CodeEditor
        sourcePath={activeSourceKey ?? undefined}
        debugBreakpoints={debuggerSession.breakpoints}
        debugLocation={debuggerSession.location}
        debugHoverContext={debuggerSession.hoverContext}
        debugging={debuggerSession.active || debuggerSession.busy}
        onToggleBreakpoint={debuggerSession.toggleBreakpoint}
        onBreakpointsMoved={debuggerSession.moveBreakpoints}
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
  );

  const editorContent = (
    <>
      {project !== null && restGoVisited && (
        <div hidden={!restGoActive} style={{ height: '100%', minHeight: 0 }}>
          <ErrorBoundary area="RestGo integration">
            <RestGoWorkspace
              key={project.id}
              projectId={project.id}
              settings={project.settings.restGo}
              section={restGoSection}
              onSectionChange={setRestGoSection}
              onSaveSettings={saveRestGoSettings}
              onCatalogChange={synchronizeRestGoClients}
            />
          </ErrorBoundary>
        </div>
      )}
      {!restGoActive && pageEditorContent}
    </>
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
  return (
    <ProjectVisualResources
      themes={project?.settings.themes}
      themeMode={projectPreviewTheme}
      assets={project?.assets ?? []}
    >
      <style data-webrad-themes>
        {projectThemeCss(project?.settings.themes ?? DEFAULT_PROJECT_SETTINGS.themes, {
          layered: true,
        })}
      </style>
      <div
        className={
          previewActive ? 'wr-ide-modal-host wr-ide-preview-suspended' : 'wr-ide-modal-host'
        }
        inert={modalOpen || previewActive ? true : undefined}
        aria-hidden={modalOpen || previewActive ? true : undefined}
      >
        <IdeShell
          toolbar={
            <Toolbar
              updateState={updates.state}
              onUpdate={() => {
                void updates.update();
              }}
              onCommand={executeCommand}
              canSave={project !== null && !projectState.saving}
              canRun={
                project !== null &&
                projectState.rootPath !== null &&
                !building &&
                !deploy.busy &&
                !nativeBuild.busy
              }
              canBuildApplication={
                project !== null &&
                projectState.rootPath !== null &&
                !building &&
                !deploy.busy &&
                !nativeBuild.busy &&
                !debugBusy &&
                !debugActive
              }
              documents={documents}
              activeDocumentId={
                restGoActive ? RESTGO_DOCUMENT_ID : stylesActive ? STYLES_DOCUMENT_ID : activePageId
              }
              onSelectDocument={(id) => {
                if (id === STYLES_DOCUMENT_ID) openStyles();
                else if (id === RESTGO_DOCUMENT_ID) openRestGo();
                else openPage(id);
              }}
              onCloseDocument={(id) => {
                if (id === RESTGO_DOCUMENT_ID) {
                  setRestGoOpen(false);
                  if (activeWorkspace === 'restgo') setActiveWorkspace('page');
                  return;
                }
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
                (activePage !== null || activeSourceFile !== undefined) &&
                (activeView === 'code' ||
                  (activePage !== null && designerController.canUndo(activePage)))
              }
              canRedo={
                (activePage !== null || activeSourceFile !== undefined) &&
                (activeView === 'code' ||
                  (activePage !== null && designerController.canRedo(activePage)))
              }
              projectName={project?.name}
              dirty={projectState.dirty}
              saving={projectState.saving}
              building={building}
              debugStatus={debugState.status}
              debugBusy={debugBusy}
              issueCount={problemCounts.total}
              onShowProblems={() => {
                setVisiblePanels((current) => ({ ...current, output: true }));
                setBottomPanelTab('problems');
              }}
            />
          }
          explorer={
            stylesActive ? (
              <StyleComponentList
                styles={project?.styles ?? []}
                selectedType={styleComponentType}
                onSelect={setStyleComponentType}
              />
            ) : restGoActive && project !== null ? (
              <RestGoSidebar
                section={restGoSection}
                onSelect={setRestGoSection}
                enabled={project.settings.restGo.enabled}
                baseUrl={project.settings.restGo.baseUrl}
              />
            ) : (
              <DesignerSidebar
                previewTheme={projectPreviewTheme}
                onPreviewThemeChange={setProjectPreviewTheme}
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
                        activeResourceId={stylesActive || restGoActive ? null : activePageId}
                        onOpenResource={openPage}
                        onDeleteResource={deleteProjectResource}
                        onDuplicateItem={(id) => {
                          try {
                            const copyId = projectController.duplicateProjectItem(id);
                            const currentProject = projectController.getSnapshot().project;
                            setOpenPageIds((current) => [...current, copyId]);
                            setActivePageId(copyId);
                            setActiveWorkspace('page');
                            setActiveView(
                              currentProject?.sourceFiles?.some((file) => file.id === copyId)
                                ? 'code'
                                : 'design',
                            );
                            selectionManager.clear();
                          } catch (error) {
                            reportError(error, 'PROJECT');
                          }
                        }}
                        activePageId={
                          stylesActive || restGoActive || activeDocumentKind === 'reusable'
                            ? null
                            : activePageId
                        }
                        onOpenPage={openPage}
                        onAddPage={addPageToProject}
                        onDeletePage={deletePage}
                        onRenamePage={renamePage}
                        activeReusableElementId={
                          stylesActive || restGoActive || activeDocumentKind !== 'reusable'
                            ? null
                            : activePageId
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
            )
          }
          palette={
            visiblePanels.palette && !restGoActive && !stylesActive ? (
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
                    const containerBounds = designerInsertionBounds(
                      selectedContainer,
                      activePage,
                      document.querySelector<HTMLElement>('.wr-page-surface'),
                      zoom / 100,
                    );
                    addComponentAt(
                      type,
                      {
                        x: Math.round((containerBounds.width - definition.defaultBounds.width) / 2),
                        y: Math.round(
                          (containerBounds.height - definition.defaultBounds.height) / 2,
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
              stylesActive={stylesActive}
              restGoActive={restGoActive}
              projectActive={!restGoActive && sidebarMode === 'project'}
              hasProject={project !== null}
              outputVisible={visiblePanels.output}
              onShowProject={() => {
                setActiveWorkspace('page');
                setVisiblePanels((current) => ({ ...current, explorer: true }));
                setSidebarMode('project');
              }}
              onOpenStyles={openStyles}
              onOpenSettings={() => {
                setProjectSettingsInitialSection('general');
                setProjectSettingsDialogOpen(true);
              }}
              onOpenRestGo={openRestGo}
              onToggleOutput={() =>
                setVisiblePanels((current) => ({ ...current, output: !current.output }))
              }
            />
          }
          editor={
            <EditorWorkspace
              documents={documents}
              activeDocumentId={
                restGoActive ? RESTGO_DOCUMENT_ID : stylesActive ? STYLES_DOCUMENT_ID : activePageId
              }
              activeView={activeView}
              onSelectView={(view) => {
                if (view === 'design' && (activeSourceFile || activeAsset)) return;
                setActiveWorkspace('page');
                setActiveView(view);
                if (view === 'design') setSidebarMode('builder');
              }}
            >
              {editorContent}
            </EditorWorkspace>
          }
          inspector={
            visiblePanels.inspector &&
            !stylesActive &&
            !restGoActive &&
            !activeSourceFile &&
            !activeAsset ? (
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
                debugContent={
                  project ? (
                    <DebuggerPanel
                      key={project.id}
                      state={debuggerSession.state}
                      bridge={debuggerSession.bridge}
                      breakpoints={debuggerSession.settings.breakpoints}
                      watches={debuggerSession.settings.watches}
                      pauseOnExceptions={debuggerSession.settings.pauseOnExceptions}
                      selectedFrameId={debuggerSession.selectedFrameId}
                      busy={debugBusy}
                      canStart={!building}
                      onAction={(action) => void debuggerSession.command(action)}
                      onStart={() => executeCommand('debug.start')}
                      onToggleBreakpoint={debuggerSession.toggleBreakpoint}
                      onUpdateBreakpoint={debuggerSession.updateBreakpoint}
                      onRemoveBreakpoint={debuggerSession.removeBreakpoint}
                      onClearBreakpoints={debuggerSession.clearBreakpoints}
                      onWatchesChange={debuggerSession.setWatches}
                      onExceptionModeChange={debuggerSession.setExceptionMode}
                      onSelectFrame={debuggerSession.selectFrame}
                      onNavigateLocation={navigateDebugLocation}
                    />
                  ) : (
                    <div className="wr-empty-state compact">Open a project to debug its code.</div>
                  )
                }
              />
            ) : null
          }
          bottomMinimumHeight={bottomPanelTab === 'debug' ? 300 : 96}
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
      {previewActive && (
        <PreviewWorkspace
          projectName={project?.name ?? 'Application'}
          url={previewUrl}
          building={building}
          diagnostics={buildDiagnostics}
          onStop={stopPreview}
        />
      )}
      {updates.state.status === 'installing' && <UpdateInstallingDialog />}
      {aboutDialogOpen && <AboutDialog onClose={() => setAboutDialogOpen(false)} />}

      {newProjectDialogOpen && (
        <NewProjectDialog
          busy={creatingProject}
          error={newProjectError}
          onClearError={() => setNewProjectError(null)}
          onCancel={() => {
            setNewProjectDialogOpen(false);
            setNewProjectError(null);
          }}
          onCreate={(name, templateId, themePresetId) =>
            void submitNewProject(name, templateId, themePresetId)
          }
        />
      )}
      {addDocumentDialogKind !== null && project !== null && (
        <AddPageDialog
          key={addDocumentDialogKind}
          kind={addDocumentDialogKind}
          suggestedName={(() => {
            const occupiedNames = new Set([
              ...(project.sourceFiles ?? [])
                .filter((file) => file.kind === addDocumentDialogKind)
                .map((file) => file.name),
              ...project.pages.map((page) => page.name),
              ...project.reusableElements.map((reusableElement) => reusableElement.name),
            ]);
            const prefix = { page: 'Page', reusable: 'Reusable', model: 'Model', unit: 'Unit' }[
              addDocumentDialogKind
            ];
            let sequence = addDocumentDialogKind === 'page' ? 2 : 1;
            while (
              [...occupiedNames].some(
                (name) =>
                  portableFileNameKey(name) === portableFileNameKey(`${prefix}${String(sequence)}`),
              )
            )
              sequence += 1;
            return `${prefix}${String(sequence)}`;
          })()}
          occupiedNames={[
            ...(project.sourceFiles ?? [])
              .filter((file) => file.kind === addDocumentDialogKind)
              .map((file) => file.name),
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
          initialSectionId={projectSettingsInitialSection}
          onChooseDeployDirectory={async () => {
            const rootPath = projectController.getSnapshot().rootPath;
            return rootPath ? window.webrad.deploy.chooseDirectory(rootPath) : null;
          }}
          onChooseNativeDirectory={async () => {
            const rootPath = projectController.getSnapshot().rootPath;
            return rootPath ? window.webrad.nativeBuild.chooseDirectory(rootPath) : null;
          }}
          onClose={() => setProjectSettingsDialogOpen(false)}
          onSave={saveProjectSettings}
        />
      )}
      {deploy.state !== null && <DeployDialog state={deploy.state} onClose={deploy.close} />}
      {nativeBuild.state !== null && project !== null && (
        <BuildApplicationDialog
          settings={project.settings.nativeApplication}
          build={nativeBuild}
          hostPlatform={window.webrad.platform}
        />
      )}
      {apiClientTesterComponent !== null && (
        <ApiClientTesterDialog
          component={apiClientTesterComponent}
          restGoSettings={project?.settings.restGo}
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
      {menuConfiguratorComponent !== null && (
        <MenuConfigurationDialog
          key={menuConfiguratorComponent.id}
          component={menuConfiguratorComponent}
          pages={project?.pages ?? []}
          assets={project?.assets ?? []}
          onSave={saveMenuConfiguration}
          onClose={() => setMenuConfiguratorComponentId(null)}
        />
      )}
      {repeatingGroupConfiguratorComponent !== null && (
        <RepeatingGroupConfigurationDialog
          component={repeatingGroupConfiguratorComponent}
          availableComponents={activePage?.components ?? []}
          onClose={() => setRepeatingGroupConfiguratorComponentId(null)}
          onSave={saveRepeatingGroupConfiguration}
        />
      )}
      {reportBuilderComponent !== null && (
        <ReportBuilderDialog
          component={reportBuilderComponent}
          availableComponents={activePage?.components ?? []}
          onClose={() => setReportBuilderComponentId(null)}
          onSave={saveReportTemplate}
        />
      )}
      {currentRowBindingsComponent !== null && currentRowBindingsGroup !== undefined && (
        <CurrentRowBindingsDialog
          component={currentRowBindingsComponent}
          group={currentRowBindingsGroup}
          availableComponents={activePage?.components ?? []}
          onClose={() => setCurrentRowBindingsComponentId(null)}
          onSave={saveCurrentRowBindings}
        />
      )}
      {comboBoxConfiguratorComponent !== null && comboBoxEditorMode === 'api' && (
        <ComboBoxConfigurationDialog
          component={comboBoxConfiguratorComponent}
          availableComponents={activePage?.components ?? []}
          onClose={() => setComboBoxConfiguratorComponentId(null)}
          onSave={saveComboBoxConfiguration}
        />
      )}
      {comboBoxConfiguratorComponent !== null && comboBoxEditorMode !== 'api' && (
        <ComboBoxItemsDialog
          component={comboBoxConfiguratorComponent}
          focusField={comboBoxEditorMode}
          onClose={() => setComboBoxConfiguratorComponentId(null)}
          onSave={saveComboBoxItems}
        />
      )}
    </ProjectVisualResources>
  );
}
