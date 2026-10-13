import ts from 'typescript';
import postcss from 'postcss';
import { projectAssetPath, type ProjectAsset, type WebRadProject } from '@webrad/project-model';

const URL_PROPERTIES = new Set([
  'src',
  'href',
  'url',
  'poster',
  'source',
  'srcset',
  'backgroundimage',
]);
const URL_METHODS = new Set(['fetch', 'loadsource', 'setsource', 'setsrc', 'open']);

function memberName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text.toLowerCase();
  if (ts.isPropertyAccessExpression(node)) return node.name.text.toLowerCase();
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return node.argumentExpression.text.toLowerCase();
  return undefined;
}

function staticUrlValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return staticUrlValue(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticUrlValue(node.left);
    const right = staticUrlValue(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isNewExpression(node) && memberName(node.expression) === 'url' && node.arguments?.[0])
    return staticUrlValue(node.arguments[0]);
  return undefined;
}

function staticUrl(node: ts.Expression): boolean {
  return staticUrlValue(node) !== undefined;
}

function decodedUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cssUnescape(value: string): string {
  return value.replace(
    /\\([\da-fA-F]{1,6})\s?|\\([^\r\n])/gu,
    (_match, hexadecimal: string | undefined, literal: string | undefined) => {
      if (hexadecimal === undefined) return literal ?? '';
      const code = Number.parseInt(hexadecimal, 16);
      return code === 0 || code > 0x10ffff ? '\uFFFD' : String.fromCodePoint(code);
    },
  );
}

/** Keeps resources referenced by the reachable application, falling back when a URL is computed. */
export function selectProjectAssets(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
  applicationCss = '',
): readonly ProjectAsset[] {
  const references: string[] = [];
  let dynamic = false;
  const collectValue = (value: unknown, key = ''): void => {
    if (typeof value === 'string') {
      references.push(value);
      if (URL_PROPERTIES.has(key.toLowerCase()) && /\$\{|\{\{|\b(?:var|attr)\(/u.test(value))
        dynamic = true;
    } else if (Array.isArray(value)) {
      for (const entry of value) collectValue(entry, key);
    } else if (typeof value === 'object' && value !== null) {
      if (key === 'currentRowBindings') {
        const property = Reflect.get(value, 'property');
        if (typeof property === 'string' && URL_PROPERTIES.has(property.toLowerCase()))
          dynamic = true;
      }
      for (const [property, entry] of Object.entries(value)) collectValue(entry, property);
    }
  };
  for (const document of [...project.pages, ...project.reusableElements]) {
    for (const component of document.components) collectValue(component.props);
  }
  for (const style of project.styles) collectValue(style);
  for (const [name, source] of Object.entries(userSources)) {
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) references.push(node.text);
      if (ts.isBinaryExpression(node)) {
        const value = staticUrlValue(node);
        if (value !== undefined) references.push(value);
      }
      if (ts.isTemplateExpression(node) && /assets[\\/]/u.test(node.getText(file))) dynamic = true;
      if (ts.isCallExpression(node)) {
        const method = memberName(node.expression);
        const first = node.arguments[0];
        if (
          method !== undefined &&
          URL_METHODS.has(method) &&
          first !== undefined &&
          !staticUrl(first)
        )
          dynamic = true;
        if (method === 'setattribute') {
          const attribute = first === undefined ? undefined : memberName(first);
          const value = node.arguments[1];
          if (
            value !== undefined &&
            (attribute === undefined || URL_PROPERTIES.has(attribute)) &&
            !staticUrl(value)
          )
            dynamic = true;
        }
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          (first === undefined || !staticUrl(first))
        )
          dynamic = true;
      }
      if (
        ts.isNewExpression(node) &&
        memberName(node.expression) === 'url' &&
        node.arguments?.[0] &&
        !staticUrl(node.arguments[0])
      )
        dynamic = true;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        URL_PROPERTIES.has(memberName(node.left) ?? '') &&
        !staticUrl(node.right)
      )
        dynamic = true;
      if (
        ts.isPropertyAssignment(node) &&
        URL_PROPERTIES.has(memberName(node.name) ?? '') &&
        !staticUrl(node.initializer)
      )
        dynamic = true;
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  if (applicationCss) {
    try {
      postcss.parse(applicationCss).walkDecls((declaration) => {
        references.push(cssUnescape(declaration.value));
        if (/url\(\s*(?:var|attr|env)\(/iu.test(declaration.value)) dynamic = true;
      });
    } catch {
      // A stylesheet that cannot be inspected cannot prove any resource unused.
      dynamic = true;
    }
  }
  const assets = project.assets ?? [];
  if (dynamic) return assets;
  const searchable = references.map((value) => decodedUrl(cssUnescape(value)).toLowerCase());
  return assets.filter((asset) => {
    const resourcePath = projectAssetPath(asset).toLowerCase();
    return searchable.some((value) => value.includes(resourcePath));
  });
}
