import { useContext, useEffect, useRef, type HTMLAttributes, type ReactElement } from 'react';
import { WebMenu } from '@webrad/runtime/menu';
import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
} from '@webrad/runtime/menu-model';
import type { ComponentNode } from '@webrad/project-model';
import { ProjectAssetsContext, resolveProjectImageSource } from './project-assets.js';

/** Static Designer projection and runtime share the complete DOM and CSS contract. */
export function MenuView({
  node,
  designTime,
  attributes,
}: {
  readonly node: ComponentNode;
  readonly designTime?: boolean;
  readonly attributes: HTMLAttributes<HTMLDivElement>;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const assets = useContext(ProjectAssetsContext);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const viewport = element.closest<HTMLElement>('[data-viewport]');

    const config =
      node.props.configuration === undefined
        ? createDefaultWebMenuConfiguration()
        : parseWebMenuConfiguration(node.props.configuration);
    const configuration = {
      ...config,
      brand: { ...config.brand, logo: resolveProjectImageSource(config.brand.logo, assets) },
      user: { ...config.user, avatar: resolveProjectImageSource(config.user.avatar, assets) },
    };

    let menu: WebMenu | undefined;
    let previousWidth: number | undefined;
    const project = (): void => {
      const width = viewport
        ? Number.parseFloat(viewport.dataset.viewportWidth ?? viewport.style.width)
        : undefined;
      if (menu && previousWidth === width) return;
      menu?.dispose();
      previousWidth = width;
      menu = new WebMenu(element, {
        interactive: !designTime,
        ...(designTime && width !== undefined && Number.isFinite(width)
          ? { viewportWidth: width }
          : {}),
      });
      menu.configuration = configuration;
    };
    project();
    const observer =
      designTime && viewport && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(project)
        : undefined;
    const attributesObserver =
      designTime && viewport && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(project)
        : undefined;
    if (attributesObserver && viewport)
      attributesObserver.observe(viewport, {
        attributes: true,
        attributeFilter: ['data-viewport-width'],
      });
    if (observer && viewport) observer.observe(viewport);
    return () => {
      observer?.disconnect();
      attributesObserver?.disconnect();
      menu?.dispose();
    };
  }, [node.props.configuration, designTime, assets, node.bounds.width]);
  return <div {...attributes} ref={ref} />;
}
