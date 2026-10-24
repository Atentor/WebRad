function pageSource(
  name: string,
  imports: string,
  body: string,
  release = '',
  lifecycle: { readonly trackActivity?: boolean; readonly trackDisposal?: boolean } = {},
): string {
  const trackDisposal = lifecycle.trackDisposal !== false;
  const trackActivity = lifecycle.trackActivity === true;
  return `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { ${name}Generated } from './${name}.generated';
${imports}
export class ${name} extends ${name}Generated {
${trackDisposal ? '  private demoDisposed = false;\n' : ''}${trackActivity ? '  private pageActive = false;\n' : ''}
${body}
  private stopAuroraSidebar: (() => void) | undefined;
  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
${trackActivity ? '    this.pageActive = true;\n' : ''}
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }
  public ReleaseSidebar(): void {
${trackActivity ? '    this.pageActive = false;\n' : ''}
    ${release}
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }
  public override dispose(): void {
${trackDisposal ? '    this.demoDisposed = true;\n' : ''}
    this.ReleaseSidebar();
    super.dispose();
  }
}
`;
}

export const AURORA_NONVISUAL_SOURCES: Readonly<Record<string, string>> = {
  'pages/Pokemon.ts': pageSource(
    'Pokemon',
    `
type PokemonListResult = Awaited<ReturnType<PokemonGenerated['PokeApi']['ListPokemon']['execute']>>;
type PokemonDetail = Awaited<ReturnType<PokemonGenerated['PokeApi']['GetPokemon']['execute']>>;
`,
    `
  private offset = 0;
  private total = 0;
  private request: AbortController | undefined;
  private readonly listCache = new Map<number, PokemonListResult>();
  private readonly detailCache = new Map<string, PokemonDetail>();

  private refreshActions(): void {
    const ready = this.request === undefined;
    this.LoadPokemonButton.enabled = ready;
    this.SearchPokemonButton.enabled = ready;
    this.PokemonList.enabled = ready;
    this.PreviousPokemon.enabled = ready && this.offset > 0;
    this.NextPokemon.enabled = ready && this.offset + 12 < this.total;
  }

  public async LoadPokemon(): Promise<void> { await this.loadList(this.offset); }
  public async PreviousPage(): Promise<void> { await this.loadList(Math.max(0, this.offset - 12)); }
  public async NextPage(): Promise<void> {
    if (this.offset + 12 < this.total) await this.loadList(this.offset + 12);
  }

  private async loadList(offset: number): Promise<void> {
    if (this.request || this.demoDisposed) return;
    const controller = new AbortController();
    this.request = controller;
    this.refreshActions();
    this.PokemonStatus.value = 'Loading Pokemon from PokeAPI...';
    try {
      let result = this.listCache.get(offset);
      if (!result) {
        result = await this.PokeApi.ListPokemon.execute({ query: { limit: 12, offset }, signal: controller.signal });
        if (controller.signal.aborted || this.demoDisposed) return;
        this.listCache.set(offset, result);
      }
      this.offset = offset;
      this.total = result.count;
      this.PokemonList.items = result.results.map((pokemon) => pokemon.name);
      this.PokemonList.selectedIndex = -1;
      this.PokemonStatus.value = 'Showing ' + (offset + 1) + '-' + (offset + result.results.length) + ' of ' + result.count + ' Pokemon. Select a name for details.';
    } catch (error) {
      if (!controller.signal.aborted && !this.demoDisposed)
        this.PokemonStatus.value = 'PokeAPI request failed. Check your connection and try again. ' + (error instanceof Error ? error.message : String(error));
    } finally {
      if (this.request === controller) this.request = undefined;
      if (!this.demoDisposed) this.refreshActions();
    }
  }

  public async SelectPokemon(): Promise<void> {
    const name = this.PokemonList.value;
    if (!name) return;
    this.PokemonSearch.value = name;
    await this.FindPokemon();
  }

  public async FindPokemon(): Promise<void> {
    if (this.request || this.demoDisposed) return;
    const query = this.PokemonSearch.value.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(query)) {
      this.PokemonDetails.value = 'Enter a Pokemon name (for example pikachu) or numeric ID.';
      return;
    }
    const controller = new AbortController();
    this.request = controller;
    this.refreshActions();
    this.PokemonDetails.value = 'Loading ' + query + '...';
    try {
      let pokemon = this.detailCache.get(query);
      if (!pokemon) {
        this.PokeApi.GetPokemon.Endpoint = 'pokemon/' + encodeURIComponent(query) + '/';
        pokemon = await this.PokeApi.GetPokemon.execute({ signal: controller.signal });
        if (controller.signal.aborted || this.demoDisposed) return;
        this.detailCache.set(pokemon.name, pokemon);
        this.detailCache.set(String(pokemon.id), pokemon);
      }
      this.PokemonDetails.value = '#' + pokemon.id + ' ' + pokemon.name + '\\nHeight: ' + (pokemon.height / 10) + ' m / Weight: ' + (pokemon.weight / 10) + ' kg\\nBase experience: ' + (pokemon.base_experience ?? 'not provided');
    } catch (error) {
      if (!controller.signal.aborted && !this.demoDisposed)
        this.PokemonDetails.value = 'Could not find this Pokemon. Check its name or ID and your connection. ' + (error instanceof Error ? error.message : String(error));
    } finally {
      if (this.request === controller) this.request = undefined;
      if (!this.demoDisposed) this.refreshActions();
    }
  }
`,
    `this.request?.abort();`,
  ),

  'pages/Timer.ts': pageSource(
    'Timer',
    `import type { WebTimer, WebTimerEventDetail } from '@webrad/runtime';
`,
    `
  public ApplyTimer(): void {
    try {
      this.DemoTimer.time = Number(this.TimerInterval.value);
      this.DemoTimer.loop = this.TimerLoop.checked;
      this.TimerStatus.value = 'Settings applied: ' + this.DemoTimer.time + ' ms, Loop ' + (this.DemoTimer.loop ? 'on' : 'off') + '.';
    } catch (error) {
      this.TimerStatus.value = error instanceof Error ? error.message : String(error);
    }
  }
  public StartTimer(): void { this.DemoTimer.Start(); }
  public StopTimer(): void { this.DemoTimer.Stop(); }
  public RestartTimer(): void { this.DemoTimer.Restart(); }
  public TimerStarted(): void {
    this.TimerProgress.value = 0;
    this.TimerStatus.value = 'OnStart: timer running.';
  }
  public TimerTick(_sender: WebTimer, event: CustomEvent<WebTimerEventDetail>): void {
    this.TimerProgress.value = (event.detail.tick % 10) * 10;
    this.TimerStatus.value = 'OnTimer: tick ' + event.detail.tick + ', interval ' + this.DemoTimer.time + ' ms.';
  }
  public TimerStopped(): void {
    this.TimerStatus.value = 'OnStop: stopped after ' + this.DemoTimer.tickCount + ' tick(s).';
  }
`,
    `this.DemoTimer.Stop();`,
    { trackDisposal: false },
  ),

  'pages/Files.ts': pageSource(
    'Files',
    `import { RestGO } from '@webrad/runtime';
import type { WebFileUpload, WebFileUploadProgressEventDetail, WebVideoUpload, WebVideoUploadProgressEventDetail, WebVideoUploadStateEventDetail } from '@webrad/runtime';
`,
    `
  private fileUpload: AbortController | undefined;
  private videoBusy = false;

  private async requireUploadSession(): Promise<void> {
    const session = await RestGO.getSession();
    if (session.error) throw session.error;
    if (!session.data) throw new Error('Sign in to your RestGO account before sending files.');
  }

  public async SignInUploads(): Promise<void> {
    this.UploadLoginButton.enabled = false;
    try {
      const result = await RestGO.login(this.UploadEmail.value.trim(), this.UploadPassword.value);
      if (!result.sucess) throw result.error;
      if (!this.demoDisposed) this.UploadAuthStatus.value = 'Signed in to RestGO. Sending files is now available for your account.';
    } catch (error) {
      if (!this.demoDisposed) this.UploadAuthStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      if (!this.demoDisposed) { this.UploadPassword.value = ''; this.UploadLoginButton.enabled = true; }
    }
  }
  public async ChooseFile(): Promise<void> {
    try {
      const file = await this.FileService.OpenFile();
      if (file && !this.demoDisposed) {
        this.FileProgress.visible = true;
        this.FileProgress.value = 0;
        this.FileStatus.value = file.name + ' / ' + file.size + ' bytes / ' + (file.extension || 'no extension') + '. Selected locally; nothing has been sent.';
      }
    } catch (error) { if (!this.demoDisposed) this.FileStatus.value = error instanceof Error ? error.message : String(error); }
  }
  public ClearFile(): void {
    try { this.FileService.Clear(); this.FileProgress.value = 0; this.FileStatus.value = 'Selection cleared.'; }
    catch (error) { this.FileStatus.value = error instanceof Error ? error.message : String(error); }
  }
  public async SendFile(): Promise<void> {
    if (this.fileUpload) return;
    const controller = new AbortController();
    this.fileUpload = controller;
    this.SendFileButton.enabled = false;
    try {
      if (!this.FileService.selection) throw new Error('Select a file first.');
      await this.requireUploadSession();
      controller.signal.throwIfAborted();
      if (!this.pageActive || this.demoDisposed) return;
      const result = await this.FileService.SendToRestGO({ isPublic: false, signal: controller.signal });
      if (!this.demoDisposed) this.FileStatus.value = 'Stored private file ' + result.id + ': ' + result.url;
    } catch (error) { if (!this.demoDisposed) this.FileStatus.value = error instanceof Error ? error.message : String(error); }
    finally { this.fileUpload = undefined; if (!this.demoDisposed) this.SendFileButton.enabled = true; }
  }
  public FileProgressChanged(_sender: WebFileUpload, event: CustomEvent<WebFileUploadProgressEventDetail>): void {
    this.FileProgress.visible = event.detail.percentage !== null;
    if (event.detail.percentage !== null) this.FileProgress.value = event.detail.percentage;
    this.FileStatus.value = event.detail.percentage === null ? 'Uploading file; total size is not reported.' : 'Uploading file: ' + Math.round(event.detail.percentage) + '% (awaiting server confirmation).';
  }
  public async ChooseVideo(): Promise<void> {
    try {
      const video = await this.VideoService.OpenFile();
      if (video && !this.demoDisposed) {
        this.VideoUploadProgress.value = 0;
        this.VideoUploadStatus.value = video.name + ' / ' + video.size + ' bytes / ' + (video.duration === null ? 'duration unavailable' : video.duration.toFixed(1) + ' seconds') + '. Selected locally.';
      }
    } catch (error) { if (!this.demoDisposed) this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error); }
  }
  public async SendVideo(): Promise<void> { await this.uploadVideo(false); }
  public async ResumeVideo(): Promise<void> { await this.uploadVideo(true); }
  private async uploadVideo(resume: boolean): Promise<void> {
    if (this.videoBusy) return;
    this.videoBusy = true;
    this.SendUploadVideo.enabled = false;
    this.ResumeUploadVideo.enabled = false;
    try {
      if (!this.VideoService.selection) throw new Error('Select a video first.');
      await this.requireUploadSession();
      if (this.demoDisposed || !this.pageActive) return;
      const result = resume ? await this.VideoService.Resume() : await this.VideoService.SendToRestGO({ isPublic: false });
      if (!this.demoDisposed) this.VideoUploadStatus.value = 'Original video stored: ' + result.id + '. Conversion may still be running on RestGO.';
    } catch (error) { if (!this.demoDisposed) this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error); }
    finally {
      this.videoBusy = false;
      if (!this.demoDisposed) { this.SendUploadVideo.enabled = true; this.ResumeUploadVideo.enabled = true; }
    }
  }
  public PauseVideo(): void { this.VideoService.Pause(); }
  public async CancelVideo(): Promise<void> {
    try { await this.VideoService.CancelUpload(); }
    catch (error) { if (!this.demoDisposed) this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error); }
  }
  public VideoProgressChanged(_sender: WebVideoUpload, event: CustomEvent<WebVideoUploadProgressEventDetail>): void {
    this.VideoUploadProgress.value = event.detail.percentage;
    this.VideoUploadStatus.value = 'Confirmed ' + event.detail.confirmedBytes + ' of ' + event.detail.totalBytes + ' bytes (' + Math.round(event.detail.percentage) + '%).';
  }
  public VideoStateChanged(_sender: WebVideoUpload, event: CustomEvent<WebVideoUploadStateEventDetail>): void {
    this.VideoUploadStatus.value = 'Video upload state: ' + event.detail.state;
  }
`,
    `this.fileUpload?.abort(); this.VideoService.Pause();`,
    { trackActivity: true },
  ),

  'pages/Reports.ts': pageSource(
    'Reports',
    '',
    `
  private generation: AbortController | undefined;
  public async PreviewReport(): Promise<void> { await this.generate('modal'); }
  public async DownloadReport(): Promise<void> { await this.generate('download'); }
  public CloseReport(): void { this.DemoReport.ClosePreview(); }
  private async generate(previewMode: 'modal' | 'download'): Promise<void> {
    if (this.generation) return;
    const controller = new AbortController();
    this.generation = controller;
    this.PreviewReportButton.enabled = false;
    this.DownloadReportButton.enabled = false;
    try {
      this.DemoReport.Parameters.Set('Title', this.ReportTitle.value.trim() || 'Aurora report');
      this.DemoReport.Parameters.Set('PreparedFor', this.PreparedFor.value);
      this.DemoReport.Parameters.Set('Notes', this.ReportNotes.value);
      const result = await this.DemoReport.Generate({ previewMode, fileName: 'aurora-report.pdf', signal: controller.signal });
      if (!this.demoDisposed) this.ReportStatus.value = 'Generated ' + result.fileName + ': ' + result.pageCount + ' page(s), ' + result.blob.size + ' bytes.';
    } catch (error) { if (!this.demoDisposed) this.ReportStatus.value = error instanceof Error ? error.message : String(error); }
    finally {
      this.generation = undefined;
      if (!this.demoDisposed) { this.PreviewReportButton.enabled = true; this.DownloadReportButton.enabled = true; }
    }
  }
`,
    `this.generation?.abort(); this.DemoReport.ClosePreview();`,
  ),
};
