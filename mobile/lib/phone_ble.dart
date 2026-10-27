import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';
import 'package:permission_handler/permission_handler.dart';
import 'board.dart';

final serviceUuid = Uuid.parse('e13b0001-c18b-4a9f-8949-7e9aa6579220');
final rxUuid = Uuid.parse('e13b0002-c18b-4a9f-8949-7e9aa6579220');
final txUuid = Uuid.parse('e13b0003-c18b-4a9f-8949-7e9aa6579220');
final statusUuid = Uuid.parse('e13b0004-c18b-4a9f-8949-7e9aa6579220');

class PhoneBle extends ChangeNotifier {
  FlutterReactiveBle? _bleInstance;
  FlutterReactiveBle get _ble => _bleInstance ??= FlutterReactiveBle();
  bool _disposed = false;
  final devices = <DiscoveredDevice>[];
  StreamSubscription<DiscoveredDevice>? _scan;
  StreamSubscription<ConnectionStateUpdate>? _connection;
  StreamSubscription<List<int>>? _notifications;
  Timer? _scanTimer, _poll;
  Completer<void>? _ready;
  Completer<Map<String, dynamic>>? _pending;
  QualifiedCharacteristic? _rx, _tx, _status;
  int _id = Random().nextInt(0x7ffffffe) + 1;
  int? _attemptId, _checksum;
  String? _signature;
  bool _reading = false;
  int _epoch = 0;
  String message = '未连接设备';
  bool connected = false,
      connecting = false,
      scanning = false,
      writing = false,
      awaitingConfirmation = false;
  double progress = 0;
  bool get supported =>
      !kIsWeb &&
      [
        TargetPlatform.android,
        TargetPlatform.iOS,
      ].contains(defaultTargetPlatform);

  Future<void> startScan() async {
    if (!supported) throw StateError('蓝牙连接请使用 Android 或 iOS 应用');
    if (connecting) throw StateError('正在连接设备，请稍候');
    await stopScan();
    if (defaultTargetPlatform == TargetPlatform.android) {
      final sdk = await const MethodChannel(
        'life/platform',
      ).invokeMethod<int>('androidSdk');
      if (sdk == null) throw StateError('无法读取 Android 权限版本');
      final permissions = sdk >= 31
          ? [Permission.bluetoothScan, Permission.bluetoothConnect]
          : [Permission.locationWhenInUse];
      final result = await permissions.request();
      if (result.values.any((status) => !status.isGranted)) {
        throw StateError('请在系统设置中允许蓝牙扫描与连接权限');
      }
    }
    final status = _ble.status == BleStatus.unknown
        ? await _ble.statusStream
              .firstWhere((s) => s != BleStatus.unknown)
              .timeout(const Duration(seconds: 8))
        : _ble.status;
    if (status != BleStatus.ready) throw StateError('手机蓝牙尚未就绪：$status');
    devices.clear();
    scanning = true;
    message = '正在寻找 LifePassport';
    notifyListeners();
    _scan = _ble
        .scanForDevices(
          withServices: [serviceUuid],
          scanMode: ScanMode.lowLatency,
        )
        .listen(
          (device) {
            final index = devices.indexWhere((d) => d.id == device.id);
            if (index < 0) {
              devices.add(device);
            } else {
              devices[index] = device;
            }
            notifyListeners();
          },
          onError: (Object error) {
            message = '扫描失败：$error';
            unawaited(stopScan());
          },
        );
    _scanTimer = Timer(const Duration(seconds: 10), () {
      if (devices.isEmpty) message = '未发现设备，请检查设备电源和距离';
      unawaited(stopScan());
    });
  }

  Future<void> stopScan() async {
    _scanTimer?.cancel();
    await _scan?.cancel();
    _scan = null;
    scanning = false;
    notifyListeners();
  }

