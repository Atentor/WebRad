import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

const execute = promisify(execFile);

it('finishes initialization checks for POSIX roots and Windows paths while preserving strict errors', async () => {
  const bundled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import ts from 'typescript';
        import { instanceInitializationDiagnostics } from './packages/language/src/component-references';
        const results = [];
        for (const fileName of ['/pages/PageMain.ts', '/PageMain.ts', 'C:/pages/PageMain.ts']) {
          for (const assignment of ['value = 1;', 'if (false) value = 1;']) {
            const source = 'class PageMain { readonly value: number; constructor() { ' + assignment + ' } }';
            const options = { noLib: true, strict: true };
            const host = ts.createCompilerHost(options);
            host.getSourceFile = name => name === fileName
              ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
              : undefined;
            const program = ts.createProgram([fileName], options, host);
            const file = program.getSourceFile(fileName);
            const start = source.indexOf('value =');
            const diagnostics = instanceInitializationDiagnostics(ts, program, file,
              [{ start, end: start + 5, text: 'this.value' }], [{ code: 2564 }]);
            results.push({ fileName, assignment, codes: diagnostics.map(item => item.code) });
          }
        }
        process.stdout.write(JSON.stringify(results));
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['typescript'],
    write: false,
  });
  // A subprocess deadline catches synchronous loops that Vitest's test timeout cannot interrupt.
  const running = execute(process.execPath, ['--input-type=commonjs'], {
    timeout: 10_000,
    windowsHide: true,
  });
  running.child.stdin!.end(bundled.outputFiles[0]!.text);
  const result = await running;
  expect(JSON.parse(result.stdout)).toEqual(
    ['/pages/PageMain.ts', '/PageMain.ts', 'C:/pages/PageMain.ts'].flatMap((fileName) => [
      { fileName, assignment: 'value = 1;', codes: [] },
      { fileName, assignment: 'if (false) value = 1;', codes: [2564] },
    ]),
  );
});
