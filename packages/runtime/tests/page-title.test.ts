// @vitest-environment jsdom

import { createPage } from '@webrad/project-model';
import { describe, expect, it } from 'vitest';

import { mountPage, WebPage, WebPageRouter, type RuntimePageModel } from '../src/index.js';

function pageModel(name: string, browserTitle?: string): RuntimePageModel {
  const page = createPage(name);
  return {
    ...page,
    components: page.components.map((node) => {
      const props: Record<string, unknown> = { ...node.props };
      if (browserTitle === undefined) delete props.browserTitle;
      else props.browserTitle = browserTitle;
      return { ...node, props };
    }),
  };
}

function pageDocument(title: string, applicationName?: string): Document {
  const ownerDocument = document.implementation.createHTMLDocument(title);
  if (applicationName !== undefined)
    ownerDocument.documentElement.dataset.webradApplicationName = applicationName;
  return ownerDocument;
}

describe('page browser titles', () => {
  it('shares the rendered title with the authored wrapper before create and show handlers', () => {
    const ownerDocument = pageDocument('Existing application name');
    const mounted = mountPage(
      pageModel('PageCustomers', '  Customers & orders <2026>  '),
      ownerDocument.body,
    );
    const page = new WebPage(mounted.element);
    const lifecycleTitles: string[] = [];
    page.bindEvent('OnCreate', () => {
      lifecycleTitles.push(ownerDocument.title);
      page.browserTitle = 'Customers ready';
    });
    page.bindEvent('OnShow', () => {
      lifecycleTitles.push(ownerDocument.title);
    });

    expect(page.browserTitle).toBe('  Customers & orders <2026>  ');
    expect(ownerDocument.title).toBe('Existing application name');
    page.show();
    expect(lifecycleTitles).toEqual(['Customers & orders <2026>', 'Customers ready']);
    expect(ownerDocument.title).toBe('Customers ready');
    expect(mounted.page.browserTitle).toBe('Customers ready');
    mounted.page.browserTitle = '';
    expect(ownerDocument.title).toBe('Existing application name');
  });

  it('restores the original application name across blank values and cached reopens', () => {
    const ownerDocument = pageDocument('Previous application name');
    const page = new WebPage(ownerDocument.createElement('section'));
    ownerDocument.body.append(page.element);
    expect(page.browserTitle).toBe('');
    page.browserTitle = 'Customers';
    page.show();
    expect(ownerDocument.title).toBe('Customers');
    page.browserTitle = ' \n\t ';
    expect(ownerDocument.title).toBe('Previous application name');

    page.close();
    page.browserTitle = 'Orders';
    expect(ownerDocument.title).toBe('Previous application name');
    page.show();
    expect(ownerDocument.title).toBe('Orders');
    page.close();
    page.browserTitle = '';
    page.show();
    expect(ownerDocument.title).toBe('Previous application name');
  });

  it('only updates the title for the shown active page while it is visible and connected', () => {
    const ownerDocument = pageDocument('Application');
    const first = new WebPage(ownerDocument.createElement('section'));
    const second = new WebPage(ownerDocument.createElement('section'));
    ownerDocument.body.append(first.element, second.element);
    first.browserTitle = 'First';
    second.browserTitle = 'Second';
    expect(ownerDocument.title).toBe('Application');
    first.show();
    second.browserTitle = 'Second pending';
    expect(ownerDocument.title).toBe('First');
    second.show();
    first.browserTitle = 'First inactive';
    expect(ownerDocument.title).toBe('Second pending');
    second.collapseWhenHidden = false;
    second.visible = false;
    second.browserTitle = 'Second invisible';
    expect(ownerDocument.title).toBe('Second pending');
    second.show();
    expect(ownerDocument.title).toBe('Second invisible');
    second.hide();
    second.browserTitle = 'Second hidden';
    expect(ownerDocument.title).toBe('Second invisible');
    first.show();
    expect(ownerDocument.title).toBe('First inactive');
    first.element.remove();
    first.browserTitle = 'Detached';
    expect(ownerDocument.title).toBe('First inactive');
    second.show();
    second.dispose();
    second.browserTitle = 'Disposed';
    expect(ownerDocument.title).toBe('Second hidden');
  });

  it('navigates from a customized entry title to blank and legacy pages using compiler metadata', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const ownerDocument = frame.contentDocument!;
    ownerDocument.title = 'Custom entry';
    ownerDocument.documentElement.dataset.webradApplicationName = 'Original application';
    const models = [
      pageModel('PageMain', 'Custom entry'),
      pageModel('PageBlank', ' \n '),
      pageModel('PageLegacy'),
    ];
    const router = new WebPageRouter(
      models.map((model) => ({
        id: model.id,
        name: model.name,
        model,
        createPage: (element) => new WebPage(element),
      })),
      ownerDocument.body,
    );
    try {
      router.navigate('PageMain');
      expect(ownerDocument.title).toBe('Custom entry');
      router.navigate('PageBlank');
      expect(ownerDocument.title).toBe('Original application');
      router.navigate('PageMain');
      expect(ownerDocument.title).toBe('Custom entry');
      router.navigate('PageLegacy');
      expect(ownerDocument.title).toBe('Original application');
    } finally {
      router.dispose();
      frame.remove();
    }
  });
});
