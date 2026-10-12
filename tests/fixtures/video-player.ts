import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  bindComponentEvent,
  createProject,
  createReusableElement,
  updatePage,
  updateProjectSettings,
  type PageModel,
} from '@webrad/project-model';

export function videoPlayerProject(baseUrl = 'https://restgo.example.test/prefix') {
  let project = createProject('VideoPlayback');
  let page = project.pages[0]!;
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebVideoPlayer', {
      id: 'player',
      name: 'VideoPlayer1',
      parentId: page.rootComponentId,
      x: 20,
      y: 20,
      width: 480,
      height: 270,
      props: { muted: true },
    }),
    page.rootComponentId,
  );
  for (const [i, action] of [
    'Public',
    'Private',
    'Dash',
    'External',
    'Seek',
    'Pause',
    'Play',
    'Stop',
    'Manual',
    'Auto',
    'Unload',
    'Logout',
    'Bad',
    'Redirect',
    'Dispose',
    'End',
  ].entries()) {
    const name = `Button${action}`;
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebButton', {
        id: name,
        name,
        parentId: page.rootComponentId,
        x: 20 + (i % 5) * 100,
        y: 310 + Math.floor(i / 5) * 45,
        width: 96,
        props: { caption: action },
      }),
      page.rootComponentId,
    );
    page = bindComponentEvent(page, name, 'OnClick', `do${action}`);
  }
  for (const [event, handler] of [
    ['OnLoaded', 'loaded'],
    ['OnTimeUpdate', 'timeChanged'],
    ['OnError', 'playerError'],
    ['OnQualityChange', 'qualityChanged'],
  ])
    page = bindComponentEvent(page, 'player', event!, handler!);
  project = updatePage(project, page.id, { components: page.components });
  project = updatePage(project, page.id, {
    components: bindComponentEvent(page, 'player', 'OnEnded', 'ended').components,
  });
  return updateProjectSettings(project, {
    restGo: {
      enabled: true,
      baseUrl,
      apiToken: '',
      apiVersion: 1,
      defaultDatabase: '',
      persistSession: false,
      sessionStorage: 'memory',
      storageKey: 'player-fixture',
    },
  });
}
export function videoPlayerMethods(baseUrl: string): string {
  return `
  private async signIn(): Promise<void> { if (!RestGO.CurrentUser) { const login = await RestGO.login('video@example.test','password'); if (!login.sucess) throw login.error; } }
  private async load(id: string): Promise<void> {
    delete this.element.dataset.playerError; delete this.element.dataset.loadDone; delete this.element.dataset.loadFailure;
    try { await this.VideoPlayer1.LoadRestGo(id); this.element.dataset.loadDone = id; }
    catch (error) { this.element.dataset.loadFailure = error instanceof Error ? error.message : String(error); }
  }
  public async doPublic(): Promise<void> { await this.load('public-video'); }
  public async doPrivate(): Promise<void> { await this.signIn(); await this.load('private-video'); }
  public async doBad(): Promise<void> { await this.signIn(); await this.load('bad-video'); }
  public async doRedirect(): Promise<void> { await this.signIn(); await this.load('redirect-video'); }
  public async doDash(): Promise<void> { await this.VideoPlayer1.LoadUrl(${JSON.stringify(`${baseUrl}/direct/manifest.mpd`)},{format:'dash'}); this.element.dataset.loadDone='dash'; }
  public async doExternal(): Promise<void> { await this.VideoPlayer1.LoadUrl(${JSON.stringify(`${baseUrl}/direct/master.m3u8`)}); this.element.dataset.loadDone='external'; }
  public async doPlay(): Promise<void> { await VideoPlayer1.Play(); }
  public doPause(): void { this.VideoPlayer1.Pause(); }
  public doSeek(): void { this.VideoPlayer1.Seek(Math.min(0.5,this.VideoPlayer1.duration / 2)); this.element.dataset.seeked=String(this.VideoPlayer1.currentTime); }
  public doStop(): void { VideoPlayer1.Stop(); this.element.dataset.stopped=String(VideoPlayer1.currentTime); }
  public async doEnd(): Promise<void> { VideoPlayer1.loop=false; VideoPlayer1.Seek(Math.max(0,VideoPlayer1.duration-0.1)); await VideoPlayer1.Play(); }
  public ended(sender: WebVideoPlayer): void { this.element.dataset.ended=sender.state; }
  public doManual(): void { const available=VideoPlayer1.availableQualities; const quality=available[0]; if (!quality) throw new Error('Missing quality'); this.VideoPlayer1.SetQuality(quality.quality); this.element.dataset.manual=String(this.VideoPlayer1.quality); }
  public doAuto(): void { VideoPlayer1.SetQuality('auto'); this.element.dataset.manual=String(VideoPlayer1.quality); }
  public async doUnload(): Promise<void> { await VideoPlayer1.Unload(); this.element.dataset.unloaded=VideoPlayer1.state; }
  public async doLogout(): Promise<void> { await RestGO.logout(); }
  public doDispose(): void { this.VideoPlayer1.dispose(); this.element.dataset.disposed = VideoPlayer1.state; }
  public loaded(sender: WebVideoPlayer, event: CustomEvent<WebVideoPlayerLoadedEventDetail>): void {
    this.element.dataset.loaded=JSON.stringify(event.detail); this.element.dataset.apiState=sender.state;
  }
  public timeChanged(sender: WebVideoPlayer): void { this.element.dataset.time=String(sender.currentTime); }
  public playerError(sender: WebVideoPlayer): void { this.element.dataset.playerError=sender.error?.message ?? 'unknown'; }
  public qualityChanged(sender: WebVideoPlayer): void { this.element.dataset.quality=String(sender.currentQuality); }
`;
}
export function videoPlayerUserSources(name: string, baseUrl: string) {
  return {
    [`pages/${name}.ts`]: `import type { WebVideoPlayer, WebVideoPlayerLoadedEventDetail } from '@webrad/runtime';
import { ${name}Generated } from './${name}.generated';
export class ${name} extends ${name}Generated {${videoPlayerMethods(baseUrl)}}`,
  };
}
export function reusableVideoPlayerProject(baseUrl: string) {
  const initial = videoPlayerProject(baseUrl);
  const page = initial.pages[0]!;
  const reusable = createReusableElement('MediaCard', { width: 540, height: 560 });
  const children = page.components.filter((node) => node.id !== page.rootComponentId);
  const definition = {
    ...reusable,
    components: [
      { ...reusable.components[0]!, children: children.map((node) => node.id) },
      ...children.map((node) => ({ ...node, parentId: reusable.rootComponentId })),
    ],
  };
  let host: PageModel = {
    ...page,
    width: 1100,
    height: 580,
    components: [{ ...page.components[0]!, children: [] }],
  };
  let project = addReusableElement(initial, definition);
  for (const [i, name] of ['FirstMediaCard', 'SecondMediaCard'].entries()) {
    const next = addComponent(
      host,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: host.rootComponentId,
        x: i * 550,
        width: 540,
        height: 560,
        props: { reusableElementId: definition.id },
      }),
      host.rootComponentId,
    );
    host = { ...next, components: [...next.components] };
  }
  project = updatePage(project, host.id, {
    width: host.width,
    height: host.height,
    components: host.components,
  });
  const sources = {
    'reusables/MediaCard.ts': `import type { WebVideoPlayer, WebVideoPlayerLoadedEventDetail } from '@webrad/runtime';
import { MediaCardGenerated } from './MediaCard.generated'; export class MediaCard extends MediaCardGenerated {${videoPlayerMethods(baseUrl)}}`,
  };
  return { project, sources };
}
