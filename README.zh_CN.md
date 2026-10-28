**简体中文** · [English](README.md)

# Life Passport 生命游戏

基于FoloToy AI Passport的康威生命游戏：独立中文界面、36×32棋盘、三键操作，
默认每200ms演化一代。保留完整[上游AI Passport项目](https://gitee.com/FoloToy/ai-passport)
及其BSP，编辑器开发位于`feature/world-editor`分支。

在PC或手机打开[国内网页](https://ssstone0903-life-passport.ms.show/)或[GitHub备用网页](https://unstone.github.io/life-passport/)，使用[编辑器与麦克风接收](docs/world-editor.zh_CN.md)，或按[实验用例](docs/acoustic-lab.zh_CN.md)测试，无需安装手机应用。
国内免费实例闲置后会休眠，重新访问时激活；详见[已验证固件与部署记录](docs/life-passport-release.zh_CN.md)。

![实际原生LVGL程序渲染的应用页面](assets/images/life-ui-pages.png)

图片来自真实应用的原生LVGL渲染，不是设备摄像照片。

## 行为

| 范围 | 行为 |
| --- | --- |
| 演化 | B3/S23、同步更新，可见棋盘边框，可选环绕或有限边界。 |
| 开机 | 此测试版直接监听声音；长按确定返回工具／游戏。关闭 `LIFE_ACOUSTIC_LAB_BOOT` 可恢复自动运行R五连块。 |
| 图案 | PC／手机图鉴提供519个完整具名图案，支持分类、搜索、预览和来源查看。 |
| 编辑 | PC鼠标／键盘和手机单指绘制，双指缩放／移动，支持撤销／重做和演化预览。 |
| 图片生成 | PC／手机上传图片，计算2／3／4代周期近似图案，验证B3/S23自然循环，预览后声音发送；图片仅本地处理。 |
| 设备菜单 | 声音接收、重新开始、边界、说明和返回演化；说明包含演化法则和软件说明。 |
| 电源 | 运行时保持正常亮度；手动或自动暂停后，30秒调暗、90秒熄屏、5分钟深睡。 |
| 存储 | 深睡通过RTC内存保留暂停棋盘；硬件断电后重新开始开机图案。 |
| 外部种子 | LP1声音key与完整手绘棋盘，保留BLE；PC／手机浏览器也能收音，设备有效种子需实体键确认。 |

## 操作

| 页面 | 上键／下键 | 确定键 | 长按确定 |
| --- | --- | --- | --- |
| 演化 | 上键调速；下键暂停并单步 | 播放／暂停 | 工具 |
| 工具／说明 | 移动选择 | 打开／应用 | 返回上一级 |
| 法则／软件说明 | 无操作 | 返回说明 | 返回说明 |
| 接收种子 | 不改变演化 | 应用；再按一次播放 | 取消并恢复 |

## 构建与验证

目标：ESP32-C3、8MiB Flash、无PSRAM、240×320屏幕、ESP-IDF **5.5.3**。
先阅读[AGENTS.md](AGENTS.md)和[环境指南](docs/development/engineering/environment-setup.md)。

```sh
./tools/validate.sh --static
./tools/validate.sh
```

完整门禁在`build/firmware/<sha256>/`保留合并镜像、匹配ELF/MAP及manifest。
合并镜像从**0x0**刷写，可能重置NVS/PHY数据，烧录前需获得目标设备授权。
禁止将应用单体镜像写到0x0。

| 检查 | 最近应用结果 |
| --- | --- |
| Build | PASS，固件`090a3b9`通过完整门禁与从`0x0`刷写的合并镜像校验。 |
| Host tests | PASS，包含29项网页测试、519个图鉴往返、原生LVGL／字体及真实WASM／原生声音互通。 |
| Device tests | PASS，已验证启动、123细胞完整声音接收、实体确认及持续200ms演化。 |
| Unverified | 网页真实麦克风接收、实体手机／Safari兼容、噪声与距离成功率、完整字形／按键矩阵、电池／功耗与休眠唤醒。 |

固件、原始私有日志和本地环境缓存不进入Git。

参见[应用说明](docs/game-of-life.md)、[外部种子状态及BLE协议](docs/mobile-control.md)
、[压缩与声音抗噪调研](docs/seed-transport-research.zh_CN.md)和[上游文档索引](docs/README.md)。
保留的`mobile/`目录属于探索原型，不是已经选定的种子共享方式。

## 许可

项目代码遵循上游[MIT许可](LICENSE)；Noto Sans SC字体子集保留
[OFL-1.1许可](assets/fonts/OFL.txt)和版权声明。
[Life Lexicon图鉴](docs/pattern-catalog.zh_CN.md)保留CC-BY-SA-3.0及贡献者声明。
