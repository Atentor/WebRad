import { describe, expect, it } from 'vitest';
import { renameFormUserSource } from './event-handler';

describe('renameFormUserSource', () => {
  it('renames only AST-identified form declarations and generated-base references', () => {
    const source = `import { FrmMainGenerated } from './FrmMain.generated';\n\nexport class FrmMain extends FrmMainGenerated {\n  // FrmMain remains in comments\n}\n`;
    const renamed = renameFormUserSource(source, 'FrmMain', 'FrmCustomers');
    expect(renamed.sourceText).toContain(
      `import { FrmCustomersGenerated } from "./FrmCustomers.generated";`,
    );
    expect(renamed.sourceText).toContain('export class FrmCustomers extends FrmCustomersGenerated');
    expect(renamed.sourceText).toContain('// FrmMain remains in comments');
  });
});
