import type { BrowserWindow } from 'electron';
import { loadProjectFiles } from './project-files';

/** Exercises registry-driven nonvisual services in the real IDE. */
export async function runTimerSmoke(
  window: BrowserWindow,
  options: { projectPath: string; log: (message: string) => void },
): Promise<void> {
  const evaluate = (expression: string): Promise<unknown> =>
    window.webContents.executeJavaScript(expression, true);
  const ready = async (expression: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timer smoke timed out: ${expression}`);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const original = await loadProjectFiles(options.projectPath);
  const page = original.project.pages.find((item) => item.name === 'index')!;
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(
    `Array.from(document.querySelectorAll('.wr-palette-item')).some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Timer')`,
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Timer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(`document.querySelector('.wr-inspector-selection strong')?.textContent === 'Timer1'`);
  await ready(`document.querySelector('.wr-inspector-integration-warning') === null`);
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Timer has no stable ID.');
  const field = (label: string) =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  await ready(
    `${field('Time (ms)')}?.value === '1000' && ${field('Loop')}?.checked === true && ${field('Enabled')}?.checked === false`,
  );
  await evaluate(
    `(() => { const input = ${field('Time (ms)')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '50'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await ready(`${field('Time (ms)')}?.value === '50'`);
  await click('button[role="tab"][aria-label="Events"]');
  await ready(
    `['OnTimer', 'OnStart', 'OnStop'].every(name => [...document.querySelectorAll('.wr-inspector-event-row label')].some(e => e.textContent?.trim() === name))`,
  );
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(options.projectPath);
  const timer = saved.project.pages
    .find((item) => item.id === page.id)
    ?.components.find((item) => item.id === id);
  if (
    timer?.type !== 'WebTimer' ||
    timer.props.time !== 50 ||
    timer.props.loop !== true ||
    timer.props.enabled !== false
  )
    throw new Error('Timer Inspector values were not saved.');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  for (let index = 0; index < 2; index++) {
    await evaluate(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  }
  await ready(`document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    'renderer Timer Inspector and Interact passed: palette, interval, loop, enabled, events, persistence and undo',
  );

  await ready(
    `Array.from(document.querySelectorAll('.wr-palette-item')).some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Payments')`,
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Payments').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(
    `document.querySelector('.wr-inspector-selection strong')?.textContent === 'Payments1'`,
  );
  const integrationWarning = original.project.settings.restGo.enabled
    ? `document.querySelector('.wr-inspector-integration-warning') === null`
    : `document.querySelector('.wr-inspector-integration-warning')?.textContent?.includes('Payments requires RestGo integration') === true`;
  await ready(integrationWarning);
  const paymentsId = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof paymentsId !== 'string') throw new Error('Payments has no stable ID.');
  await ready(
    `${field('Gateway slug')}?.value === '' && ${field('Mode')}?.value === 'payment' && ${field('Enabled')}?.checked === true && ${field('Auto resume')}?.checked === true && ${field('Auto watch')}?.checked === true && ${field('Persist attempts')}?.checked === true && ${field('Poll interval (ms)')}?.value === '2000' && ${field('Poll timeout (ms)')}?.value === '60000'`,
  );
  await evaluate(
    `(() => { const input = ${field('Gateway slug')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'customer-payments'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await ready(`${field('Gateway slug')}?.value === 'customer-payments'`);
  await evaluate(
    `(() => { const input = ${field('Mode')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'subscription'); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await ready(`${field('Mode')}?.value === 'subscription'`);
  await click('button[role="tab"][aria-label="Events"]');
  await ready(integrationWarning);
  await ready(
    `['OnPaymentSucceeded', 'OnSubscriptionActivated', 'OnSubscriptionCanceled', 'OnCheckoutCreated', 'OnCheckoutReady', 'OnCheckoutOpened', 'OnOperationChange', 'OnSynchronizationChange', 'OnHistoryChange', 'OnStateChange', 'OnRestored', 'OnError', 'OnRequestComplete'].every(name => [...document.querySelectorAll('.wr-inspector-event-row label')].some(e => e.textContent?.trim() === name))`,
  );
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const paymentsSession = await loadProjectFiles(options.projectPath);
  const payments = paymentsSession.project.pages
    .find((item) => item.id === page.id)
    ?.components.find((item) => item.id === paymentsId);
  if (
    payments?.type !== 'WebPayments' ||
    payments.props.gatewaySlug !== 'customer-payments' ||
    payments.props.mode !== 'subscription' ||
    payments.props.pollInterval !== 2000 ||
    payments.props.pollTimeout !== 60000 ||
    payments.props.autoResume !== true ||
    payments.props.autoWatch !== true ||
    payments.props.persistAttempts !== true ||
    payments.props.enabled !== true
  )
    throw new Error('Payments Inspector values were not saved.');
  const paymentsTree = `[role="treeitem"][data-component-id=${JSON.stringify(paymentsId)}]`;
  await click(paymentsTree);
  for (let index = 0; index < 3; index++) {
    await evaluate(
      `document.querySelector(${JSON.stringify(paymentsTree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  }
  await ready(`document.querySelector(${JSON.stringify(paymentsTree)}) === null`);
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    'renderer Payments Inspector and Interact passed: integration warning, nonvisual palette, gateway, mode, automatic recovery and observation defaults, thirteen typed events, persistence and undo',
  );
}
