import 'package:flutter/material.dart';
import 'phone_ble.dart';

Future<void> showDevicePicker(
  BuildContext context,
  PhoneBle link,
  void Function(Object) onError,
) async {
  if (!link.supported) throw StateError('当前为网页预览，蓝牙请使用 Android 或 iOS 应用');
  await link.startScan();
  if (!context.mounted) return;
  try {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: 420,
          child: AnimatedBuilder(
            animation: link,
            builder: (context, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '连接 AI Passport',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Text(link.message),
                  if (link.scanning || link.connecting)
                    const LinearProgressIndicator(),
                  Expanded(
                    child: ListView(
                      children: link.devices
                          .map(
                            (device) => ListTile(
                              enabled: !link.connecting,
                              leading: const Icon(Icons.bluetooth),
                              title: Text(
                                device.name.isEmpty
                                    ? 'LifePassport'
                                    : device.name,
                              ),
                              subtitle: Text('信号 ${device.rssi} dBm'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () async {
                                try {
                                  await link.connect(device);
                                  if (sheetContext.mounted) {
                                    Navigator.pop(sheetContext);
                                  }
                                } catch (error) {
                                  onError(error);
                                }
                              },
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  Row(
                    children: [
                      TextButton(
                        onPressed: () async {
                          try {
                            await link.startScan();
                          } catch (error) {
                            onError(error);
                          }
                        },
                        child: const Text('重新扫描'),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        child: const Text('关闭'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  } finally {
    await link.stopScan();
    if (link.connecting) await link.disconnect();
  }
}
