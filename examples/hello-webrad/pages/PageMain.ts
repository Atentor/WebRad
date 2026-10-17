import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  public async BTNMostrarClick(): Promise<void> {
    Message(`Olá ${EDTNome.value}`);
  }
}
