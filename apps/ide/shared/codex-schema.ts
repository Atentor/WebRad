import { z } from 'zod';

const identifier = z.string().min(1).max(128);
const component = z.string().min(1).max(128);
const json = z.string().max(100_000).describe('Valid JSON text for the structured value.');
const propertyValue = z.string().max(100_000).describe(
  'For a text, enum, icon, color or component-reference property, use its literal string, such as center, row or #2563eb. JSON-encoded strings are also accepted. For numbers, booleans, arrays, objects or null references, use valid JSON text.',
);

/** The model can request these operations; it cannot write project files. */
export const CodexOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add'),
    componentType: identifier,
    name: identifier,
    parent: component,
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict(),
  z.object({ kind: z.literal('property'), component, property: identifier, valueJson: propertyValue }).strict(),
  z.object({
    kind: z.literal('layout'), component,
    section: z.enum(['container', 'item']), property: identifier, valueJson: propertyValue,
  }).strict(),
  z.object({
    kind: z.literal('bounds'), component,
    x: z.number().finite(), y: z.number().finite(),
    width: z.number().positive(), height: z.number().positive(),
  }).strict(),
  z.object({ kind: z.literal('remove'), component }).strict(),
  z.object({ kind: z.literal('style'), component, style: z.string().max(128).nullable() }).strict(),
  z.object({ kind: z.literal('event'), component, event: identifier, method: identifier }).strict(),
]);

export const CodexPlanSchema = z.object({
  summary: z.string().min(1).max(8000),
  operations: z.array(CodexOperationSchema).max(200),
  styles: z.array(z.object({
    name: identifier, componentType: identifier, statesJson: json,
  }).strict()).max(30),
  methods: z.array(z.object({ name: identifier, source: z.string().min(1).max(40_000) }).strict()).max(40),
}).strict();

export type CodexOperation = z.infer<typeof CodexOperationSchema>;
export type CodexPlan = z.infer<typeof CodexPlanSchema>;

/** Disjoint operation tags preserve the union contract with Responses' anyOf. */
export function codexPlanOutputSchema() {
  const schema = z.toJSONSchema(CodexPlanSchema, {
    target: 'draft-07',
    override: ({ jsonSchema }) => {
      if (jsonSchema.oneOf) {
        jsonSchema.anyOf = jsonSchema.oneOf;
        delete jsonSchema.oneOf;
      }
    },
  });
  delete schema.$schema;
  return schema;
}

export const CodexConversationEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(8000),
  proposal: CodexPlanSchema.optional(),
  diagnostics: z.array(z.string().max(8000)).max(30).optional(),
  disposition: z.enum(['applied', 'discarded']).optional(),
}).strict();

export type CodexConversationEntry = z.infer<typeof CodexConversationEntrySchema>;

export const CodexPreferencesSchema = z.object({
  executablePath: z.string().max(4096).nullable(),
  model: z.string().min(1).max(128),
  effort: z.string().min(1).max(32),
}).strict();

export const CodexGenerateSchema = z.object({
  requestId: z.uuid(), rootPath: z.string().min(1).max(4096),
  project: z.unknown(), userSources: z.record(z.string(), z.string().max(2_000_000)),
  revision: z.number().int().nonnegative(), documentId: z.string().min(1).max(128),
  selection: z.array(component).max(500), prompt: z.string().trim().min(1).max(24_000),
  conversation: z.array(CodexConversationEntrySchema).max(6),
  model: z.string().min(1).max(128), effort: z.string().min(1).max(32),
}).strict();

export const CodexReviewSchema = CodexGenerateSchema.pick({
  requestId: true,
  rootPath: true,
  project: true,
  userSources: true,
  revision: true,
  documentId: true,
}).extend({ plan: CodexPlanSchema }).strict();
