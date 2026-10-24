import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, parseProject } from '@webrad/project-model';
import { createUserPageSource } from '@webrad/language';
import { compileProject } from '../src/index.js';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});
describe('compiled project resources', () => {
  it('executes imported models and units in Preview and emits exact asset bytes', async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-resources-'));
    directories.push(outputDirectory);
    const project = parseProject({
      ...createProject('Resources'),
      sourceFiles: [
        { id: 'model', name: 'Customer', kind: 'model' },
        { id: 'unit', name: 'Helpers', kind: 'unit' },
      ],
      assets: [
        {
          id: 'asset',
          fileName: 'sample.bin',
          mediaType: 'application/octet-stream',
          base64: 'AP8B',
        },
      ],
    });
    const page = project.pages[0];
    if (!page) throw new Error('Missing page.');
    const source = createUserPageSource(page);
    const userSources = {
      'models/Customer.ts': 'export class Customer { public name: string = "Alice"; }',
      'units/Helpers.ts':
        'import type { Customer } from "../models/Customer"; export function greeting(customer: Customer): string { return "Hello " + customer.name; }',
      'pages/index.ts':
        'import { Customer } from "../models/Customer"; import { greeting } from "../units/Helpers";\n' +
        source +
        '\ndocument.documentElement.dataset.resourceGreeting = greeting(new Customer());',
    };
    const result = await compileProject(project, { outputDirectory, userSources });
    expect(result.diagnostics).toEqual([]);
    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(outputDirectory, 'assets/imported/sample.bin'))).toEqual(
      Buffer.from([0, 255, 1]),
    );
    const dom = new JSDOM(result.previewHtml, {
      runScripts: 'dangerously',
      url: 'http://localhost/preview/index.html',
    });
    try {
      expect(dom.window.document.documentElement.dataset.resourceGreeting).toBe('Hello Alice');
    } finally {
      dom.window.close();
    }
    const invalid = await compileProject(project, {
      outputDirectory,
      write: false,
      userSources: {
        ...userSources,
        'units/Helpers.ts':
          'import type { Customer } from "../models/Customer"; export function greeting(customer: Customer): string { return customer.missing; }',
      },
    });
    expect(invalid.success).toBe(false);
    expect(
      invalid.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === 'typescript' && diagnostic.file?.includes('Helpers.ts'),
      ),
    ).toBe(true);
  }, 120000);
});
