[简体中文](README.zh_CN.md) · **English**

# Life Passport acoustic website

The editor also provides a searchable 519-pattern catalog, native two-finger zoom/pan, and image-derived natural oscillators. Upload an image, compute a period-2/3/4 approximation, inspect genuine B3/S23 evolution, then explicitly adopt and transmit it. Images remain local. The image solver is loaded only when computing; computation can be stopped while retaining a verified result. See the [algorithm, limits and acceptance cases](../docs/world-editor.md#image-derived-natural-oscillation).

[Public page](https://unstone.github.io/life-passport/) · [World editor and reception](../docs/world-editor.md) · [Laboratory cases](../docs/acoustic-lab.md). This Chinese static page supports desktop/touch painting, undo/redo, preview, JSON import/export, key and complete-board audio sending, and explicit microphone or WAV reception. A received board is previewed before applying it. Audio stays local; stopping/backgrounding releases capture. Sending alone supplies no acknowledgement. Human test records remain in localStorage and export as JSON.

Use fnm with Node **22.22.3**. The complete gate installs the declared dependencies; development commands are:

```sh
fnm use 22.22.3
npm ci --prefix site
npm run dev --prefix site
python3 tools/test_life_audio.py
npm run build --prefix site
```

`tools/test_life_audio.py` builds the full native GGWave dependency, tests production C packet parsing, all-FF binary payloads, wrong CRC rejection, shared board vectors and actual npm WASM waveforms at 24/44.1/48kHz output. The waveform is resampled to the board's fixed 24kHz ADC rate before decoding. These software tests do not establish real phone/room reliability.

Publish `dist/` plus `.nojekyll` to the root of `gh-pages`; all asset URLs are relative. Vite's resolution explicitly selects WaveFile's documented CommonJS entry so Node and browser builds use the same API. GGWave 0.4.0, crc-32 1.2.2, WaveFile 11.0.0, logic-solver 2.0.1 and Vite 8.3.5 are locked in `package-lock.json`. Build copies project, dependency and font licenses into `LICENSES.txt`; [font generation](../assets/README.md) verifies the included Chinese subset.
