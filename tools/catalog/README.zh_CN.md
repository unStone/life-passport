**简体中文** · [English](README.md)

# 图鉴数据工具

这些构建工具将已核对的Life Lexicon转换为[网页图鉴](../../docs/pattern-catalog.zh_CN.md)。发布后的应用使用生成数据，运行时不依赖Python、Rust、GitHub或ConwayLife。

通过fnm使用Node 22.22.3，配合Python 3.9+与Rust／Cargo。缓存放在已忽略的 `work/`；`requirements.txt`和 `../catalog-parser/Cargo.lock`声明并锁定格式依赖。图案使用 `ca-formats` 0.3.5公开Plaintext接口解析，HTML与元数据使用BeautifulSoup／html5lib。

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

提取器拒绝不同提交或许可声明，中间请求、解析坐标和来源元数据保存在 `work/catalog/`。生成器使用生产网页模型，排除越界／无实质演化的示例，去除对称及周期相位重复，满足至少200项后才输出；标准数据与声明位于 `assets/patterns/`，同步发布文件，并在 `work/catalog/`输出验证摘要。

图片模块生成器为2／3／4代周期各选择一个小型已验证振荡器，按完整周期的包围范围保留每个相位坐标，输出标准 `assets/patterns/image-modules.json` 和完全一致的网页 `site/src/image-modules.json`，保留CC-BY-SA-3.0来源信息。

原始CC-BY-SA-3.0许可全文保留于 `assets/patterns/CC-BY-SA-3.0.txt`，生成时保持原文。修改任何显示文字后，使用 `tools/generate_web_font.py`重建／检查网页字体，并运行完整验证。
