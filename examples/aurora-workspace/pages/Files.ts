import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { FilesGenerated } from './Files.generated';
import { RestGO } from '@webrad/runtime';
import type {
  WebFileUpload,
  WebFileUploadProgressEventDetail,
  WebVideoUpload,
  WebVideoUploadProgressEventDetail,
  WebVideoUploadStateEventDetail,
} from '@webrad/runtime';

export class Files extends FilesGenerated {
  private demoDisposed = false;
  private pageActive = false;

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
      if (!this.demoDisposed)
        this.UploadAuthStatus.value =
          'Signed in to RestGO. Sending files is now available for your account.';
    } catch (error) {
      if (!this.demoDisposed)
        this.UploadAuthStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      if (!this.demoDisposed) {
        this.UploadPassword.value = '';
        this.UploadLoginButton.enabled = true;
      }
    }
  }
  public async ChooseFile(): Promise<void> {
    try {
      const file = await this.FileService.OpenFile();
      if (file && !this.demoDisposed) {
        this.FileProgress.visible = true;
        this.FileProgress.value = 0;
        this.FileStatus.value =
          file.name +
          ' / ' +
          file.size +
          ' bytes / ' +
          (file.extension || 'no extension') +
          '. Selected locally; nothing has been sent.';
      }
    } catch (error) {
      if (!this.demoDisposed)
        this.FileStatus.value = error instanceof Error ? error.message : String(error);
    }
  }
  public ClearFile(): void {
    try {
      this.FileService.Clear();
      this.FileProgress.value = 0;
      this.FileStatus.value = 'Selection cleared.';
    } catch (error) {
      this.FileStatus.value = error instanceof Error ? error.message : String(error);
    }
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
      const result = await this.FileService.SendToRestGO({
        isPublic: false,
        signal: controller.signal,
      });
      if (!this.demoDisposed)
        this.FileStatus.value = 'Stored private file ' + result.id + ': ' + result.url;
    } catch (error) {
      if (!this.demoDisposed)
        this.FileStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      this.fileUpload = undefined;
      if (!this.demoDisposed) this.SendFileButton.enabled = true;
    }
  }
  public FileProgressChanged(
    _sender: WebFileUpload,
    event: CustomEvent<WebFileUploadProgressEventDetail>,
  ): void {
    this.FileProgress.visible = event.detail.percentage !== null;
    if (event.detail.percentage !== null) this.FileProgress.value = event.detail.percentage;
    this.FileStatus.value =
      event.detail.percentage === null
        ? 'Uploading file; total size is not reported.'
        : 'Uploading file: ' +
          Math.round(event.detail.percentage) +
          '% (awaiting server confirmation).';
  }
  public async ChooseVideo(): Promise<void> {
    try {
      const video = await this.VideoService.OpenFile();
      if (video && !this.demoDisposed) {
        this.VideoUploadProgress.value = 0;
        this.VideoUploadStatus.value =
          video.name +
          ' / ' +
          video.size +
          ' bytes / ' +
          (video.duration === null
            ? 'duration unavailable'
            : video.duration.toFixed(1) + ' seconds') +
          '. Selected locally.';
      }
    } catch (error) {
      if (!this.demoDisposed)
        this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error);
    }
  }
  public async SendVideo(): Promise<void> {
    await this.uploadVideo(false);
  }
  public async ResumeVideo(): Promise<void> {
    await this.uploadVideo(true);
  }
  private async uploadVideo(resume: boolean): Promise<void> {
    if (this.videoBusy) return;
    this.videoBusy = true;
    this.SendUploadVideo.enabled = false;
    this.ResumeUploadVideo.enabled = false;
    try {
      if (!this.VideoService.selection) throw new Error('Select a video first.');
      await this.requireUploadSession();
      if (this.demoDisposed || !this.pageActive) return;
      const result = resume
        ? await this.VideoService.Resume()
        : await this.VideoService.SendToRestGO({ isPublic: false });
      if (!this.demoDisposed)
        this.VideoUploadStatus.value =
          'Original video stored: ' + result.id + '. Conversion may still be running on RestGO.';
    } catch (error) {
      if (!this.demoDisposed)
        this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      this.videoBusy = false;
      if (!this.demoDisposed) {
        this.SendUploadVideo.enabled = true;
        this.ResumeUploadVideo.enabled = true;
      }
    }
  }
  public PauseVideo(): void {
    this.VideoService.Pause();
  }
  public async CancelVideo(): Promise<void> {
    try {
      await this.VideoService.CancelUpload();
    } catch (error) {
      if (!this.demoDisposed)
        this.VideoUploadStatus.value = error instanceof Error ? error.message : String(error);
    }
  }
  public VideoProgressChanged(
    _sender: WebVideoUpload,
    event: CustomEvent<WebVideoUploadProgressEventDetail>,
  ): void {
    this.VideoUploadProgress.value = event.detail.percentage;
    this.VideoUploadStatus.value =
      'Confirmed ' +
      event.detail.confirmedBytes +
      ' of ' +
      event.detail.totalBytes +
      ' bytes (' +
      Math.round(event.detail.percentage) +
      '%).';
  }
  public VideoStateChanged(
    _sender: WebVideoUpload,
    event: CustomEvent<WebVideoUploadStateEventDetail>,
  ): void {
    this.VideoUploadStatus.value = 'Video upload state: ' + event.detail.state;
  }

  private stopAuroraSidebar: (() => void) | undefined;
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.pageActive = true;
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }
  public ReleaseSidebar(): void {
    this.pageActive = false;
    this.fileUpload?.abort();
    this.VideoService.Pause();
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }
  public override dispose(): void {
    this.demoDisposed = true;
    this.ReleaseSidebar();
    super.dispose();
  }

  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
}
