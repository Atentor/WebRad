# Edit input masks

Select an **Edit**, open **Properties > Input mask**, enable **Enable mask**, and
enter a **Mask pattern**. The Designer shows the same formatted value as Preview,
Debug Preview and generated browser applications. Existing fields remain unmasked
unless explicitly enabled. An empty pattern leaves the field unmasked.

The pattern is a character mask, with these built-in tokens:

| Pattern              | Meaning                                 |
| -------------------- | --------------------------------------- |
| `0`                  | ASCII digit                             |
| `a`                  | Unicode letter                          |
| `*`                  | Unicode letter or number                |
| `#`                  | Any single Unicode character            |
| `[ ... ]`            | Optional group                          |
| `{n}` or `{min,max}` | Repeat the preceding character or group |
| `\`                  | Escape the next character as a literal  |
| `                    | `                                       | Alternative patterns, chosen by the accepted input |

All other characters are literals. Escape token characters when using them as
fixed text. Groups can nest; parentheses are ordinary literals. Optional groups
and bounded repetitions choose the shortest complete alternative that accepts
the input. The maximum is 128 expanded alternatives, 512 positions per alternative,
16 nested groups and 1024 pattern characters. Open-ended repetition is not supported.

| Format                                           | Pattern              |
| ------------------------------------------------ | -------------------- |
| CPF                                              | `000.000.000-00`     |
| CNPJ                                             | `00.000.000/0000-00` |
| Postal code                                      | `00000-000`          |
| Brazilian phone, with optional ninth local digit | `(00) 0000[0]-0000`  |
| Letters and digits                               | `aaa-0000`           |
| One to twelve alphanumeric characters            | `*{1,12}`            |
| CPF or CNPJ                                      | `000.000.000-00      | 00.000.000/0000-00` |

Use **Letter case** to preserve, uppercase or lowercase editable letters. In
**Custom tokens**, enter a JSON object and leave the field or press Ctrl+Enter
(Cmd+Enter on macOS) to apply it. Invalid JSON/rules remain local drafts with an
error message; Escape discards the draft. Rules add to or override the built-ins:

```json
{
  "H": { "pattern": "[0-9A-Fa-f]", "transform": "upper" },
  "X": "[A-Z]"
}
```

With pattern `HH:HH:HH`, `a1b2c3` becomes `A1:B2:C3`. Each key is one Unicode
character, excluding the grammar characters `[]{}|\`. Each regex matches one
whole Unicode character, uses the JavaScript Unicode flag, and contains at most
128 characters. There are at most 64 custom rules. A token-specific `transform`
(`none`, `upper`, `lower`) overrides the field's letter-case setting. Case
conversions that would expand one character into several preserve the original.

## Monaco and runtime API

These are concrete `WebEdit` members, with completion and strict diagnostics in
page and reusable code. Both bare names and `this.` access work:

```ts
Edit1.mask = '000.000.000-00';
Edit1.maskEnabled = true;
Edit1.rawValue = '12345678901';
// Edit1.value === '123.456.789-01'
// Edit1.rawValue === '12345678901'

this.Edit1.maskTokens = {
  H: { pattern: '[0-9A-Fa-f]', transform: 'upper' },
};
this.Edit1.mask = 'HH:HH:HH';
this.Edit1.rawValue = 'a1b2c3';

if (Edit1.maskComplete) {
  const formatted = Edit1.value;
  const raw = Edit1.rawValue;
}
```

Changing `mask` or `maskTokens` reapplies the new rules to the currently accepted
characters. `value` returns displayed text and accepts formatted text; use the
`rawValue` setter for raw data, especially when a fixed literal also matches a
character rule, such as a numeric country-code prefix. Disabling the mask keeps
the displayed text and restores the configured native Input Type.

Typing, pasting and replacement format before authored `OnInput` handlers run.
Caret selections and backward/forward deletion operate on editable characters;
composition waits until text is committed. `OnChange` follows native commit/blur
behavior. Assigning values or settings from code does not synthesize input/change
events. `clear()` empties the field. Empty or incomplete text has
`maskComplete === false`. An invalid pattern exposes `maskError` and temporarily
leaves the text unmasked; invalid custom token assignments throw before changing
the configuration. Invalid saved patterns/rules are compiler diagnostics.

While masking, Input Types that sanitize text or do not support selection
(`number`, `email`, `url`) use a native text field; the configured `inputType`
property is retained. Password, search and telephone fields retain their types.
Masks constrain characters and presentation; use application code for semantic
rules such as CPF check digits, calendar validity or numeric ranges. Runtime
changes affect that component instance; persisted defaults come from the Inspector.
