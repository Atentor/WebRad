import { FrmMainGenerated } from './FrmMain.generated';

export class FrmMain extends FrmMainGenerated {
  public async BTNMostrarClick(): Promise<void> {
    Message(`Olá ${this.EDTNome.value}`);
  }
}
