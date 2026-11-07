import { z } from 'zod';

/** Authoring configuration only. Customer attempts, tokens and operations never belong here. */
export const PaymentsPropertiesSchema = z
  .object({
    gatewaySlug: z
      .string()
      .max(100)
      .refine(
        (value) => value === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
        'Use a lowercase gateway slug with digits and hyphens.',
      )
      .optional(),
    mode: z.enum(['payment', 'subscription']).optional(),
    enabled: z.boolean().optional(),
    autoResume: z.boolean().optional(),
    autoWatch: z.boolean().optional(),
    persistAttempts: z.boolean().optional(),
    pollInterval: z.number().int().min(1).max(2147483647).optional(),
    pollTimeout: z.number().int().min(1).max(2147483647).optional(),
  })
  .strict();