  Future<void> connect(DiscoveredDevice device) async {
    if (connecting) throw StateError('正在连接设备，请稍候');
    final epoch = ++_epoch;
    connecting = true;
    notifyListeners();
    try {
      await _clearLink();
      await stopScan();
      if (epoch != _epoch) throw StateError('连接已取消');
      message = '正在连接 ${device.name}';
      final ready = Completer<void>();
      _ready = ready;
      _connection = _ble
          .connectToAdvertisingDevice(
            id: device.id,
            withServices: [serviceUuid],
            prescanDuration: const Duration(seconds: 3),
            servicesWithCharacteristicsToDiscover: {
              serviceUuid: [rxUuid, txUuid, statusUuid],
            },
            connectionTimeout: const Duration(seconds: 10),
          )
          .listen(
            (event) {
              if (epoch != _epoch) return;
              if (event.connectionState == DeviceConnectionState.connected) {
                _rx = QualifiedCharacteristic(
                  serviceId: serviceUuid,
                  characteristicId: rxUuid,
                  deviceId: device.id,
                );
                _tx = QualifiedCharacteristic(
                  serviceId: serviceUuid,
                  characteristicId: txUuid,
                  deviceId: device.id,
                );
                _status = QualifiedCharacteristic(
                  serviceId: serviceUuid,
                  characteristicId: statusUuid,
                  deviceId: device.id,
                );
                unawaited(_openGatt(epoch, device.id));
              } else if (event.connectionState ==
                  DeviceConnectionState.disconnected) {
                connected = false;
                awaitingConfirmation = false;
                _failed(StateError('设备已断开，请重新连接后重试'));
              }
              notifyListeners();
            },
            onError: (Object error) {
              if (epoch == _epoch) _failed(error);
            },
          );
      notifyListeners();
      await ready.future.timeout(const Duration(seconds: 16));
    } catch (_) {
      if (epoch == _epoch) await _clearLink();
      rethrow;
    } finally {
      if (epoch == _epoch) connecting = false;
      notifyListeners();
    }
  }

  Future<void> _openGatt(int epoch, String deviceId) async {
    try {
      await _ble
          .requestMtu(deviceId: deviceId, mtu: 185)
          .timeout(const Duration(seconds: 4));
      if (epoch != _epoch) return;
      connected = true;
      _notifications = _ble
          .subscribeToCharacteristic(_tx!)
          .listen(
            (_) {
              if (epoch == _epoch) unawaited(_readReply());
            },
            onError: (Object error) {
              if (epoch == _epoch) _failed(error);
            },
          );
      _poll = Timer.periodic(const Duration(milliseconds: 400), (_) {
        if (epoch == _epoch && (_pending != null || awaitingConfirmation)) {
          unawaited(_readReply());
        }
      });
      await _readReply();
    } catch (error) {
      if (epoch == _epoch) _failed(error);
    }
  }

  void _failed(Object error) {
    message = error.toString();
    if (_ready != null && !_ready!.isCompleted) _ready!.completeError(error);
    if (_pending != null && !_pending!.isCompleted) {
      _pending!.completeError(error);
    }
    notifyListeners();
  }

  Future<void> _readReply() async {
    if (!connected || _status == null || _reading) return;
    final epoch = _epoch;
    _reading = true;
    try {
      final bytes = await _ble
          .readCharacteristic(_status!)
          .timeout(const Duration(seconds: 4));
      if (epoch != _epoch) return;
      final reply = parseReply(bytes);
      if (_ready != null && !_ready!.isCompleted) {
        _ready!.complete();
        message = '已连接 LifePassport';
      }
      if (reply['id'] == _attemptId || (reply['id'] == 0 && _pending != null)) {
        final state = transactionState(reply, _attemptId!, _checksum!);
        awaitingConfirmation = state == 'preview';
        if (state == 'preview') message = '设备已收到，请按设备确定键应用；长按可取消';
        if (state == 'applied') {
          message = '设备已应用种子，按设备确定键开始演化';
          _signature = null;
        }
        if (state == 'cancelled') {
          message = '设备已取消，原棋盘已恢复';
          _signature = null;
        }
        if (['preview', 'applied', 'cancelled'].contains(state) &&
            _pending != null &&
            !_pending!.isCompleted) {
          _pending!.complete(reply);
        }
      }
    } catch (error) {
      if (epoch == _epoch) _failed(error);
    } finally {
      if (epoch == _epoch) {
        _reading = false;
        notifyListeners();
      }
    }
  }

