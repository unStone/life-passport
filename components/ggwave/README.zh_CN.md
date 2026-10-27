**简体中文** · [English](README.md)

# GGWave集成

完整[GGWave仓库](https://github.com/ggerganov/ggwave)保留为 `upstream` 子模块，固定提交 `060aec73dd7123ccac200442f75bdc7369795ffe`（原生0.4.3），未修改上游源码。GGWave采用MIT，须保留其许可与内置Reed–Solomon许可。浏览器包单独固定为0.4.0，并与此原生接收器做互通测试。

构建前执行 `git submodule update --init --recursive`。本地CMake适配器将官方源码编译为ESP-IDF组件，关闭日志，并针对C3的DSP运算使用 `-O2`。应用负责协议选择、缓冲和生命周期，BSP保持不变。参见[实验室约定](../../docs/acoustic-lab.zh_CN.md)与[网页](../../site/README.zh_CN.md)。
