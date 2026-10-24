import type { WebComponent, WebMenuItem, WebMenuUser } from '@webrad/runtime';
import { bindRestGoMenu } from '../units/AuroraAccount';
import { AuroraMenuGenerated } from './AuroraMenu.generated';

export class AuroraMenu extends AuroraMenuGenerated {
  private readonly stopAccountMenu: () => void;

  public constructor(
    element: HTMLElement,
    instanceId: string,
    componentElements: ReadonlyMap<string, WebComponent>,
    componentIds: ReadonlyMap<string, string>,
  ) {
    super(element, instanceId, componentElements, componentIds);
    this.stopAccountMenu = bindRestGoMenu(this.Menu);
  }
  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
  public setUser(user: WebMenuUser): void {
    this.Menu.user = user;
  }
  public setItems(items: readonly WebMenuItem[]): void {
    this.Menu.items = items;
  }
  public selectItem(itemId: string): void {
    this.Menu.selectedItemId = itemId;
  }
  public override dispose(): void {
    this.stopAccountMenu();
    super.dispose();
  }
}
