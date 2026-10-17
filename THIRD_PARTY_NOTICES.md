# Third-party notices

The [MIT license](LICENSE) covers original WebRAD code, including its browser
runtime and RestGo SDK. Third-party code and media keep their own licenses.
MIT does not require applications created with WebRAD to use the same license;
retain the notices for any WebRAD or third-party code distributed with them.

## Desktop distribution

The desktop application uses Electron/Chromium, React, Monaco Editor,
TypeScript, esbuild, Tailwind CSS/PostCSS, Sharp and their dependencies.
`package-lock.json` records the exact versions and package license metadata.
Desktop packaging generates `THIRD_PARTY_LICENSES.txt` from installed production
dependencies and Electron, including their available license and notice texts.
For `@img/sharp-libvips-*` binary packages without a separate license file, this
includes their upstream README and its `Licensing` table of native libraries.
Electron also supplies `LICENSE` and `LICENSES.chromium.html` with its binary.
Keep these files with redistributed desktop packages.

- JetBrains Mono: SIL Open Font License 1.1, preserved in
  [licenses/JetBrainsMono-OFL.txt](licenses/JetBrainsMono-OFL.txt).
- Sharp: Apache-2.0; its native binaries include libvips and other libraries with
  separate terms, including LGPL-3.0-or-later. Preserve their notices and review
  the [Sharp distribution guidance](https://sharp.pixelplumbing.com/install/#licensing)
  when redistributing or changing native-library packaging.

## Generated browser applications

The compiler includes the WebRAD MIT notice in `assets/licenses/WebRAD-MIT.txt`.
When used by the application, it also includes:

- Shaka Player: Apache-2.0, in `assets/licenses/Shaka-Player-Apache-2.0.txt`.
- pdf-lib: MIT, in `assets/licenses/pdf-lib-MIT.txt`.
- pdf-lib dependencies: notices in `assets/licenses/pdf-lib/`, including
  standard-fonts, UPNG, pako and tslib.

Preserve the `assets/licenses/` directory when deploying exported applications.
User-authored code, project assets and external dependencies require their own
license decisions; WebRAD does not assign them a license automatically.

## Test media

[Playback fixtures](tests/fixtures/video-media/README.md) originate from Shaka
Player test assets. The Sintel trailer fragments are attributed to the Blender
Foundation under CC BY 3.0. They are test-only assets and are not distributed
with exported applications.
