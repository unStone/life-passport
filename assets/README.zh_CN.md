<p align="right">
  <strong>简体中文</strong> · <a href="README.md">English</a>
</p>

# 资源目录（Assets）

本目录集中存放可复用的资源（字库、图片、音乐等），按资源类型分子目录管理。每个资源放在其类型对应的子目录，并记录放置路径、命名方式、集成方式与来源/许可。二进制资源（字体、图片、音频）不属于纯 markdown 文档，请勿与文档混放。涉及版权/授权的资源需注明来源与许可。

## 字库（fonts）

生命游戏使用 `fonts/life_font_16.c`：Noto Sans SC Medium（字重500），16px、4bpp、无压缩，
覆盖 `fonts/life_font_inventory.json` 记录的码点，包括可打印 ASCII 和全部固定中文界面。
`fonts/OFL.txt` 保留 OFL-1.1 许可，源字体为
[Noto Sans SC Variable](https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf)。
`fonts/life_font_inventory.json` 记录源文件和输出的 SHA-256 与全部码点，
`fonts/life_font_codepoints.h` 提供运行时字形检查清单；应用不接收外部文本。

通过 fnm 选择 Node 22.22.3，执行 `npm ci --prefix tools/font`，在 Python 虚拟环境
安装 `tools/font/requirements.txt` 后执行
`python3 tools/generate_life_font.py --source <NotoSansSC-VF.ttf>` 生成被链接的字体。
转换器固定为 `lv_font_conv` 1.5.3，参数为
`--size 16 --bpp 4 --format lvgl --no-compress --no-prefilter`。
FontTools 4.60.1 在转换前将可变字体实例化为字重500，`fonts/NOTICE.txt` 保留版权声明。
修改界面文字后执行 `python3 tools/generate_life_font.py --check`。
原生 LVGL 渲染和实物中文显示需要分别验证。

手机应用使用 `fonts/life_mobile.ttf`，由 `tools/generate_mobile_font.py` 同步到
Flutter 资产目录；源字体同为字重500的开放许可 Noto Sans SC，根据固定 Dart 界面
生成子集，记录于 `fonts/life_mobile_inventory.json`。使用相同 Python 环境及
`--source <NotoSansSC-VF.ttf>` 重建，`--check` 校验覆盖与两份资产的哈希；
外部识别文字使用正常的平台字体回退，不宣称固定子集覆盖任意输入。

可复用的字库文件与生成的字库源码放在 `fonts/`。

声音网页使用 `fonts/life_web.ttf`，连同OFL和版权声明同步至 `site/public/fonts/`。
`tools/generate_web_font.py --source <NotoSansSC-VF.ttf>` 根据全部HTML与JavaScript界面文字，
从相同字重500源字体生成子集；`--check` 根据 `fonts/life_web_inventory.json` 检查覆盖与两份哈希。

- 命名要能反映字族、字重、字级与格式。
- 记录来源、许可、字符范围、转换命令与目标放置路径。
- 添加字库前评估 Flash 与内部 RAM 影响；ESP32-C3 无 PSRAM。
- 不提交许可不允许分发的字库。

## 种子图鉴

`patterns/catalog.json`包含519个完整适配的Life Lexicon图案，记录来源、细胞数、尺寸、CRC和实测演化行为，同步至 `site/public/patterns/`，仅在用户打开图鉴时加载。
`patterns/NOTICE.txt`与 `patterns/CC-BY-SA-3.0.txt`保留原始许可和贡献者，派生数据继续采用CC-BY-SA-3.0。生成与验证见[图鉴说明](../docs/pattern-catalog.zh_CN.md)。

## 图片（images）

`images/life-controller.svg` 是本应用原创的滑翔机图标（MIT）。
`python3 tools/generate_mobile_icons.py` 使用 librsvg 和 ImageMagick 生成 Android、
iOS 和网页所需尺寸，生成 PNG 保留在对应平台资产目录。

可复用的源图与生成的显示资产放在 `images/`。

| 文件 | 尺寸与格式 | 用途与来源 |
| --- | --- | --- |
| [`images/life-passport-cover.png`](images/life-passport-cover.png) | 1086 × 1448，PNG，3:4 | 2026-10-28使用内置图像生成工具制作的推广玩法插画，并非设备照片或运行截图；提示词保存在`images/life-passport-cover.prompt.txt`，该图片不嵌入固件。 |
| [`images/life-ui-pages.png`](images/life-ui-pages.png) | 960 × 320，PNG | 分支README使用的实际原生LVGL应用渲染；由`tools/test_life_ui.py`和ImageMagick生成。应用图形遵循MIT，所渲染的Noto Sans SC字形保留字体OFL声明。 |
| [`images/home.jpg`](images/home.jpg) | 3840 × 2160，JPEG | 嵌入中英文项目 README 的产品主图，突出 AI Passport 产品形象与开放、人人可创作的理念。 |
| [`images/readme-hardware-specs.png`](images/readme-hardware-specs.png) | 2172 × 724，PNG RGBA | 保留为可选技术参考图，不再用于首页主视觉。于 2026-09-17 使用内置图像生成工具为本仓库生成；已根据文档中的硬件能力契约核对图中的六项标签与参数。 |
| [`images/logo-wordmark.png`](images/logo-wordmark.png) | 1648 × 336，PNG RGBA | 从仓库原始 `images/logo.png` 中精确裁切并去除背景的黑色字标；用于中英文项目 README 的浅色主题。 |
| [`images/logo-wordmark-dark.png`](images/logo-wordmark-dark.png) | 1648 × 336，PNG RGBA | 提取字标的白色版本；README 使用 `<picture>` 在 GitHub 深色主题下显示。 |

- 使用描述性命名，并记录尺寸、像素格式、转换步骤与目标路径。
- 优先采用适合 240 × 320 RGB565 显示的格式，并纳入 Flash 与内部 RAM 考量。
- 许可允许时保留可编辑源文件，并记录来源与许可。
- 图片中不得包含设备二维码秘密、凭证或个人数据。

## 音乐与音效（music）

可复用的音乐与音效源码放在 `music/`。

- 记录来源、许可、采样率、位深、声道、转换命令与目标路径。
- 与当前 BSP 音频路径匹配时优先采用 16 kHz、16 位单声道 PCM。
- 嵌入音频前评估 Flash 与内部 RAM 成本；长录音应流式或分块。
- 无再分发许可不提交媒体文件。
