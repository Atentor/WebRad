import { useContext, useEffect, useRef, type HTMLAttributes, type ReactElement } from 'react';
import {
  defaultComponentRegistry,
  embeddedComponentStyleCatalog,
} from '@webrad/component-registry';
import { WebLogin } from '@webrad/runtime/login';
import {
  createDefaultWebLoginConfiguration,
  parseWebLoginConfiguration,
} from '@webrad/runtime/login-model';
import type { ComponentNode } from '@webrad/project-model';
import { ProjectStylesContext } from './project-styles.js';

/** Uses the real template without sessions or network requests in the Designer. */
export function LoginView({
  node,
  attributes,
}: {
  readonly node: ComponentNode;
  readonly attributes: HTMLAttributes<HTMLDivElement>;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const styles = useContext(ProjectStylesContext);
  useEffect(() => {
    if (!ref.current) return;
    const login = new WebLogin(ref.current, { interactive: false });
    login.styleCatalog =
      embeddedComponentStyleCatalog(defaultComponentRegistry.require(node.type), node, styles) ??
      [];
    login.configuration =
      node.props.configuration === undefined
        ? createDefaultWebLoginConfiguration()
        : parseWebLoginConfiguration(node.props.configuration);
    return () => login.dispose();
  }, [node, styles]);
  return <div {...attributes} ref={ref} />;
}
