import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { ReportsGenerated } from './Reports.generated';

export class Reports extends ReportsGenerated {
  private demoDisposed = false;

  private generation: AbortController | undefined;
  public async PreviewReport(): Promise<void> {
    await this.generate('modal');
  }
  public async DownloadReport(): Promise<void> {
    await this.generate('download');
  }
  public CloseReport(): void {
    this.DemoReport.ClosePreview();
  }
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
      const result = await this.DemoReport.Generate({
        previewMode,
        fileName: 'aurora-report.pdf',
        signal: controller.signal,
      });
      if (!this.demoDisposed)
        this.ReportStatus.value =
          'Generated ' +
          result.fileName +
          ': ' +
          result.pageCount +
          ' page(s), ' +
          result.blob.size +
          ' bytes.';
    } catch (error) {
      if (!this.demoDisposed)
        this.ReportStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      this.generation = undefined;
      if (!this.demoDisposed) {
        this.PreviewReportButton.enabled = true;
        this.DownloadReportButton.enabled = true;
      }
    }
  }

  private stopAuroraSidebar: (() => void) | undefined;
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }
  public ReleaseSidebar(): void {
    this.generation?.abort();
    this.DemoReport.ClosePreview();
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
