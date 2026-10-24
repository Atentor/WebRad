import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';
export function timerProject() {
  const project = createProject('TimerExample');
  let page = project.pages[0]!;
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebTimer', {
      id: 'timer',
      name: 'Timer1',
      parentId: page.rootComponentId,
      props: { time: 30, enabled: true, loop: true },
    }),
    page.rootComponentId,
  );
  page = bindComponentEvent(page, 'timer', 'OnTimer', 'tick');
  return updatePage(project, page.id, page);
}
export const timerUserSources = {
  'pages/index.ts': `import type { WebTimer, WebTimerEventDetail } from '@webrad/runtime';
import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  tick(sender: WebTimer, event: CustomEvent<WebTimerEventDetail>): void {
    this.element.dataset.timerTicks = String(event.detail.tick);
    if (Timer1.tickCount === 3) this.Timer1.Stop();
    this.element.dataset.timerEnabled = String(sender.enabled);
  }
}`,
};
