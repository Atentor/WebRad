import { createApiClientDeclarations } from './api-client-declarations.mjs';
import { createFontSources } from './font-sources.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(repositoryRoot, 'packages', 'runtime', 'src');
const outputPath = path.join(repositoryRoot, 'packages', 'compiler', 'src', 'runtime-sources.json');
const sdkRoot = path.join(repositoryRoot, 'packages', 'restgo-sdk', 'src');
const sdkOutputPath = path.join(
  repositoryRoot,
  'packages',
  'compiler',
  'src',
  'restgo-sources.json',
);
const sdkTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'restgo-typings.generated.json',
);
const apiClientTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'api-client-typings.generated.json',
);
const apiClientTypings =
  JSON.stringify(createApiClientDeclarations(repositoryRoot), null, 2) + '\n';
const videoTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'video-upload-typings.generated.json',
);
const videoTypings =
  JSON.stringify(
    createApiClientDeclarations(
      repositoryRoot,
      ['video-file-selection.ts', 'video-upload.ts'],
      (name) => name.startsWith('WebVideo'),
    ),
    null,
    2,
  ) + '\n';
const playerTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'video-player-typings.generated.json',
);
const playerTypings =
  JSON.stringify(
    createApiClientDeclarations(
      repositoryRoot,
      ['video-player-types.ts', 'video-player.ts'],
      (name) => name.startsWith('WebVideoPlayer'),
    ),
    null,
    2,
  ) + '\n';

const repeatingGroupTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'repeating-group-typings.generated.json',
);
const repeatingGroupTypings =
  JSON.stringify(createApiClientDeclarations(repositoryRoot, ['repeating-group.ts']), null, 2) +
  '\n';

const reportBuilderTypingsPath = path.join(
  repositoryRoot,
  'packages',
  'language',
  'src',
  'report-builder-typings.generated.json',
);
const reportSourceNames = [
  'report-template.ts',
  'report-pdf-layout.ts',
  'report-pdf.ts',
  'report-builder.ts',
];
const reportBuilderTypings =
  JSON.stringify(
    createApiClientDeclarations(repositoryRoot, ['report-template.ts', 'report-builder.ts']),
    null,
    2,
  ) + '\n';

const sourceFiles = [
  'api-client.ts',
  'api-client-inputs.ts',
  'api-client-accessors.ts',
  'api-client-store.ts',
  'api-client-selection.ts',
  'api-client-template.ts',
  'component.ts',
  'combo-box-data.ts',
  'data-grid.ts',
  'repeating-group.ts',
  ...reportSourceNames,
  'file-upload.ts',
  'video-file-selection.ts',
  'video-upload.ts',
  'video-player-types.ts',
  'video-player-shaka.ts',
  'video-player.ts',
  'controls.ts',
  'progress-bar.ts',
  'panel-progress.ts',
  'page.ts',
  'page-event-hooks.ts',
  'page-router.ts',
  'globals.ts',
  'icons.ts',
  'image-display.ts',
  'image-resampling.ts',
  'index.ts',
  'layout.ts',
  'render.ts',
  'restgo.ts',
  'restgo-page-events.ts',
  'visual.ts',
];

const sources = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (fileName) => [
      fileName,
      await fs.readFile(path.join(runtimeRoot, fileName), 'utf8'),
    ]),
  ),
);
const expected = `${JSON.stringify(sources, null, 2)}\n`;

async function collectTypeScriptSources(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectTypeScriptSources(path.join(directory, entry.name), relative)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      result.push(relative);
    }
  }
  return result;
}

const sdkFileNames = await collectTypeScriptSources(sdkRoot);
const sdkSources = Object.fromEntries(
  await Promise.all(
    sdkFileNames.map(async (fileName) => [
      fileName,
      await fs.readFile(path.join(sdkRoot, fileName), 'utf8'),
    ]),
  ),
);

