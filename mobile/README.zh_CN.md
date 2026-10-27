**简体中文** · [English](README.md)

# 生命种子

这里保留的是原型源码。手机种子同步方式暂缓、重新考虑；本轮设备固件交付不要求安装Android应用。以下内容说明原型能力，供后续评估。

用于 AI Passport 生命游戏的 Android/iOS Flutter 配套应用。支持完整36×32棋盘绘制／擦除、缩放平移、撤销笔画、演化预览、预设与随机密度生成，并可在手机保存最多20份种子。

只有点击麦克风时才开始语音指令输入，系统语音服务可能使用网络，也可以直接输入文字。支持预设名、空白棋盘和0到100%的随机密度；不支持的创意描述会明确提示，不会发送给未配置的模型服务。BLE 只传棋盘，不向 AI Passport 传录音或识别文字。

## 使用

1. 安装 Android APK，或使用自己的 Apple 开发团队签名并安装 iOS 工程；开启设备和手机蓝牙。
2. 点击连接、授予平台权限，选择 `LifePassport`。
3. 编辑或生成种子后点击发送，按20字节带响应分片传输，由设备校验完整事务。
4. 手机只有收到匹配编号／CRC 的回复才显示已接收预览；按设备确定键应用，长按确定取消并恢复原世界，随后再按确定开始演化。

失败／不完整传输不改变棋盘，断开、重连和重试均有明确入口；等待设备确认时禁止再次发送。设备不连接手机也能使用，空闲深睡前会停止蓝牙，再次连接前先唤醒设备。

## 构建和测试

使用 Flutter 3.41.7 / Dart 3.11.5 和提交的锁定文件。依赖固定在 `pubspec.yaml`，BLE 使用 `flutter_reactive_ble` 5.5.0，语音使用 `speech_to_text` 7.4.0，CRC 使用 `archive` 4.5.2。

```sh
flutter --no-version-check pub get
flutter --no-version-check analyze
flutter --no-version-check test
flutter --no-version-check build apk --release
flutter --no-version-check build ios --simulator --debug
flutter --no-version-check build ios --release --no-codesign
```

本地 Android APK 使用开发签名，适合直接测试，不属于应用商店发行包。未签名 iOS 构建不能直接安装：在 Xcode 打开 `ios/Runner.xcworkspace`，选择自己的签名团队和真机，然后构建运行；不要在仓库保存 Apple 账号密码。模拟器和网页界面检查不能证明真实手机的 BLE 或语音兼容性。

网页构建用于界面预览，BLE 仅在 Android/iOS 应用中开放。固定中文界面使用随包分发的 OFL Noto Sans SC 子集，资产与生成流程见仓库[资产说明](../assets/README.zh_CN.md)；Flutter 随包收录依赖许可，字体声明位于 `assets/fonts/`。

完整[通信协议与验收标准](../docs/mobile-control.zh_CN.md)。
