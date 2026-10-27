[简体中文](README.zh_CN.md) · **English**

# Life Passport

Conway's Game of Life on the FoloToy AI Passport: a redesigned Chinese interface,
a 36×32 board, three-button controls, and a 200ms default generation interval.
The complete [upstream AI Passport project](https://gitee.com/FoloToy/ai-passport)
and its BSP are retained. Application development lives on `feature/game-of-life`.

![Application pages rendered by the real native LVGL program](assets/images/life-ui-pages.png)

The image is a native LVGL render of the actual application, not a device photograph.

## Behavior

| Area | Behavior |
| --- | --- |
| Simulation | B3/S23, synchronous updates, visible board border, wraparound or finite edges. |
| Opening | Five-cell R-pentomino, automatically running at five generations per second. |
| Patterns | R-pentomino, glider, pulsar, blinker, lightweight spaceship, random 28% density, empty board. |
| Editing | Toggle cells using the three physical keys; pause, step and reseed. |
| Power | Running stays at normal brightness. After manual or automatic pause: dim at 30s, blank at 90s, deep sleep at 5min. |
| Persistence | Deep sleep retains the paused board in RTC memory. Hardware power-off restarts the opening pattern. |
| External seeds | Validated BLE receiving with local physical confirmation. Phone delivery is under research; no Android installation is required. |

## Controls

| Screen | UP / DOWN | OK | Hold OK |
| --- | --- | --- | --- |
| Simulation | UP cycles speed; DOWN pauses and advances once | Play / pause | Tools |
| Tools / patterns | Move selection | Apply | Return |
| Editor | Move column; hold UP/DOWN to change row | Toggle cell | Return paused |
| Received seed | No simulation change | Apply; press again to run | Cancel and restore |

## Build and verification

Target: ESP32-C3, 8MiB Flash, no PSRAM, 240×320 display, ESP-IDF **5.5.3**.
Start with [AGENTS.md](AGENTS.md) and the [environment guide](docs/development/engineering/environment-setup.md).

```sh
./tools/validate.sh --static
./tools/validate.sh
```

The full gate retains a merged image under `build/firmware/<sha256>/` with matching
ELF/MAP and a manifest. A merged image is flashed at **0x0**, can reset NVS/PHY
data, and requires authorization for the target device. Do not flash an app-only image at 0x0.

| Check | Latest application result |
| --- | --- |
| Build | PASS: full ESP-IDF gate and merged-image verification. |
| Host tests | PASS: rules, timing, power state, protocol, CRC and native LVGL/font/layout checks. |
| Device tests | PASS for authorized flashing, boot and 75s observation: generation 150 at 30s, 300 at 60s, normal-bright state, stable heap, no watchdog reset. |
| Unverified | Full physical-key matrix, visual color/font review, sleep/wake retention, battery operation and measured current. Acoustic seed transfer is not implemented. |

The tested merged image is `8fc2e34c775f65c40a67b969eda3a416958a2ac3035e3c376ff2d5c4eef28b80`.
Firmware, private logs and local environment caches are excluded from Git.

See [application details](docs/game-of-life.md), [external seed status and BLE protocol](docs/mobile-control.md),
and the [upstream documentation index](docs/README.md). The retained `mobile/` directory
is an exploratory prototype, not the selected seed-sharing method.

## License

Project code follows the upstream [MIT license](LICENSE). Noto Sans SC font subsets
retain their [OFL-1.1 license](assets/fonts/OFL.txt) and notices.
