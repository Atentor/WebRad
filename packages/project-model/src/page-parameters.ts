import { z } from 'zod';
import type { PageParameterDefinition } from '@webrad/runtime';
import { getTypeScriptIdentifierError } from './naming.js';

export type { PageParameterDefinition } from '@webrad/runtime';

export const PageParameterDefinitionSchema: z.ZodType<PageParameterDefinition> = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .refine(
        (name) =>
          getTypeScriptIdentifierError(name) === undefined &&
          !(name in Object.prototype) &&
          name !== 'prototype',
        'Use a valid parameter identifier.',
      ),
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    defaultValue: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((parameter, context) => {
    if (parameter.defaultValue !== undefined && typeof parameter.defaultValue !== parameter.type)
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'The default value must match the parameter type.',
      });
  });

export const PageParametersSchema = z
  .array(PageParameterDefinitionSchema)
  .max(100)
  .superRefine((parameters, context) => {
    const names = new Set<string>();
    parameters.forEach((parameter, index) => {
      if (names.has(parameter.name))
        context.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: 'Parameter names must be unique.',
        });
      names.add(parameter.name);
    });
  });
