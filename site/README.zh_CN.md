**简体中文** · [English](README.md)

# 生命声场网页

编辑器还提供可搜索的519种图案图鉴、原生双指缩放／平移和图片生成的自然振荡器。上传图片后计算2／3／4代周期近似图案，检查真实B3/S23演化，再主动采用并发送；图片仅在本机处理。求解器仅在计算时加载，停止计算仍保留已验证结果，见[算法、限制和验收用例](../docs/world-editor.zh_CN.md#图片生成自然循环图案)。

[国内网页](https://ssstone0903-life-passport.ms.show/) · [GitHub备用网页](https://unstone.github.io/life-passport/) · [世界编辑与收音](../docs/world-editor.zh_CN.md) · [实验用例](../docs/acoustic-lab.zh_CN.md)。中文静态页面支持鼠标／触摸绘制、撤销／重做、演化预览、JSON导入／导出、世界码与完整棋盘声音发送，以及主动麦克风／WAV接收。收到棋盘后先预览再应用；音频仅在本地处理，停止／后台会释放收音，单向发送不提供回执。人工测试记录保存在localStorage，可导出JSON。

[部署及验证记录](../docs/life-passport-release.zh_CN.md)标明经过测试的精确版本。国内免费实例可能在闲置时休眠，重新访问时激活；麦克风接收请使用直达网址，避免依赖内嵌页面的权限。

通过fnm使用Node **22.22.3**。完整验证流程会安装已声明依赖，开发命令如下：

```sh
fnm use 22.22.3
npm ci --prefix site
npm run dev --prefix site
python3 tools/test_life_audio.py
npm run build --prefix site
```

`tools/test_life_audio.py`构建完整原生GGWave依赖，验证生产C协议解析、全FF二进制内容、错误CRC拒绝、共用棋盘向量，以及npm真实WASM在24／44.1／48kHz输出下生成的声音。波形先重采样至设备固定24kHz ADC采样率再解码。软件测试不能证明真实手机和房间中的可靠性。

将 `dist/` 加上 `.nojekyll` 发布到 `gh-pages` 根目录；所有资源URL为相对路径。Vite明确选用WaveFile公开的CommonJS入口，使Node与浏览器构建使用相同API。GGWave 0.4.0、crc-32 1.2.2、WaveFile 11.0.0、logic-solver 2.0.1和Vite 8.3.5均由 `package-lock.json` 锁定。构建将项目、依赖和字体许可汇总到 `LICENSES.txt`；[字库生成](../assets/README.zh_CN.md)检查所附中文字体子集。
