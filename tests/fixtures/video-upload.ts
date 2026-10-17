import { createHash } from 'node:crypto';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createProject,
  updatePage,
  updateProjectSettings,
} from '@webrad/project-model';
import type { RestGoVideo, RestGoVideoUploadSession } from '@webrad/restgo-sdk';

export const videoUser = {
  id: 'video-user',
  email: 'video@example.test',
  fullName: 'Video User',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};
export function videoRecord(size = 16, id = 'video-1'): RestGoVideo {
  return {
    id,
    ownerId: videoUser.id,
    title: 'Aula',
    descri: 'Descrição',
    isPublic: false,
    sizeBytes: size,
    source: {
      width: 320,
      height: 240,
      codedWidth: 320,
      codedHeight: 240,
      rotation: 0,
      fps: 30,
      frameRate: '30/1',
      duration: 1,
      format: 'webm',
      codec: 'vp8',
      hasAudio: false,
      videoStream: 0,
      audioStream: -1,
      level: 0,
    },
    originalRetained: true,
    status: 'pending',
    progress: null,
    error: '',
    variants: [],
    hasThumbnail: false,
    createdAt: '2026-10-12T12:00:00Z',
    updatedAt: '2026-10-12T12:00:00Z',
  };
}
export function videoBackend(
  options: {
    conflictAfterFirstChunk?: boolean;
    lostCreation?: boolean;
    lostComplete?: boolean;
    failureCode?: number;
    maxChunkBytes?: number;
  } = {},
) {
  const uploads = new Map<
    string,
    { session: RestGoVideoUploadSession; content: Buffer; video: RestGoVideo }
  >();
  const calls: { path: string; method: string; headers: Headers }[] = [];
  let lost = false;
  let lostComplete = false;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname.replace('/proxy/restgo', '');
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    calls.push({ path, method, headers });
    if (path === '/auth/token' || path === '/auth/refresh')
      return json({
        token: path === '/auth/refresh' ? 'video-renewed-jwt' : 'video-jwt',
        expiresAt: '2099-01-01T00:00:00Z',
        refreshToken: `rgr_${(path === '/auth/refresh' ? 'y' : 'x').repeat(43)}`,
        refreshExpiresAt: '2099-02-01T00:00:00Z',
        user: videoUser,
      });
    if (path === '/auth/logout') return json({ success: true });
    if (path === '/auth/session') return json({ success: true, user: videoUser });
    if (!headers.get('Authorization')?.startsWith('Bearer video-'))
      return json({ error: 'Authentication required' }, 401);
    if (path === '/videos/uploads' && method === 'POST') {
      const input = JSON.parse(String(init?.body)) as {
        filename: string;
        sizeBytes: number;
        title?: string;
        descri?: string;
        isPublic?: boolean;
      };
      const id = `upload-${uploads.size + 1}`;
      const session: RestGoVideoUploadSession = {
        id,
        videoId: `video-${uploads.size + 1}`,
        offset: 0,
        sizeBytes: input.sizeBytes,
        state: 'open',
        expiresAt: '2099-01-01T00:00:00Z',
        maxChunkBytes: options.maxChunkBytes ?? 7,
      };
      const video = {
        ...videoRecord(input.sizeBytes, session.videoId),
        title: input.title || input.filename,
        descri: input.descri ?? '',
        isPublic: input.isPublic ?? false,
      };
      uploads.set(id, { session, content: Buffer.alloc(0), video });
      if (options.lostCreation) throw new TypeError('Creation response lost');
      return json(session, 201);
    }
    const upload = [...uploads.values()].find((entry) =>
      path.startsWith(`/videos/uploads/${entry.session.id}`),
    );
    if (upload) {
      if (path.endsWith('/chunks') && method === 'PUT') {
        if (options.failureCode) return json({ error: 'Upload rejected' }, options.failureCode);
        const body = init?.body;
        if (!(body instanceof Blob) || headers.get('Content-Type') !== 'application/octet-stream')
          return json({ error: 'Binary body required' }, 400);
        const content = Buffer.from(await body.arrayBuffer());
        if (Number(headers.get('Upload-Offset')) !== upload.session.offset)
          return json({ error: 'Wrong offset' }, 409);
        if (
          content.length > upload.session.maxChunkBytes ||
          createHash('sha256').update(content).digest('hex') !== headers.get('Upload-Checksum')
        )
          return json({ error: 'Invalid chunk' }, 400);
        upload.content = Buffer.concat([upload.content, content]);
        upload.session.offset += content.length;
        if (options.conflictAfterFirstChunk && !lost) {
          lost = true;
          return json({ error: 'Response lost after commit' }, 409);
        }
        return json(upload.session);
      }
      if (path.endsWith('/complete') && method === 'POST') {
        if (upload.session.offset !== upload.session.sizeBytes)
          return json({ error: 'Incomplete' }, 409);
        upload.session.state = 'completed';
        if (options.lostComplete && !lostComplete) {
          lostComplete = true;
          throw new TypeError('Complete response lost');
        }
        return json(upload.video, 202);
      }
      if (method === 'DELETE') {
        upload.session.state = 'cancelled';
        return json({ status: 'deleting' }, 202);
      }
      return json(upload.session);
    }
    const stored = [...uploads.values()].find((entry) =>
      path.startsWith(`/videos/${entry.video.id}`),
    );
    if (stored) {
      if (path.endsWith('/hls'))
        return json({
          id: stored.video.id,
          title: stored.video.title,
          isPublic: stored.video.isPublic,
          masterUrl: `/videos/${stored.video.id}/hls/generation-1/master.m3u8`,
          thumbnailUrl: `/videos/${stored.video.id}/thumbnail`,
          variants: [],
          duration: 1,
          authentication: 'Authorization',
        });
      stored.video = {
        ...stored.video,
        status: 'ready',
        generation: 'generation-1',
        progress: 100,
      };
      return json({
        video: stored.video,
        jobs: [
          {
            id: 'job-1',
            state: 'ready',
            attempts: 1,
            options: {},
            error: '',
            createdAt: '2026-10-12T12:00:00Z',
            startedAt: null,
            finishedAt: null,
          },
        ],
      });
    }
    return json({ error: 'Missing route' }, 404);
  };
  return { fetcher, calls, uploads };
}

