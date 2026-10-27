[简体中文](README.zh_CN.md) · **English**

# Life Passport acoustic website

[Public page](https://unstone.github.io/life-passport/) · [Protocol and manual cases](../docs/acoustic-lab.md). This Chinese static page generates a reproducible seed preview, tones, fixed diagnostic packets and WAV files. It also stores human test records in this browser's localStorage and exports JSON. No recording, account, BLE connection or receiver acknowledgement is implied.

Use fnm with Node **22.22.3**. The complete gate installs the declared dependencies; development commands are:

```sh
fnm use 22.22.3
npm ci --prefix site
npm run dev --prefix site
python3 tools/test_life_audio.py
npm run build --prefix site
```

`tools/test_life_audio.py` builds the full native GGWave dependency, tests production C packet parsing, all-FF binary payloads, wrong CRC rejection, shared board vectors and actual npm WASM waveforms at 24/44.1/48kHz output. The waveform is resampled to the board's fixed 24kHz ADC rate before decoding. These software tests do not establish real phone/room reliability.

Publish `dist/` plus `.nojekyll` to the root of `gh-pages`; all asset URLs are relative. Vite's resolution explicitly selects WaveFile's documented CommonJS entry so Node and browser builds use the same API. GGWave 0.4.0, crc-32 1.2.2, WaveFile 11.0.0 and Vite 8.3.5 are locked in `package-lock.json`. Build copies project, dependency and font licenses into `LICENSES.txt`; [font generation](../assets/README.md) verifies the included Chinese subset.
