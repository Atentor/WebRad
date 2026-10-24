import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { DataGenerated, type ProjectsRepeaterCurrentRow } from './Data.generated';
import type { WebButton, WebDataGrid, WebDataGridCellEventDetail } from '@webrad/runtime';

export class Data extends DataGenerated {
  public async LoadProjects(): Promise<void> {
    this.ReloadProjects.enabled = false;
    this.DataStatus.value = 'Loading bundled example projects...';
    try {
      await this.DemoData.LoadProjects.execute();
      this.DataStatus.value =
        this.ProjectsRepeater.rowCount + ' example projects loaded from the project JSON asset.';
    } catch (error) {
      this.DataStatus.value =
        'Could not load example data: ' + (error instanceof Error ? error.message : String(error));
    } finally {
      this.ReloadProjects.enabled = true;
    }
  }

  public SelectGridProject(
    _sender: WebDataGrid,
    event: CustomEvent<WebDataGridCellEventDetail>,
  ): void {
    this.SelectedProject.value =
      'Selected in Data Grid: ' + (event.detail.getValue<string>('name') ?? 'project');
  }

  public SelectRepeatedProject(
    _sender: WebButton,
    _event: Event,
    CurrentRow: ProjectsRepeaterCurrentRow,
  ): void {
    this.SelectedProject.value = 'Selected in Repeating Group: ' + CurrentRow.value.name;
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
