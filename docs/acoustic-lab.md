[简体中文](acoustic-lab.zh_CN.md) · **English**

# Acoustic seed laboratory

Open [Life Passport](https://unstone.github.io/life-passport/) on a phone. No application installation, Bluetooth pairing, microphone permission or account is needed. The page generates sounds locally and cannot know whether the board received them; compare the board's sequence, payload and CRC yourself.

## User flow

This diagnostic build starts in microphone receive mode after a cold boot. Start at 10cm in a quiet room, phone media volume 50%, page encoding volume 20%; adjust downward if the board shows clipping. The receive page stays lit while listening.

| Device input | Result |
| --- | --- |
| OK in receive mode | Pause/resume microphone capture. |
| DOWN in receive mode | Clear counters and last packet display. |
| Hold OK in receive mode | Stop microphone and return to tools; choose return to simulation to play. |
| Valid diagnostic packet | Show sequence and seven payload bytes; never replace the board. |
| Valid key packet | Stop capture and preview the reconstructed board, paused. |
| OK in preview | Apply, still paused; another OK starts evolution. |
| Hold OK in preview | Restore the old board and resume the receive page. |

The tools entry for acoustic reception starts listening again. Running simulation stays bright; paused simulation retains its 30s dim / 90s blank / 5min sleep policy. Disable `CONFIG_LIFE_ACOUSTIC_LAB_BOOT` for the normal R-pentomino opening on cold boot.

## LP1 protocol

The fixed board is 36 columns × 32 rows, B3/S23. A ten-character, case-insensitive base36 key selects a reproducible initial board. The [LP1-B1 extension](world-editor.md) additionally transports arbitrary edited boards and supports PC/mobile browser reception; the table below defines the original short key/diagnostic packets.

| Byte | Meaning |
| --- | --- |
| 0–1 | ASCII `LP`. |
| 2 | Version `1`. |
| 3 | Kind bits 0–1: diagnostic=0, key=1. Bit 2 wrap; bits 3–4 speed index `{125,200,500,1000}` ms. Bits 5–7 zero. Diagnostic flags must be zero. |
| 4 | Sequence, 0–255. |
| 5–11 | Seven diagnostic bytes or a little-endian integer key, strictly below `36^10`. |
| 12–15 | Little-endian IEEE CRC32 of bytes 0–11. |

LP1 uses xorshift64*: state=key, zero substitutes `0x9E3779B97F4A7C15`; xor shifts right 12, left 25, right 27, then multiply by `2685821657736338717` modulo 2^64. In row-major order each of 1152 cells is alive when the output modulo 100 is below 28. The board CRC uses the 144-byte row-major, least-significant-bit-first bitmap. Shared [reference vectors](../tests/audio_vectors.json) verify C, Python and JavaScript implementations.

GGWave adds its own modulation, DSS and Reed–Solomon protection. The receiver enables only `AUDIBLE_FASTEST` and `DT_FASTEST`, fixed **16-byte** packets, 24kHz mono I16, 512-sample FFTs. Browser synthesis uses the same tone spacing with a canonical 48kHz / 1024-sample encoder and the actual AudioContext output rate. There is no ultrasonic mode or outer erasure code in LP1. CRC rejects damaged data; it is not authentication.

Audio is streamed through the existing BSP; no recording is retained. A dedicated worker owns capture and GGWave, publishes a locked view, and queues only validated seeds to the application owner. LVGL remains under the BSP lock. Leaving the page joins the worker before codec suspend; initialization/read/decode/cleanup errors are visible and require an explicit retry. Repeated identical consecutive packets increment the duplicate count without reapplying seeds. The board stops listening during a pending preview.

## Manual acceptance

The public page's **test cases and records** tab contains these same case IDs and exports locally entered results as JSON. A test record is a human observation, never an automatic acknowledgement.

| ID | Action | Expected observation |
| --- | --- | --- |
| TC01 | Listen silently for 10s. | Valid count unchanged; record baseline dBFS. |
| TC02 | Play 1000Hz at 10cm. | Signal rises; peak within about 47Hz of 1000Hz; no valid packet. |
| TC03 | Play the 1000–7000Hz stepped sweep. | Record signal and peak at each band, including weak bands/clipping. |
| TC04 | Play the dual-tone and six-tone tests. | Signal changes; strongest peak belongs to an input tone. A single peak does not prove all tones were detected. |
| TC05 | Clear device counters, send six-tone all-00 diagnostic once. | Sequence matches page; seven bytes `00000000000000`; board unchanged. |
| TC06 | Repeat with FF, alternating 55AA, ascending 00–06. | Exact seven-byte matches, including high bits; board unchanged. |
| TC07 | Repeat TC05/06 with dual-tone. | Compare actual reliability and duration with six-tone. |
| TC08 | Clear counters, send ten random diagnostic frames. | Ideally valid minus duplicates = 10; last sequence/payload match page. Record actual count. |
| TC09 | Send a deliberately wrong-CRC diagnostic. | Valid count unchanged; no board change. Reject count may rise. |
| TC10 | Pause capture, start a loop, resume capture after 2s. | A later repetition is received; identical repeats are counted without changing the board. |
| TC11 | Send `0123456789`, stop sound after preview. Compare population/CRC/pattern; OK twice. | Identical initial board; first OK applies paused, second runs. |
| TC12 | Send `ZZZZZZZZZZ`, then hold OK in preview. | No overflow/reset; cancellation restores the old board and receive mode. |
| TC13 | Ten packets at 10/30/50cm; change volume or add normal speech separately. | Record actual successes, clipping and decode time. Change one condition at a time. |
| TC14 | Stop playback; pause/resume/exit/re-enter capture ten times. | No residual sound, frozen controls or reboot; game runs with the screen lit. |

Do TC01, TC02, TC05 and TC11 first. For TC08/13 record phone/browser, distance, page volume, phone media volume, protocol, valid/duplicate/reject counts and maximum decode time. “Reject” includes decoder failures and does not count every inaudible/lost packet. Never infer packet success from signal level alone.

## Reproduce

Clone with `--recurse-submodules` or run `git submodule update --init --recursive`. Activate ESP-IDF 5.5.3 and Node 22.22.3 through fnm; run `./tools/validate.sh` for repository/host/native LVGL checks, firmware/merged-image verification and browser-WASM/native audio interoperability. See [site commands](../site/README.md) and [GGWave integration](../components/ggwave/README.md).

Publish only `site/dist/` to the `gh-pages` branch after `npm run build --prefix site`, with `.nojekyll`; configure GitHub Pages to use that branch root. Assets use relative URLs for the `/life-passport/` path. Confirm the live page and downloaded WAV before flashing the verified merged image at **0x0**. The test report supplied with the firmware records the exact hash, physical results and remaining phone/room tests.
