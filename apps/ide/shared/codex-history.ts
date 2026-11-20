import { z } from 'zod';

// Persist text and decisions, never executable proposals tied to an old revision.
export const CodexHistoryGroupSchema = z
  .object({
    activeId: z.string().min(1).max(128),
    chats: z
      .array(
        z.object({
          id: z.string().min(1).max(128),
          updatedAt: z.number().finite().nonnegative(),
          draft: z.string().max(24_000),
          messages: z
            .array(
              z.object({
                id: z.string().max(256),
                role: z.enum(['user', 'assistant']),
                text: z.string().max(100_000),
                error: z.boolean().optional(),
                disposition: z.enum(['applied', 'discarded']).optional(),
              }),
            )
            .max(30),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (group) => group.chats.some((chat) => chat.id === group.activeId),
    'Missing active conversation',
  );
export const CodexHistorySchema = z.record(z.string().min(1).max(8192), CodexHistoryGroupSchema);
export type CodexHistoryGroup = z.infer<typeof CodexHistoryGroupSchema>;
export type CodexHistory = z.infer<typeof CodexHistorySchema>;