function collectDeclarationStatements(fileName, contents, declaredNames) {
  const source = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (
      clause?.name ||
      (clause?.namedBindings && !ts.isNamedImports(clause.namedBindings)) ||
      (clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.some((item) =>
          item.propertyName === undefined ? false : item.name.text !== item.propertyName.text,
        ))
    ) {
      throw new Error(
        `RestGO declaration roll-up does not support aliased imports in ${fileName}.`,
      );
    }
  }
  const declarations = source.statements.filter(
    (statement) => !ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement),
  );
  for (const statement of declarations) {
    const names = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((declaration) => declaration.name)
      : [statement.name];
    for (const name of names) {
      if (!name || !ts.isIdentifier(name)) continue;
      const previousFile = declaredNames.get(name.text);
      if (previousFile && previousFile !== fileName) {
        throw new Error(
          `RestGO declaration name ${name.text} is duplicated in ${previousFile} and ${fileName}.`,
        );
      }
      declaredNames.set(name.text, fileName);
    }
  }
  const transformed = ts.transform(source, [
    (context) => {
      const visit = (node) => {
        if (
          node.kind === ts.SyntaxKind.DeclareKeyword ||
          node.kind === ts.SyntaxKind.ExportKeyword ||
          node.kind === ts.SyntaxKind.DefaultKeyword ||
          ts.isImportDeclaration(node) ||
          ts.isExportDeclaration(node)
        ) {
          return undefined;
        }
        if (ts.isImportTypeNode(node)) {
          throw new Error(`RestGO declaration roll-up requires named type imports in ${fileName}.`);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  try {
    return ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}

const emittedDeclarations = new Map();
const declarationProgram = ts.createProgram(
  sdkFileNames.map((fileName) => path.join(sdkRoot, fileName)),
  {
    declaration: true,
    emitDeclarationOnly: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    outDir: path.join(repositoryRoot, '.restgo-declaration-virtual'),
    rootDir: sdkRoot,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  },
);
const declarationDiagnostics = ts.getPreEmitDiagnostics(declarationProgram);
if (
  declarationDiagnostics.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(declarationDiagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => repositoryRoot,
      getNewLine: () => '\n',
    }),
  );
}
declarationProgram.emit(undefined, (fileName, contents) => {
  const portableFileName = path
    .relative(path.join(repositoryRoot, '.restgo-declaration-virtual'), fileName)
    .replaceAll('\\', '/');
  emittedDeclarations.set(portableFileName, contents);
});
const declaredNames = new Map();
const rolledUpDeclarations = [...emittedDeclarations]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([fileName, contents]) => collectDeclarationStatements(fileName, contents, declaredNames))
  .join('\n');
const sdkEntrySource = declarationProgram.getSourceFile(path.join(sdkRoot, 'index.ts'));
const checker = declarationProgram.getTypeChecker();
const sdkEntrySymbol = sdkEntrySource && checker.getSymbolAtLocation(sdkEntrySource);
if (!sdkEntrySymbol) throw new Error('RestGO SDK entry module could not be resolved.');
const publicExports = checker
  .getExportsOfModule(sdkEntrySymbol)
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return ts.factory.createExportSpecifier(
      !(target.flags & ts.SymbolFlags.Value),
      target.name === symbol.name ? undefined : ts.factory.createIdentifier(target.name),
      ts.factory.createIdentifier(symbol.name),
    );
  });
const publicExportStatement = ts.factory.createExportDeclaration(
  undefined,
  false,
  ts.factory.createNamedExports(publicExports),
  undefined,
);
const publicExportDeclaration = ts
  .createPrinter({ newLine: ts.NewLineKind.LineFeed })
  .printNode(
    ts.EmitHint.Unspecified,
    publicExportStatement,
    ts.createSourceFile('restgo.d.ts', '', ts.ScriptTarget.Latest),
  );
const sdkTypings = `declare module '@webrad/restgo-sdk' {\n${rolledUpDeclarations}\n${publicExportDeclaration}\n}\n`;

