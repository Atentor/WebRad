import { indexGenerated } from './index.generated';
export class index extends indexGenerated {
  public async BTNMostrarClick(): Promise<void> {
    Message(`Olá ${EDTNome.value}`);
  }
}
