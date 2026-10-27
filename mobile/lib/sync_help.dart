import 'package:flutter/material.dart';

Future<void> showSyncHelp(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (sheetContext) => SafeArea(
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '怎么同步到设备',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          for (final step in const [
            ('1', '开启设备和手机蓝牙', '设备开机后即可连接，不需要先在系统蓝牙设置配对。'),
            ('2', '在本App里连接', '点右上角“连接设备”，授予蓝牙权限，选择 LifePassport。'),
            ('3', '编辑后发送', '画图、选预设或语音生成后，点底部“发送到设备”。'),
            ('4', '在设备上确认', '看到“收到手机种子”后，按设备确定键应用，再按一次开始演化。长按确定可取消。'),
          ])
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(radius: 16, child: Text(step.$1)),
              title: Text(step.$2),
              subtitle: Text(step.$3),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.pop(sheetContext),
              child: const Text('知道了，返回编辑'),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(sheetContext);
              showLicensePage(
                context: context,
                applicationName: '生命种子',
                applicationVersion: '1.0.0',
              );
            },
            child: const Text('许可说明'),
          ),
        ],
      ),
    ),
  ),
);