const outputs = [
  [
    path.join(repositoryRoot, 'packages', 'compiler', 'src', 'font-sources.generated.json'),
    await createFontSources(repositoryRoot),
  ],
  [reportBuilderTypingsPath, reportBuilderTypings],
  [repeatingGroupTypingsPath, repeatingGroupTypings],
  [playerTypingsPath, playerTypings],
  [
    path.join(repositoryRoot, 'packages', 'compiler', 'src', 'shaka-sources.generated.json'),
    JSON.stringify(
      {
        version: JSON.parse(
          await fs.readFile(
            path.join(repositoryRoot, 'node_modules', 'shaka-player', 'package.json'),
            'utf8',
          ),
        ).version,
        javascript: await fs.readFile(
          path.join(repositoryRoot, 'node_modules', 'shaka-player', 'dist', 'shaka-player.ui.js'),
          'utf8',
        ),
        declarations: await fs.readFile(
          path.join(repositoryRoot, 'node_modules', 'shaka-player', 'dist', 'shaka-player.ui.d.ts'),
          'utf8',
        ),
        css: await fs.readFile(
          path.join(repositoryRoot, 'node_modules', 'shaka-player', 'dist', 'controls.css'),
          'utf8',
        ),
        license: await fs.readFile(
          path.join(repositoryRoot, 'node_modules', 'shaka-player', 'LICENSE'),
          'utf8',
        ),
      },
      null,
      2,
    ) + '\n',
  ],
  [videoTypingsPath, videoTypings],
  [outputPath, expected],
  [apiClientTypingsPath, apiClientTypings],
  [sdkOutputPath, `${JSON.stringify(sdkSources, null, 2)}\n`],
  [sdkTypingsPath, `${JSON.stringify(sdkTypings, null, 2)}\n`],
];

async function collectVendorDeclarations(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory())
      result.push(...(await collectVendorDeclarations(path.join(directory, entry.name), relative)));
    else if (entry.name.endsWith('.d.ts'))
      result.push([relative, await fs.readFile(path.join(directory, entry.name), 'utf8')]);
  }
  return result;
}

const pdfLibraryRoot = path.join(repositoryRoot, 'node_modules', 'pdf-lib');
const pdfSources = {
  version: JSON.parse(await fs.readFile(path.join(pdfLibraryRoot, 'package.json'), 'utf8')).version,
  javascript: await fs.readFile(path.join(pdfLibraryRoot, 'dist', 'pdf-lib.esm.min.js'), 'utf8'),
  license: await fs.readFile(path.join(pdfLibraryRoot, 'LICENSE.md'), 'utf8'),
  dependencyLicenses: Object.fromEntries(
    await Promise.all(
      [
        [
          'standard-fonts-MIT.txt',
          path.join(repositoryRoot, 'node_modules', '@pdf-lib', 'standard-fonts', 'LICENSE.md'),
        ],
        ['upng-MIT.txt', path.join(repositoryRoot, 'node_modules', '@pdf-lib', 'upng', 'LICENSE')],
        ['pako-MIT-Zlib.txt', path.join(repositoryRoot, 'node_modules', 'pako', 'LICENSE')],
        ['tslib-0BSD.txt', path.join(pdfLibraryRoot, 'node_modules', 'tslib', 'LICENSE.txt')],
      ].map(async ([name, licensePath]) => [name, await fs.readFile(licensePath, 'utf8')]),
    ),
  ),
  declarations: Object.fromEntries(
    await collectVendorDeclarations(path.join(pdfLibraryRoot, 'es')),
  ),
  standardFontDeclarations: Object.fromEntries(
    await collectVendorDeclarations(
      path.join(repositoryRoot, 'node_modules', '@pdf-lib', 'standard-fonts', 'es'),
    ),
  ),
};
outputs.push([
  path.join(repositoryRoot, 'packages', 'compiler', 'src', 'pdf-lib-sources.generated.json'),
  JSON.stringify(pdfSources, null, 2) + '\n',
]);
outputs.push([
  path.join(repositoryRoot, 'packages', 'compiler', 'src', 'license-sources.generated.json'),
  JSON.stringify(
    { webrad: await fs.readFile(path.join(repositoryRoot, 'LICENSE'), 'utf8') },
    null,
    2,
  ) + '\n',
]);

if (globalThis.process.argv.includes('--check')) {
  for (const [fileName, contents] of outputs) {
    const actual = await fs.readFile(fileName, 'utf8').catch(() => '');
    if (actual !== contents) {
      throw new Error(
        'Embedded runtime or RestGO sources and typings are stale. Run npm run runtime:sources.',
      );
    }
  }
} else {
  for (const [fileName, contents] of outputs) {
    await fs.writeFile(fileName, contents, 'utf8');
  }
}
