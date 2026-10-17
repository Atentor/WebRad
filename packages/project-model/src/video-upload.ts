import { z } from 'zod';

/** Persistent authoring configuration only; never File/session/token/progress state. */
export const VideoUploadPropertiesSchema = z
  .object({
    accept: z.string().optional(),
    enabled: z.boolean().optional(),
    title: z.string().optional(),
    descri: z.string().optional(),
    isPublic: z.boolean().optional(),
    chunkSizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    maxFileSizeMB: z
      .number()
      .finite()
      .positive()
      .max(Number.MAX_SAFE_INTEGER / (1024 * 1024))
      .nullable()
      .optional(),
    maxDurationSeconds: z.number().finite().positive().nullable().optional(),
  })
  .strict();
