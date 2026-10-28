[简体中文](life-passport-release.zh_CN.md) · **English**

# Life Passport verified snapshot

This record identifies the firmware tested on 2026-10-28 and the matching website. Documentation and promotional artwork updates do not replace this verified binary.

## Open and play

| Entry | Address |
| --- | --- |
| China-hosted direct website | <https://ssstone0903-life-passport.ms.show/> |
| GitHub Pages mirror | <https://unstone.github.io/life-passport/> |
| Public Studio and startup status | <https://modelscope.cn/studios/ssstone0903/life-passport> |
| Firmware implementation source | [090a3b9](https://github.com/unStone/life-passport/tree/090a3b929e97986b2276a4c6e1aa2d2caf9cfc51) |

The current firmware starts on the sound-reception page. Hold OK to open tools, select the return-to-simulation item, then press OK to run the opening pattern. In simulation, UP changes speed, DOWN pauses and advances once, OK toggles running, and holding OK opens tools. A received seed requires OK to apply and another OK to start; holding OK cancels the preview.

On PC or mobile, choose a catalog pattern, draw cells, or upload an image and compute a period-2/3/4 approximation. Inspect the preview, adopt it, then play the seed sound while the device is listening. The image-derived result follows ordinary B3/S23 and returns naturally to its initial occupied cells; it is an approximation of the image. Keep its transmitted boundary setting to preserve the verified behavior. See the [full editor instructions](world-editor.md).

## Firmware identity

| Field | Value |
| --- | --- |
| Runtime version | `090a3b9` |
| Full implementation commit | `090a3b929e97986b2276a4c6e1aa2d2caf9cfc51` |
| Merged image | `FoloToy-AI-Passport-full.bin`, 1,200,256 bytes, write at `0x0` |
| Merged SHA-256 | `c1be6d73a68d4abfbfa1d20548c9238c5f464023daae031b78000bfebd789f02` |
| Matching ELF SHA-256 | `333f01b169879571422025f726cf935b9ba3f29396e67a425ce6f95c91408b5b` |
| Build environment | ESP-IDF 5.5.3; Node 22.22.3 via fnm |

For rebuilding, use the implementation commit and run `./tools/validate.sh`; its firmware gate creates and verifies the merged image. Build timestamps and version metadata may change binary hashes in a later build. An app-only image must not be written at `0x0`. A merged refresh can reset NVS/PHY data; a whole-chip erase is not required.

## Observed validation

| Check | Result and scope |
| --- | --- |
| Build | PASS: full gate, partition/layout verification and matching archived artifacts. |
| Host tests | PASS: 29 web tests, all 519 catalog bitmap round trips through production C, exact oscillator periods, native LVGL with 234 device glyphs and 300 page transitions, 690 web glyphs, and actual WASM/native sound interoperability. |
| Browser | PASS on desktop Chromium and a 393×852 emulated mobile viewport: editing, gestures, image calculation/adoption/undo and WAV reception. GitHub's public build also completed catalog, image and WAV checks. This is not a physical phone test. |
| Device tests | PASS for flashing/hash verification, exact boot identity, complete acoustic reception of 17 data fragments, CRC `853CAB7E`, 123 cells, physical apply and continued evolution confirmed by the user. Logs reached 575 generations at approximately 5 generations/second with normal-brightness state after 90 seconds. |
| China hosting | PASS: 13 anonymous HTTPS resource downloads match the tested build byte-for-byte; script MIME types, direct access without an HTTP proxy, same-origin script paths and response policies were checked. |
| Unverified | Real browser microphone reception, physical iPhone/Android/Safari compatibility, noise/distance success rates, the full visual/key matrix, long-duration operation, power consumption and paused sleep/wake. |

Listening used 46,576 bytes for the decoder, with 39,784 bytes free heap, a 31,320-byte recorded minimum and a 26,624-byte largest block. After reception stopped, free heap was 96,648 bytes and the largest block 81,920 bytes. A low-amplitude test retained only 14/17 fragments before expiry and did not apply a partial board. Doubling the file playback gain then completed the first round. This is one observed setup, not a room-reliability guarantee.

The observed windows included six I2S channel-close warnings, followed by successful audio open/suspend. No crash or watchdog reset was observed. The source BSP remains unchanged.

## Website hosting and artwork

The Studio uses `static`, `platform/2v-cpu-8g-mem` (labelled free CPU in the configuration), public access and OAuth disabled. No paid hardware was selected. The [platform resource policy](https://modelscope.cn/docs/studios/resource-selections) states that idle free instances sleep and reopen on access; startup can take time, and future platform terms are outside this project's control. Use the direct address for microphone reception; the Studio entry shows startup status.

The [3:4 cover](../assets/images/life-passport-cover.png) is AI-generated gameplay artwork. The native LVGL [application page image](../assets/images/life-ui-pages.png) shows actual program renders. Neither is a physical-device photograph. Code is MIT, Noto Sans SC fonts retain OFL-1.1, and the catalog/module data retains CC-BY-SA-3.0 notices.
