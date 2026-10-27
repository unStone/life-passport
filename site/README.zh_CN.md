**简体中文** · [English](README.md)

# 生命声场网页

[公开网页](https://unstone.github.io/life-passport/) · [协议与手动用例](../docs/acoustic-lab.zh_CN.md)。中文静态页面提供可复现种子预览、测试音、固定诊断包和WAV下载；人工测试记录保存在当前浏览器的localStorage，可导出JSON。网页不录音，不需要账号或蓝牙连接，也不提供设备接收回执。

通过fnm使用Node **22.22.3**。完整验证流程会安装已声明依赖，开发命令如下：

```sh
fnm use 22.22.3
npm ci --prefix site
npm run dev --prefix site
python3 tools/test_life_audio.py
npm run build --prefix site
```

`tools/test_life_audio.py`构建完整原生GGWave依赖，验证生产C协议解析、全FF二进制内容、错误CRC拒绝、共用棋盘向量，以及npm真实WASM在24／44.1／48kHz输出下生成的声音。波形先重采样至设备固定24kHz ADC采样率再解码。软件测试不能证明真实手机和房间中的可靠性。

将 `dist/` 加上 `.nojekyll` 发布到 `gh-pages` 根目录；所有资源URL为相对路径。Vite明确选用WaveFile公开的CommonJS入口，使Node与浏览器构建使用相同API。GGWave 0.4.0、crc-32 1.2.2、WaveFile 11.0.0和Vite 8.3.5均由 `package-lock.json` 锁定。构建将项目、依赖和字体许可汇总到 `LICENSES.txt`；[字库生成](../assets/README.zh_CN.md)检查所附中文字体子集。
