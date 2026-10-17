import { z } from 'zod';
import { parseReportTemplate, type WebReportTemplate } from '@webrad/runtime/report-template';

/** The exact same parser validates project files, external templates and the PDF runtime. */
export const ReportTemplateSchema = z.unknown().transform((value, context): WebReportTemplate => {
  try {
    return parseReportTemplate(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid report template.',
    });
    return z.NEVER;
  }
});

export const ReportBuilderPropertiesSchema = z
  .object({
    reportTemplate: ReportTemplateSchema.optional(),
    previewMode: z.enum(['modal', 'new-tab', 'download']).optional(),
    fileName: z.string().min(1).max(255).optional(),
  })
  .passthrough();
