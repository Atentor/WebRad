# Project fonts

In **Styles**, select a visual component style, expand **Text**, enable **Font
family** when necessary, and choose a family. Assign that style to components
through the Inspector's **Style** selector. The saved choice applies to the
Designer, Styles samples, compiled F9 Preview and exported browser application.

| Family         | Saved `fontFamily` | Available upstream weights |
| -------------- | ------------------ | -------------------------- |
| Roboto         | `roboto`           | 100–900, variable          |
| Open Sans      | `open-sans`        | 300–800, variable          |
| JetBrains Mono | `jetbrains-mono`   | 100–800, variable          |
| Inter          | `inter`            | 100–900, variable          |
| Lato           | `lato`             | 100, 300, 400, 700, 900    |
| Montserrat     | `montserrat`       | 100–900, variable          |
| Poppins        | `poppins`          | 100–900, steps of 100      |
| Nunito         | `nunito`           | 200–1000, variable         |

All eight include normal and italic faces, Latin and Latin Extended glyphs,
including Portuguese accents. **Font weight** and **Font style** remain separate
style properties. The editor's existing weight choices run from 100 to 900;
when an exact weight is unavailable, the browser uses its normal CSS font
matching rules. Generic `sans`, `serif` and `mono` options remain available and
continue to resolve through the existing system font stacks.

The family ID is stored in each style's `states.base`, `hover`, `focus`, `active`
or `disabled` properties. No font bytes or machine-specific paths enter the
Project Model, and project/page format version 2 is unchanged. Existing projects
retain their styles and component bindings. This catalog serves browser visual
styles; Report Builder's PDF text continues to use its documented PDF font
contract.

`@webrad/runtime/fonts` owns the shared family catalog. Project-model metadata
uses it for the validated enum and the generic visual editor renders those
choices. The existing runtime style resolver emits `font-<id>` utilities, while
the compiler registers matching Tailwind theme tokens. No new component methods
or events are introduced.

`npm run runtime:sources` regenerates
`packages/compiler/src/font-sources.generated.json` from pinned Fontsource
packages. The generator preserves upstream weight/style/Unicode descriptors and
unmodified WOFF2 binaries, embedding them as data URLs. Both Designer style
compilation and generated app compilation include only families referenced by
their selected style candidates, including interaction states. Export selection
continues to prune unused styles. Each selected family includes all its bundled
weights and styles so changing font weight or interaction state needs no network
request.

Font loading requires no Google Fonts/CDN connection or installed OS fonts.
Custom hosting CSPs must allow `font-src data:`. Exported applications include
the corresponding upstream notices in
`assets/licenses/fonts/<font-id>-OFL-1.1.txt`; preserve those files when deploying.
`npm run runtime:sources:check` verifies the snapshot against the installed pinned
packages. The browser regression checks all eight families in normal, bold and
italic form across Designer representations, compiled Preview and HTTP-served
static exports with external font loading prohibited.
