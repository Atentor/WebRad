import { AURORA_NONVISUAL_SOURCES } from './aurora-nonvisual-sources.js';
import { AURORA_RESTGO_SOURCES } from './aurora-restgo-sources.js';

/** Initial page/reusable code only. Never reapplied to an existing project. */
export const AURORA_DEMO_SOURCES: Readonly<Record<string, string>> = {
  ...AURORA_NONVISUAL_SOURCES,
  ...AURORA_RESTGO_SOURCES,
  'reusables/AuroraMenu.ts': `import type { WebComponent, WebMenuItem, WebMenuUser } from '@webrad/runtime';
import { bindRestGoMenu } from '../units/AuroraAccount';
import { AuroraMenuGenerated } from './AuroraMenu.generated';

export class AuroraMenu extends AuroraMenuGenerated {
  private readonly stopAccountMenu: () => void;

  public constructor(element: HTMLElement, instanceId: string, componentElements: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>) {
    super(element, instanceId, componentElements, componentIds);
    this.stopAccountMenu = bindRestGoMenu(this.Menu);
  }
  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }
  public setUser(user: WebMenuUser): void { this.Menu.user = user; }
  public setItems(items: readonly WebMenuItem[]): void { this.Menu.items = items; }
  public selectItem(itemId: string): void { this.Menu.selectedItemId = itemId; }
  public override dispose(): void { this.stopAccountMenu(); super.dispose(); }
}
`,
  'pages/index.ts': `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { indexGenerated } from './index.generated';

export class index extends indexGenerated {
  public OpenForm(): void { Navigate('Forms'); }
  public OpenData(): void { Navigate('Data'); }
  public OpenMedia(): void { Navigate('Media'); }

  private stopAuroraSidebar: (() => void) | undefined;

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void { this.ReleaseSidebar(); super.dispose(); }
}
`,
  'reusables/FeatureCard.ts': `import { FeatureCardGenerated } from './FeatureCard.generated';

export class FeatureCard extends FeatureCardGenerated {
  public AdvanceProgress(): void {
    this.CardProgress.value = this.CardProgress.value >= 100 ? 0 : this.CardProgress.value + 10;
    this.CardStatus.caption = 'This instance: ' + this.CardProgress.value + '%';
  }
}
`,
  'pages/Forms.ts': `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { FormsGenerated } from './Forms.generated';

export class Forms extends FormsGenerated {
  public ReviewProfile(): void {
    const name = this.NameEdit.value.trim();
    const email = this.EmailEdit.value.trim();
    if (!name || !email.includes('@') || !email.includes('.')) {
      this.FormStatus.value = 'Enter a name and a valid email to review your profile.';
      return;
    }
    this.SummaryName.caption = 'Name: ' + name;
    this.SummaryEmail.caption = 'Email: ' + email;
    this.SummaryTeam.caption = 'Team: ' + this.TeamCombo.value;
    this.SummaryPreferences.value = 'Email updates: ' + (this.UpdatesCheck.checked ? 'yes' : 'no')
      + ' / Available: ' + (this.AvailableToggle.checked ? 'yes' : 'no');
    this.SummaryInterest.caption = 'Favorite feature: ' + this.InterestList.value;
    this.SummaryNotes.value = 'Notes: ' + this.NotesEdit.value;
    this.ProfilePopup.show();
    this.FormStatus.value = 'Summary prepared from your current values. Nothing was sent to a server.';
  }

  public CloseSummary(): void { this.ProfilePopup.close(); }

  public ResetProfile(): void {
    this.NameEdit.value = 'Alex Morgan';
    this.EmailEdit.value = 'alex@example.com';
    this.TeamCombo.selectedIndex = 1;
    this.UpdatesCheck.checked = true;
    this.AvailableToggle.checked = true;
    this.InterestList.selectedIndex = 0;
    this.NotesEdit.value = 'A workspace built with the Default component styles.';
    this.FormStatus.value = 'Example values restored.';
  }

  public PreferenceChanged(): void {
    this.FormStatus.value = 'Preferences changed. Review your profile to see the current values.';
  }

  private stopAuroraSidebar: (() => void) | undefined;

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void { this.ReleaseSidebar(); super.dispose(); }
}
`,
  'pages/Data.ts': `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { DataGenerated, type ProjectsRepeaterCurrentRow } from './Data.generated';
import type { WebButton, WebCharts, WebChartPointEventDetail, WebDataGrid, WebDataGridCellEventDetail } from '@webrad/runtime';

export class Data extends DataGenerated {
  public async LoadProjects(): Promise<void> {
    this.ReloadProjects.enabled = false;
    this.DataStatus.value = 'Loading bundled example projects...';
    try {
      await this.DemoData.LoadProjects.execute();
      this.DataStatus.value = this.ProjectsRepeater.rowCount + ' example projects loaded from the project JSON asset.';
    } catch (error) {
      this.DataStatus.value = 'Could not load example data: ' + (error instanceof Error ? error.message : String(error));
    } finally {
      this.ReloadProjects.enabled = true;
    }
  }

  public SelectGridProject(_sender: WebDataGrid, event: CustomEvent<WebDataGridCellEventDetail>): void {
    this.SelectedProject.value = 'Selected in Data Grid: ' + (event.detail.getValue<string>('name') ?? 'project');
  }

  public SelectChartProject(_sender: WebCharts, event: CustomEvent<WebChartPointEventDetail>): void {
    this.SelectedProject.value = 'Selected in Charts: ' + event.detail.label + ' (' + event.detail.value + '%)';
  }

  public SelectRepeatedProject(_sender: WebButton, _event: Event, CurrentRow: ProjectsRepeaterCurrentRow): void {
    this.SelectedProject.value = 'Selected in Repeating Group: ' + CurrentRow.value.name;
  }

  private stopAuroraSidebar: (() => void) | undefined;

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void { this.ReleaseSidebar(); super.dispose(); }
}
`,
  'pages/Media.ts': `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import type { WebVideoPlayer } from '@webrad/runtime';
import { MediaGenerated } from './Media.generated';

export class Media extends MediaGenerated {
  private favorite = false;

  public ToggleFavorite(): void {
    this.favorite = !this.favorite;
    this.FavoriteIcon.icon = this.favorite ? 'heart' : 'star';
    this.ImageStatus.value = this.favorite ? 'Illustration added to favorites.' : 'Illustration removed from favorites.';
  }

  public async LoadSampleVideo(): Promise<void> {
    this.StopVideoButton.enabled = false;
    this.LoadVideo.enabled = false;
    this.MediaStatus.value = 'Loading the bundled Sintel sample...';
    try {
      const manifest = new URL('assets/imported/aurora-sintel.mpd', document.baseURI);
      await this.DemoVideo.LoadUrl(manifest.href, { format: 'dash' });
      this.StopVideoButton.enabled = true;
      this.MediaStatus.value = 'The 10-second sample is ready. Use the player controls to play, seek and adjust volume.';
    } catch (error) {
      this.MediaStatus.value = 'Could not load the sample: ' + (error instanceof Error ? error.message : String(error));
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

  public VideoPlaying(): void { this.MediaStatus.value = 'Playing the bundled sample.'; }
  public VideoEnded(): void { this.MediaStatus.value = 'Sample finished. Use Play to watch it again.'; }

  private stopAuroraSidebar: (() => void) | undefined;

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void { this.ReleaseSidebar(); super.dispose(); }
}
`,
  'pages/404.ts': `import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { Page404Generated } from './404.generated';

export class Page404 extends Page404Generated {
  public ReturnHome(): void { Navigate('index'); }

  private stopAuroraSidebar: (() => void) | undefined;

  public OpenRestGoAccount(): void { Navigate('RestGoAccount'); }

  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }

  public ReleaseSidebar(): void {
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }

  public override dispose(): void { this.ReleaseSidebar(); super.dispose(); }
}
`,

  'units/AuroraSidebar.ts': `import type { WebGroup, WebReusableElement } from '@webrad/runtime';

/** Keep the content clear of the left sidebar and its native mobile trigger. */
export function bindAuroraSidebar(menu: WebReusableElement, content: WebGroup): () => void {
  const viewport = menu.element.ownerDocument.defaultView;
  const synchronize = (): void => {
    const mobile = (viewport?.innerWidth ?? 1024) < 768;
    content.marginLeft = mobile ? 0 : menu.width;
    content.marginTop = mobile ? 48 : 0;
  };
  synchronize();
  viewport?.addEventListener('resize', synchronize);
  menu.element.addEventListener('webrad:menu-layout-change', synchronize);
  return () => {
    viewport?.removeEventListener('resize', synchronize);
    menu.element.removeEventListener('webrad:menu-layout-change', synchronize);
  };
}
`,
};
