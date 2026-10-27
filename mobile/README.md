[简体中文](README.zh_CN.md) · **English**

# Life Seed Studio

This is a retained prototype. The phone sync method is deferred for reconsideration; installing an Android application is not a requirement of the current board-firmware delivery. The instructions below describe the prototype for future evaluation.

Android/iOS Flutter companion for the AI Passport Game of Life. Draw or erase on the complete 36×32 board, use zoom/pan for precision, undo a stroke, preview evolution, generate presets or random density, and save up to 20 seeds on the phone.

Tap the microphone only when you want to dictate a command. The operating system's speech service may use its network; text input is also supported. Commands include preset names, an empty board, and random density from 0 to 100 percent. Arbitrary creative descriptions are rejected visibly rather than sent to an unconfigured model service. Only board data goes over BLE; recordings and recognized text are not sent to AI Passport.

## Use

1. Install the Android APK, or sign the iOS project with your own Apple development team and install it. Turn on the board and phone Bluetooth.
2. Choose Connect, grant the requested platform permissions, and select `LifePassport`.
3. Edit a seed or generate one, then tap Send. BLE writes use 20-byte acknowledged fragments; the complete transaction is validated on the board.
4. The app shows that a preview has been received only after a matching id/CRC reply. Press the board's OK to apply or hold OK to cancel and restore the previous world. Then press OK to run the new world.

A failed/partial transfer does not modify the board. Disconnect/reconnect and retry are explicit. While a board confirmation is pending, another send is disabled. The board remains usable without a phone and stops its BLE stack before idle deep sleep; wake it before reconnecting.

## Build and test

Use Flutter 3.41.7 / Dart 3.11.5 and the committed lock file. Dependencies are pinned in `pubspec.yaml`; BLE uses `flutter_reactive_ble` 5.5.0, speech uses `speech_to_text` 7.4.0, and CRC uses `archive` 4.5.2.

```sh
flutter --no-version-check pub get
flutter --no-version-check analyze
flutter --no-version-check test
flutter --no-version-check build apk --release
flutter --no-version-check build ios --simulator --debug
flutter --no-version-check build ios --release --no-codesign
```

The local Android APK uses a development signing key, suitable for direct testing rather than a store release. An unsigned iOS build cannot be installed directly: open `ios/Runner.xcworkspace` in Xcode, select your signing team and physical phone, then build/run. No Apple account password belongs in this repository. Simulator and web UI checks do not establish real-phone BLE or speech compatibility.

The web build is a UI preview; BLE is intentionally available only in the Android/iOS applications. The fixed Chinese UI uses a bundled OFL Noto Sans SC subset; assets and generation are recorded in the repository [asset guide](../assets/README.md). Dependency notices are included by Flutter and font notices under `assets/fonts/`.

See the [wire protocol and acceptance checks](../docs/mobile-control.md).
