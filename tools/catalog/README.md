[简体中文](README.zh_CN.md) · **English**

# Catalog data tools

These build-time tools convert the reviewed Life Lexicon into the [web catalog](../../docs/pattern-catalog.md). The published application uses generated data and has no runtime dependency on Python, Rust, GitHub or ConwayLife.

Use Node 22.22.3 via fnm, Python 3.9+ and Rust/Cargo. Keep caches under ignored `work/`; `requirements.txt` and `../catalog-parser/Cargo.lock` declare and lock the format dependencies. The parser uses `ca-formats` 0.3.5's public Plaintext API; BeautifulSoup/html5lib reads HTML and metadata.

```sh
git clone https://github.com/rokicki/lifecontent.git work/lifecontent
git -C work/lifecontent switch --detach 19eeabbf84b94f6a53791774e4377e766e10c0c6
python3 -m venv work/catalog-venv
work/catalog-venv/bin/python -m pip install -r tools/catalog/requirements.txt
CARGO_HOME="$PWD/work/catalog-cargo" CARGO_TARGET_DIR="$PWD/work/catalog-target" cargo build --release --locked --manifest-path tools/catalog-parser/Cargo.toml
work/catalog-venv/bin/python tools/catalog/extract_lexicon.py --source work/lifecontent --parser work/catalog-target/release/life-catalog-parser
fnm use 22.22.3
node tools/catalog/build_catalog.mjs
node tools/catalog/build_image_modules.mjs
python3 tools/test_life_audio.py
```

The extractor rejects a different source commit or license notice. It saves intermediate requests, parsed coordinates and source metadata under `work/catalog/`. The builder uses the production browser model, rejects out-of-bounds/trivial diagrams, deduplicates symmetries and periodic phases, and requires at least 200 qualified patterns before publishing. It writes canonical data/notices under `assets/patterns/`, mirrors public files, and emits a validation summary under `work/catalog/`.

The image-module builder selects a small verified oscillator for each of periods 2/3/4, preserving every phase relative to the whole-cycle envelope. It writes canonical `assets/patterns/image-modules.json` and the browser's identical `site/src/image-modules.json`, retaining CC-BY-SA-3.0 provenance.

The original CC-BY-SA-3.0 license text is retained in `assets/patterns/CC-BY-SA-3.0.txt`; generation preserves it. After changing any displayed catalog text, regenerate/check the website font with `tools/generate_web_font.py` and run the full gate.