export function videoUploadProject() {
  let project = createProject('RestGoVideoUpload');
  let page = project.pages[0]!;
  const entries = [
    defaultComponentRegistry.createComponent('WebVideoUpload', {
      id: 'video-upload',
      name: 'VideoUpload1',
      parentId: page.rootComponentId,
      props: { chunkSizeBytes: 32, maxFileSizeMB: 5, maxDurationSeconds: 10 },
    }),
    ...['ChooseVideo', 'SendVideo', 'ResumeVideo', 'WaitVideo'].map((name, i) =>
      defaultComponentRegistry.createComponent('WebButton', {
        id: name,
        name,
        parentId: page.rootComponentId,
        y: 60 + i * 50,
        props: { caption: name },
        width: 150,
      }),
    ),
  ];
  for (const entry of entries) page = addComponent(page, entry, page.rootComponentId);
  for (const name of ['ChooseVideo', 'SendVideo', 'ResumeVideo', 'WaitVideo'])
    page = bindComponentEvent(page, name, 'OnClick', name[0]!.toLowerCase() + name.slice(1));
  page = bindComponentEvent(page, 'video-upload', 'OnProgress', 'videoProgress');
  project = updatePage(project, page.id, { components: page.components });
  return updateProjectSettings(project, {
    restGo: {
      enabled: true,
      baseUrl: 'https://restgo.example.test/proxy/restgo',
      apiToken: '',
      persistSession: false,
      apiVersion: 1,
      defaultDatabase: '',
      sessionStorage: 'memory',
      storageKey: 'video-fixture',
    },
  });
}
export function videoUploadMethods(): string {
  return `
  public async chooseVideo(): Promise<void> {
    try { const file = await VideoUpload1.OpenFile(); this.element.dataset.selection = JSON.stringify(file); }
    catch (error) { this.element.dataset.rejected = error instanceof Error ? error.message : String(error); }
  }
  public async sendVideo(): Promise<void> {
    try {
      if (!RestGO.CurrentUser) { const login = await RestGO.login('video@example.test', 'password'); if (!login.sucess) throw login.error; }
      const result = await this.VideoUpload1.SendToRestGO({ title: 'Aula', descri: 'Teste', isPublic: false });
      this.element.dataset.video = JSON.stringify(result);
    } catch (error) { this.element.dataset.uploadError = error instanceof Error ? error.message : String(error); }
  }
  public async resumeVideo(): Promise<void> {
    try { const result = await VideoUpload1.Resume(); this.element.dataset.video = JSON.stringify(result); }
    catch (error) { this.element.dataset.uploadError = error instanceof Error ? error.message : String(error); }
  }
  public async waitVideo(): Promise<void> {
    try { const result = await this.VideoUpload1.WaitUntilReady({ intervalMs: 5, timeoutMs: 2000 }); this.element.dataset.ready = result.id; }
    catch (error) { this.element.dataset.waitError = error instanceof Error ? error.message : String(error); }
  }
  public videoProgress(sender: WebVideoUpload, event: CustomEvent<WebVideoUploadProgressEventDetail>): void {
    this.element.dataset.progress = JSON.stringify(event.detail);
    if (event.detail.confirmedBytes > 0 && this.element.dataset.pauseOnce !== 'done') {
      this.element.dataset.pauseOnce = 'done'; sender.Pause();
    }
  }
`;
}
export function videoUploadUserSources(name: string): Readonly<Record<string, string>> {
  return {
    [`pages/${name}.ts`]: `import type { WebVideoUpload, WebVideoUploadProgressEventDetail } from '@webrad/runtime';
import { ${name}Generated } from './${name}.generated';
export class ${name} extends ${name}Generated {${videoUploadMethods()}}`,
  };
}
