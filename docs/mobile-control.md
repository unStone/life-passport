[简体中文](mobile-control.zh_CN.md) · **English**

# Mobile seed editor

The selected phone test route is the [browser acoustic laboratory](acoustic-lab.md), which sends a reproducible key without an Android application. Flutter prototype sources are retained for future evaluation; the feature table below describes that prototype. The board's validated BLE receiver remains available and requires physical confirmation for complete seeds.

## Behavior

| Area | Contract |
| --- | --- |
| Editor | Full 36×32 grid, touch painting/erasing, undo, presets, random density, preview and clear. |
| Voice | Phone speech recognition and a text equivalent support explicit preset/density commands; no unconfigured cloud/model service is implied. |
| Connection | Discover only the Life service, request platform permissions, connect, subscribe, and disconnect explicitly. Android/iOS use the same BLE protocol. |
| Transfer | One request at a time, progress by acknowledged BLE writes, final success only after a matching application acknowledgement. Errors, timeout and disconnect remain visible. |
| Board confirmation | A valid seed is previewed paused; OK applies it, holding OK cancels and restores the previous board. The confirmation screen stays lit while the phone remains connected; normal idle power management resumes after confirmation or disconnection. Invalid/partial requests never change the board. |
| Independence | The board runs without a phone. The default interval is 200ms; input processing remains independent. |
| Delivery | The current deliverable is the board firmware. The retained mobile prototype is not an installation prerequisite or a selected sync method. |

## Protocol

BLE uses the Life control service `e13b0001-c18b-4a9f-8949-7e9aa6579220`, RX `e13b0002-...` with write response, change notification `e13b0003-...`, and read-only status `e13b0004-...` on the same 128-bit base. Read and notification characteristics are separate to avoid CoreBluetooth's shared value-update delegate ambiguity. The advertised name is `LifePassport`. No accounts, credentials or personal text are transferred. Every seed requires local physical confirmation; game data is not a private-data channel.

Requests are newline-terminated JSON, at most 1023 bytes, with `v=1`, positive 32-bit `id`, `op="seed"`, `w=36`, `h=32`, 32 integer `rows`, `crc`, `interval_ms` and Boolean `wrap`. Bit x of row y denotes cell (x,y). Each row is below 2^36, exactly representable by JSON consumers. CRC32 is IEEE/zlib CRC over the 144-byte board packed row-major, least-significant bit first. Allowed intervals are 1000, 500, 200 and 125ms.

Partial input expires after five seconds. Oversized input is discarded through the next newline. cJSON parses complete requests; dimensions, types, integer bounds and CRC are validated before an application task sees a seed. A pending preview rejects another seed. Repeating the same id/checksum returns its current acknowledgement; reusing an id for different content is rejected.

TX notifications contain the short token `changed`; clients read the complete JSON from the separate status characteristic, including via GATT long read at MTU 23. Replies include `v`, matching `id`, `ok`, `crc` and `state` (`processing`, `preview`, `applied`, `cancelled`) or an error. Only preview/applied/cancelled counts as an application acknowledgement. BLE callbacks only parse bounded input and queue work; the owner task changes application state and publishes acknowledgements. LVGL access remains under the BSP lock. Disconnect clears partial input and keeps the last complete transaction result. The official cJSON parser is compiled with nesting limit four to bound stack use for untrusted input.

## Verification

Implement/test the codec and state transition first, then BLE, then the mobile caller. Host checks cover fragmentation, malformed JSON, bounds, checksum, timeout and preview/commit/cancel. Flutter checks cover model/voice commands, framing, acknowledgement identity and editor interaction. Build the full firmware gate, Android and iOS, then flash the exact verified merged image and observe boot/generation/UI time/heap/watchdog logs. Real phone permissions, speech, pairing, display and sleep remain separate physical checks.
