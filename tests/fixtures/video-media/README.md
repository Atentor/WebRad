# Playback fixtures

These small binary samples come from the official Shaka Player v5.2.13 test assets:
https://github.com/shaka-project/shaka-player/tree/v5.2.13/test/test/assets

The `.ts` MPEG-TS samples are stored as `.ts.bin` to keep them out of the TypeScript source graph. The `sintel-*` fragmented MP4 samples are from the Sintel trailer, Blender Foundation, licensed under Creative Commons Attribution 3.0: https://durian.blender.org/sharing/

The fragmented Sintel segments start at 40 seconds. The test DASH manifest uses `presentationTimeOffset="40"` to map their timestamps into the ten-second fixture, with the actual 258×110 video dimensions.

The Shaka project distributes its test assets under its repository license notices. See https://github.com/shaka-project/shaka-player/blob/v5.2.13/LICENSE. These samples are used only in automated local playback tests; they are not bundled into generated applications.
