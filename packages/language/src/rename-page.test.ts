import { describe, expect, it } from 'vitest';
import { renamePageUserSource } from './event-handler';

describe('renamePageUserSource', () => {
  it('renames only AST-identified page declarations and generated-base references', () => {
    const source = `import { PageMainGenerated } from './PageMain.generated';\n\nexport class PageMain extends PageMainGenerated {\n  // PageMain remains in comments\n}\n`;
    const renamed = renamePageUserSource(source, 'PageMain', 'PageCustomers');
    expect(renamed.sourceText).toContain(
      `import { PageCustomersGenerated } from "./PageCustomers.generated";`,
    );
    expect(renamed.sourceText).toContain(
      'export class PageCustomers extends PageCustomersGenerated',
    );
    expect(renamed.sourceText).toContain('// PageMain remains in comments');
  });
});
