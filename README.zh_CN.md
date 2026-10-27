**简体中文** · [English](README.md)

# Life Passport 生命游戏

基于FoloToy AI Passport的康威生命游戏：独立中文界面、36×32棋盘、三键操作，
默认每200ms演化一代。保留完整[上游AI Passport项目](https://gitee.com/FoloToy/ai-passport)
及其BSP，声音功能开发位于`feature/acoustic-lab`分支。

手机打开[声音网页](https://unstone.github.io/life-passport/)，按[14项手动用例](docs/acoustic-lab.zh_CN.md)测试，无需安装手机应用。

![实际原生LVGL程序渲染的应用页面](assets/images/life-ui-pages.png)

图片来自真实应用的原生LVGL渲染，不是设备摄像照片。

## 行为

| 范围 | 行为 |
| --- | --- |
| 演化 | B3/S23、同步更新，可见棋盘边框，可选环绕或有限边界。 |
| 开机 | 此测试版直接监听声音；长按确定返回工具／游戏。关闭 `LIFE_ACOUSTIC_LAB_BOOT` 可恢复自动运行R五连块。 |
| 图案 | R五连块、滑翔机、脉冲星、闪烁器、轻型飞船、28%密度随机宇宙、空白。 |
| 编辑 | 使用实体三键切换细胞生死，支持暂停、单步和重新播种。 |
| 电源 | 运行时保持正常亮度；手动或自动暂停后，30秒调暗、90秒熄屏、5分钟深睡。 |
| 存储 | 深睡通过RTC内存保留暂停棋盘；硬件断电后重新开始开机图案。 |
| 外部种子 | LP1声音key接收与诊断包，保留BLE；有效种子需由实体键确认。 |

## 操作

| 页面 | 上键／下键 | 确定键 | 长按确定 |
| --- | --- | --- | --- |
| 演化 | 上键调速；下键暂停并单步 | 播放／暂停 | 工具 |
| 工具／图鉴 | 移动选择 | 应用 | 返回 |
| 编辑 | 移动列；长按上下换行 | 切换细胞 | 返回并暂停 |
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
| Build | 针对交付的精确固件执行完整门禁；随附报告含合并镜像校验。 |
| Host tests | 门禁覆盖协议／CRC、共用key、原生LVGL／字体与真实WASM／原生声音互通。 |
| Device tests | 随固件交付的报告单独记录精确启动、资源与声音观察结果。 |
| Unverified | iPhone／Android播放和房间可靠性、完整实体按键组合、肉眼显示检查、电池／功耗与休眠唤醒。 |

固件、原始私有日志和本地环境缓存不进入Git。

参见[应用说明](docs/game-of-life.md)、[外部种子状态及BLE协议](docs/mobile-control.md)
、[压缩与声音抗噪调研](docs/seed-transport-research.zh_CN.md)和[上游文档索引](docs/README.md)。
保留的`mobile/`目录属于探索原型，不是已经选定的种子共享方式。

## 许可

项目代码遵循上游[MIT许可](LICENSE)；Noto Sans SC字体子集保留
[OFL-1.1许可](assets/fonts/OFL.txt)和版权声明。