  Future<void> send(
    Board board, {
    required int interval,
    required bool wrap,
  }) async {
    if (!connected || _rx == null) throw StateError('请先连接设备');
    final epoch = _epoch;
    if (writing || awaitingConfirmation) throw StateError('请先在设备确认上一份种子');
    final signature = jsonEncode([board.toRows(), interval, wrap]);
    if (_signature != signature) {
      _attemptId = _id;
      _id = _id == 0xffffffff ? 1 : _id + 1;
      _signature = signature;
    }
    _checksum = board.checksum;
    final bytes = board.request(_attemptId!, interval: interval, wrap: wrap);
    writing = true;
    progress = 0;
    notifyListeners();
    try {
      for (var offset = 0; offset < bytes.length; offset += 20) {
        if (!connected || epoch != _epoch) throw StateError('发送中断，设备已断开');
        final end = min(offset + 20, bytes.length);
        await _ble
            .writeCharacteristicWithResponse(
              _rx!,
              value: bytes.sublist(offset, end),
            )
            .timeout(const Duration(seconds: 4));
        if (epoch != _epoch || !connected) throw StateError('发送中断，设备已断开');
        progress = end / bytes.length;
        notifyListeners();
      }
      _pending = Completer<Map<String, dynamic>>();
      final confirmation = _pending!.future.timeout(
        const Duration(seconds: 10),
      );
      unawaited(_readReply());
      await confirmation;
    } catch (_) {
      if (epoch == _epoch) await disconnect();
      rethrow;
    } finally {
      writing = false;
      _pending = null;
      notifyListeners();
    }
  }

  Future<void> disconnect() async {
    ++_epoch;
    await _clearLink();
    connecting = false;
    message = '未连接设备';
    notifyListeners();
  }

  Future<void> _clearLink() async {
    if (_ready != null && !_ready!.isCompleted) {
      _ready!.completeError(StateError('连接已关闭'));
    }
    if (_pending != null && !_pending!.isCompleted) {
      _pending!.completeError(StateError('连接已关闭'));
    }
    _poll?.cancel();
    await _notifications?.cancel();
    await _connection?.cancel();
    _notifications = null;
    _connection = null;
    _rx = _tx = _status = null;
    _ready = null;
    _reading = false;
    connected = awaitingConfirmation = false;
    message = '未连接设备';
    notifyListeners();
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    ++_epoch;
    _disposed = true;
    _scanTimer?.cancel();
    _poll?.cancel();
    unawaited(_scan?.cancel());
    unawaited(_notifications?.cancel());
    unawaited(_connection?.cancel());
    super.dispose();
  }
}

String? transactionState(
  Map<String, dynamic> reply,
  int expectedId,
  int expectedCrc,
) {
  if (reply['id'] == 0 && reply['ok'] == true) return null;
  if (reply['id'] != expectedId && reply['id'] != 0) return null;
  if (reply['ok'] != true) {
    const errors = {
      'busy': '请先在设备确认上一份种子',
      'checksum': '校验失败，原棋盘未修改',
      'invalid': '种子数据无效',
      'oversize': '种子数据过长',
      'timeout': '接收超时，请重新发送',
      'id_conflict': '消息编号冲突，请重新连接后再发',
    };
    throw StateError(errors[reply['error']] ?? '设备拒绝：${reply['error']}');
  }
  if (reply['crc'] != expectedCrc) throw const FormatException('设备确认的校验值不匹配');
  return reply['state'] as String;
}

Map<String, dynamic> parseReply(List<int> bytes) {
  if (bytes.isEmpty || bytes.length > 1024) {
    throw const FormatException('设备回复长度无效');
  }
  final value = jsonDecode(utf8.decode(bytes));
  if (value is! Map<String, dynamic> ||
      value['v'] != 1 ||
      value['id'] is! int ||
      value['id'] < 0 ||
      value['id'] > 0xffffffff ||
      value['ok'] is! bool) {
    throw const FormatException('设备回复协议无效');
  }
  if (value['ok'] == false && value['error'] is! String) {
    throw const FormatException('设备错误回复无效');
  }
  if (value['ok'] == true &&
      ![
        'ready',
        'processing',
        'preview',
        'applied',
        'cancelled',
      ].contains(value['state'])) {
    throw const FormatException('设备回复状态无效');
  }
  return value;
}
