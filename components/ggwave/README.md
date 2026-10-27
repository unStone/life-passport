[简体中文](README.zh_CN.md) · **English**

# GGWave integration

The complete [GGWave repository](https://github.com/ggerganov/ggwave) is retained as the `upstream` submodule, pinned to `060aec73dd7123ccac200442f75bdc7369795ffe` (native 0.4.3). Upstream sources are unchanged. GGWave is MIT; retain its license and the bundled Reed–Solomon license. The browser package is separately pinned to 0.4.0 and tested against this native receiver.

Run `git submodule update --init --recursive` before building. The local CMake adapter compiles the official source as an ESP-IDF component, disables logging, and uses `-O2` for the C3 DSP workload. The application owns protocol selection, buffering and lifecycle; the BSP is unchanged. See the [laboratory contract](../../docs/acoustic-lab.md) and [site](../../site/README.md).
