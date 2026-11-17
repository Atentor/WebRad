import { defaultComponentRegistry } from '@webrad/component-registry';
import { currentRowHandlerType, ensureEventHandler } from '@webrad/language';
import { menuSourcePath, pageClassName, type WebRadProject } from '@webrad/project-model';
import { virtualAbsolutePath } from './source-graph.js';
import type { CheckProjectTypesOptions } from './types.js';

/** Check proposed event bindings with the real Inspector handler signatures. */
export function assistantEventCheckSources(
  input: ReadonlyMap<string, string>,
  project: WebRadProject,
  bindingsByFile: CheckProjectTypesOptions['assistantEvents'],
): ReadonlyMap<string, string> {
  const sources = new Map(input);
  for (const [fileName, bindings] of Object.entries(bindingsByFile ?? {})) {
    const document =
      project.pages.find((page) => fileName === `pages/${page.name}.ts`) ??
      project.reusableElements.find((page) => fileName === `reusables/${page.name}.ts`) ??
      project.menus?.find((menu) => fileName === menuSourcePath(menu));
    const absolutePath = virtualAbsolutePath(fileName);
    let authored = sources.get(absolutePath);
    if (!document || authored === undefined) {
      throw new Error('Event checks require an authored visual document.');
    }
    const className = pageClassName(document.name);
    const checks: string[] = [];
    for (const [index, binding] of bindings.entries()) {
      const node = document.components.find((item) => item.id === binding.componentId);
      if (!node) throw new Error('The event component was removed from this proposal.');
      const definition = defaultComponentRegistry.require(node.type);
      const events =
        definition.eventsForNode?.(node, {
          document,
          reusableElements: project.reusableElements,
        }) ?? definition.events;
      const event = events.find((item) => item.name === binding.eventName);
      if (!event) throw new Error('The proposal contains an unregistered event binding.');
      let expected = `__WebRadCodexEvent${index}`;
      while (authored.includes(expected)) expected += '_';
      // The method and assignment exist only in the type-checker's virtual copy.
      authored = ensureEventHandler(authored, {
        className,
        fileName,
        componentName: node.name,
        componentType: node.type,
        eventName: event.name,
        handlerName: expected,
        eventType: event.eventType,
        eventDetailType: event.eventDetailType,
        eventDetailProperties: event.eventDetailProperties,
        eventDetailTypeArgument: event.eventDetailTypeArgumentSuffix
          ? `${node.name}${event.eventDetailTypeArgumentSuffix}`
          : undefined,
        currentRowType: currentRowHandlerType(document, node.id),
      }).sourceText;
      checks.push(
        `declare const ${expected}Document: ${className};\n` +
          `const ${expected}Check: ${className}[${JSON.stringify(expected)}] = ` +
          `${expected}Document[${JSON.stringify(binding.method)}];`,
      );
    }
    sources.set(absolutePath, `${authored}\n${checks.join('\n')}\n`);
  }
  return sources;
}
