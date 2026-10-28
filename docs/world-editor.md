[简体中文](world-editor.zh_CN.md) · **English**

# World editor and browser reception

The public [China-hosted Life Passport page](https://ssstone0903-life-passport.ms.show/) and [GitHub Pages mirror](https://unstone.github.io/life-passport/) support desktop mouse/keyboard and mobile touch editing, sending and microphone reception. The receiver displays a verified preview; applying it replaces the editor content with an undo step. Rejected, partial and cancelled transfers never replace the editor or device board. See the [deployment and verification record](life-passport-release.md) for measured checks and remaining physical tests.

## Interaction contract

| Action | Behavior |
| --- | --- |
| Draw / erase | One pointer stroke is one undo step; interpolation fills skipped cells. Right mouse button erases. Cancelled pointers restore the stroke. |
| Zoom / move | Continuous 1×–6× pinch zoom and two-finger pan. Adding a second finger cancels the uncommitted stroke; painting resumes after all fingers lift. PC uses Ctrl/Command wheel and Space-drag; reset view does not modify cells. |
| Catalog | 519 complete named patterns with category/search/thumbnail selection; loading is undoable. See the [catalog data and validation](pattern-catalog.md). |
| Image | Upload, adjust threshold/inversion, choose period 2/3/4 and compute a locally generated approximation. Preview genuine evolution, then explicitly adopt and send; adopting and its settings are undoable together. |
| Keyboard | Arrows move the cursor, Space toggles, Enter draws, Delete/Backspace erase; Ctrl/Command Z and Shift Z undo/redo. |
| Clear / replace | Clear, load key, random world and import are undoable; retain 100 undo states and redo until the next change. |
| Preview | Simulate B3/S23 with current boundary/interval. Pause adopts the current generation in one undo step; cancel returns to the original. Sending is disabled during preview. |
| Save | Export/import bounded JSON containing the 144-byte bitmap, settings and CRC. Editor content lives in the current page; export before leaving. |
| Send | Preserve the short LP1 key packet while its exact generated board is unchanged. Editing switches to complete-board transport. Controls lock during encoding/playback; stop cancels pending encoding. |
| Receive | Explicit start requests microphone permission. Show signal, decoded packet counts and fragment progress; stop, backgrounding, complete reception or failure closes tracks/context/worker. |
| Apply / discard | Complete reception stops capture and shows a separate board, population, CRC and settings. Explicit apply creates an undo step; discard preserves the editor. |

Browser reception requires HTTPS/localhost, WebAssembly, module Worker and AudioWorklet in a current Safari/Chrome. The audio graph is requested at 48kHz; browser audio processing resamples the actual source. A 2048-sample worklet transfers PCM to a Worker, where fixed-length GGWave RX runs. Only audio processing stays active; no recording is retained or uploaded. More than four outstanding PCM blocks stops capture with a visible error instead of silently dropping data. WAV import uses the same worker/packet validation and is bounded to 15MB / 120s / two channels. Permission rejection and unsupported APIs remain visible.

## Image-derived natural oscillation

The browser's native image decoder reads the selected file (maximum 20MB / 36 megapixels), fits it proportionally, and samples a 36×32 target. Otsu thresholding, an adjustable threshold and inversion extract foreground; transparent pixels remain background. The original image is not uploaded. Simple icons produce more recognizable approximations than photographs.

The initial layout fits phases/orientations of verified isolated B3/S23 oscillators to the target, with separation based on each oscillator's complete phase envelope. A lazily loaded Worker then uses logic-solver 2.0.1 / MiniSat to optimize overlapping 8×8 areas. Variables cover every phase; constraints enforce all Life transitions, the adjacent fixed-cell halo, the selected boundary and exact period, and retain a minimum amount of motion. The objective assigns a cost of four to a missed foreground cell and one to an extra cell. Every candidate is independently evolved and must return to its initial board at the requested exact period. The displayed match is foreground Dice overlap with generation zero; accepted visible results do not decrease this metric. This is bounded local optimization, not a global optimum or an exact image reconstruction guarantee.

The user chooses a 10/20/40-second budget. A four-window Worker batch bounds retained solver heaps; the owner can terminate a busy worker at the deadline, on stop, close or backgrounding. The best independently validated result remains available. Preview repeatedly computes ordinary Life steps without resetting at a period boundary. Applying is explicit; closing or errors never replace the editor draft. Changing image, threshold, inversion, period or boundary invalidates the result. Period metadata is local UI information; the acoustic transfer sends ordinary cells/settings, requiring no new rule or oscillator support on the device.

The constructive modules are derived CC-BY-SA-3.0 pattern data, generated by `node tools/catalog/build_image_modules.mjs` from the pinned catalog. Their source, phase envelopes and license are retained in `assets/patterns/image-modules.json`; the application and solver licenses remain separate in `site/public/LICENSES.txt`.

## Complete-board extension: LP1-B1

The existing key/diagnostic wire format and GGWave settings remain as in the [acoustic laboratory](acoustic-lab.md). B1 uses the previously unused LP1 types 2 and 3, so old firmware rejects it while continuing to receive keys. Upgrade device firmware for edited boards.

| Bytes | B1 interpretation |
| --- | --- |
| 0–2 | ASCII `LP`, version 1. |
| 3 | Bits 0–1: chunk=2, header=3; bit 2 wrap; bits 3–4 speed index `{125,200,500,1000}`; bits 5–6 codec; bit 7 zero. |
| 4 | Header: 255. Chunk: zero-based index, at most 28. |
| 5–6 | Little-endian random 16-bit transfer ID. |
| 7–11, header | Encoded length (1 byte, 1–144), then little-endian CRC32 of the full 144-byte bitmap. |
| 7–11, chunk | Five encoded bytes; the final chunk is padded with zero bytes. |
| 12–15 | IEEE CRC32 over bytes 0–11, little-endian. |

All chunks repeat the header's settings. ID and settings must match; out-of-range indices and nonzero tail padding are rejected. Duplicate chunks must match byte-for-byte. A repeated identical header retains good chunks across loops; a different ID starts a new transfer. Conflicting metadata/content for the same ID clears the transaction and reports rejection. Chunks arriving before a header are ignored; a loop supplies the next header. Incomplete reception expires after 15s without a valid matching frame or 120s total. Only successful decompression and whole-bitmap CRC verification produce a seed. CRC is not authentication; the 16-bit ID separates transfers and is not an integrity guarantee.

| Codec | Exact representation |
| --- | --- |
| 0 | Raw 144-byte row-major bitmap, least-significant-bit first. |
| 1 | Three-byte little-endian crop header: `x | y<<6 | (width-1)<<11 | (height-1)<<17`; top two bits zero, followed by the row-major cropped bitmap. Bounds and padding are checked. |
| 2 | Live positions: one-byte count, at most 103; strictly increasing 11-bit cell indices, packed least-significant-bit first. |
| 3 | Dead positions in the same format, with all other cells alive. |

Choose the shortest representation, retaining raw as the bound. A small blinker can use one data chunk plus a header; a dense uncompressible board requires 29 data chunks plus a header. At current measured waveform lengths, one pass including 0.35s gaps is about 1.724–25.86s for six-tone, or 3.516–52.74s for dual-tone. Missed frames and replay add time. Complete-board loops repeat the same transfer ID and content for at most 180s; short-packet loops remain bounded to 60s. A new send creates a new ID.

## Validation and manual acceptance

Implementation follows model/protocol → C/browser assembly → device worker → editor/capture UI. Host tests must compare exact bitmaps across JavaScript and production C, exercise missing/out-of-order/repeated/conflicting frames, invalid codecs/padding/CRC, expiry and maximum bounds. Actual WASM waveforms are decoded by both browser and native code, including whole multipart boards. Layout checks cover desktop and mobile, with mouse, keyboard and touch pointer paths. Hardware timing and phone acoustics remain separate observations.

| Case | Action and expected result |
| --- | --- |
| TC15 | On PC, clear and drag a line, erase, undo/redo; one undo removes one stroke. Keyboard edits work with canvas focus. |
| TC16 | On mobile, draw, pinch zoom/pan with two fingers, then move the remaining finger before lifting both. Gestures do not paint or create undo entries. |
| TC17 | Preview, cancel, preview again and pause; cancel preserves the seed, pause adopts a generation, undo restores it. Export/import reproduces the CRC. |
| TC18 | One PC/phone sends a hand-drawn board, another receives. Compare bitmap/population/CRC; discard preserves the old editor, apply is undoable. |
| TC19 | Start reception in the middle of a loop, interrupt sound and resume. Only the complete verified board previews; progress retains matching good chunks. Stop/background releases the microphone. |
| TC20 | Send hand-drawn board to upgraded AI Passport. Compare board/CRC, apply/cancel physically; world-code packets continue to work. |
| TC21 | Search/filter the catalog on PC and phone, load a pattern, preview, undo and send; all patterns fit without clipping. |
| TC22 | Check the simplified device tools/information menus, with no onboard catalog, cell editor or operating-manual page. |
| TC23 | Upload a simple icon on PC and phone, compute periods 2/3/4, inspect the approximate outline and repeating preview, adopt, undo and redo; settings and cells restore together. |
| TC24 | Stop during optimization, close/background the page, or change threshold/period. Only validated results can be adopted; cancelled tasks cannot replace the draft. Send an adopted image result and compare its CRC at the receiver. |

Run `./tools/validate.sh` with ESP-IDF 5.5.3 and Node 22.22.3. Test both denial and grant of browser microphone permissions, worker/worklet loading on the deployed subpath, and clean stop while permission or decoder loading is pending. Report browser simulation/file decoding separately from real microphone and device acoustic tests.
