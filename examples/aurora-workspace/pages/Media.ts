import { bindAuroraSidebar } from '../units/AuroraSidebar';
import type { WebVideoPlayer } from '@webrad/runtime';
import { MediaGenerated } from './Media.generated';

export class Media extends MediaGenerated {
  private favorite = false;

  public ToggleFavorite(): void {
    this.favorite = !this.favorite;
    this.FavoriteIcon.icon = this.favorite ? 'heart' : 'star';
    this.ImageStatus.value = this.favorite
      ? 'Illustration added to favorites.'
      : 'Illustration removed from favorites.';
  }

  public async LoadSampleVideo(): Promise<void> {
    this.StopVideoButton.enabled = false;
    this.LoadVideo.enabled = false;
    this.MediaStatus.value = 'Loading the bundled Sintel sample...';
    try {
      const manifest = new URL('assets/imported/aurora-sintel.mpd', document.baseURI);
      await this.DemoVideo.LoadUrl(manifest.href, { format: 'dash' });
      this.StopVideoButton.enabled = true;
      this.MediaStatus.value =
        'The 10-second sample is ready. Use the player controls to play, seek and adjust volume.';
    } catch (error) {
      this.MediaStatus.value =
        'Could not load the sample: ' + (error instanceof Error ? error.message : String(error));
    } finally {
      this.LoadVideo.enabled = true;
    }
  }

  public StopVideo(): void {
    this.DemoVideo.Stop();
    this.MediaStatus.value = 'Playback stopped. Use Play to watch the loaded sample again.';
  }

  public VideoError(_sender: WebVideoPlayer, event: CustomEvent<Error>): void {
    this.StopVideoButton.enabled = false;
    this.MediaStatus.value = 'Video error: ' + event.detail.message;
  }

  public VideoPlaying(): void {
    this.MediaStatus.value = 'Playing the bundled sample.';
  }
  public VideoEnded(): void {
    this.MediaStatus.value = 'Sample finished. Use Play to watch it again.';
  }

  private stopAuroraSidebar: (() => void) | undefined;

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void {
    this.ReleaseSidebar();
    super.dispose();
  }

  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
}
