import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'board.dart';
import 'grid_editor.dart';
import 'phone_ble.dart';
import 'seed_library.dart';
import 'device_picker.dart';
import 'sync_help.dart';

class SeedHome extends StatefulWidget {
  const SeedHome({super.key});
  @override
  State<SeedHome> createState() => _SeedHomeState();
}

class _SeedHomeState extends State<SeedHome> {
  Board _board = Board.preset('脉冲星');
  final _history = <Board>[];
  final _link = PhoneBle();
  final _speech = SpeechToText();
  final _command = TextEditingController();
  final _library = SeedLibrary();
  List<SavedSeed> _saved = [];
  String? _libraryError;
  bool _speechReady = false, _listening = false, _wrap = true;
  int _mode = 0, _density = 28, _interval = 200, _generation = 0;
  Timer? _preview;
  Board? _original;

  @override
  void initState() {
    super.initState();
    _link.addListener(_changed);
    unawaited(_loadLibrary());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _error(Object error) {
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _run(Future<void> Function() operation) async {
    try {
      await operation();
    } catch (error) {
      _error(error);
    }
  }

  Future<void> _loadLibrary() async {
    try {
      final seeds = await _library.load();
      if (mounted) {
        setState(() {
          _saved = seeds;
          _libraryError = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _libraryError = error.toString());
    }
  }

  void _remember() {
    _history.add(Board.copy(_board));
    if (_history.length > 30) _history.removeAt(0);
  }

  void _stopPreview() {
    _preview?.cancel();
    _preview = null;
    if (_original != null) _board = _original!;
    _original = null;
    _generation = 0;
  }

  void _replace(Board board) {
    setState(() {
      _stopPreview();
      _remember();
      _board = board;
    });
  }

  void _togglePreview() {
    setState(() {
      if (_preview != null) {
        _stopPreview();
        return;
      }
      _original = Board.copy(_board);
      _preview = Timer.periodic(Duration(milliseconds: _interval), (_) {
        if (!mounted) return;
        setState(() {
          _board = _board.step(wrap: _wrap);
          _generation++;
        });
      });
    });
  }

  void _generate() {
    try {
      _replace(boardFromCommand(_command.text, Random(), density: _density));
    } catch (error) {
      _error(error);
    }
  }

  Future<void> _voice() async {
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    if (!_speechReady) {
      _speechReady = await _speech.initialize(
        onStatus: (status) {
          if (mounted && status != 'listening') {
            setState(() => _listening = false);
          }
        },
        onError: (error) {
          _error('语音识别失败：${error.errorMsg}，也可以输入文字指令');
          if (mounted) setState(() => _listening = false);
        },
      );
    }
    if (!_speechReady) throw StateError('系统语音识别不可用或未获授权，请使用文字指令');
    final locales = await _speech.locales();
    final chinese = locales
        .where((locale) => locale.localeId.startsWith('zh'))
        .toList();
    if (!mounted) return;
    setState(() => _listening = true);
    try {
      await _speech.listen(
        listenOptions: SpeechListenOptions(
          localeId: chinese.isEmpty ? null : chinese.first.localeId,
          listenFor: const Duration(seconds: 20),
          pauseFor: const Duration(seconds: 3),
        ),
        onResult: (result) {
          if (!mounted) return;
          _command.text = result.recognizedWords;
          if (result.finalResult && result.recognizedWords.isNotEmpty) {
            setState(() => _listening = false);
            _generate();
          }
        },
      );
    } catch (_) {
      if (mounted) setState(() => _listening = false);
      rethrow;
    }
  }

  Future<void> _save() async {
    if (_libraryError != null) throw StateError(_libraryError!);
    setState(_stopPreview);
    final date = DateTime.now();
    final seed = SavedSeed(
      '种子 ${date.month}/${date.day} ${date.hour}:${date.minute.toString().padLeft(2, '0')}',
      Board.copy(_board),
    );
    final next = [..._saved, seed];
    await _library.save(next);
    if (mounted) {
      setState(() => _saved = next);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已收藏到手机')));
    }
  }

  Future<void> _devices() => showDevicePicker(context, _link, _error);

  Future<void> _send() async {
    if (!_link.connected) {
      await _devices();
      return;
    }
    setState(_stopPreview);
    await _link.send(Board.copy(_board), interval: _interval, wrap: _wrap);
  }

  @override
  void dispose() {
    _preview?.cancel();
    if (_speechReady) unawaited(_speech.cancel());
    _command.dispose();
    _link.removeListener(_changed);
    _link.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('生命种子', style: TextStyle(fontWeight: FontWeight.w800)),
      actions: [
        IconButton(
          tooltip: '怎么同步',
          icon: const Icon(Icons.help_outline),
          onPressed: () => showSyncHelp(context),
        ),
        TextButton.icon(
          onPressed: () => _run(_link.connected ? _link.disconnect : _devices),
          icon: Icon(
            _link.connected ? Icons.bluetooth_connected : Icons.bluetooth,
          ),
          label: Text(_link.connected ? '断开连接' : '连接设备'),
        ),
      ],
    ),
    body: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xffe6ebda),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(
                    _link.connected
                        ? Icons.check_circle_outline
                        : Icons.info_outline,
                    size: 19,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _link.message,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Text(
                  '你的初始世界',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const Spacer(),
                Text(
                  '${_board.population} 个生命',
                  style: const TextStyle(color: Color(0xff49675a)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            GridEditor(
              board: _board,
              mode: _mode,
              editable: _preview == null,
              onStart: _remember,
              onCell: (x, y, alive) => setState(() => _board.set(x, y, alive)),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(
                        value: 0,
                        icon: Icon(Icons.edit_outlined),
                        label: Text('绘制'),
                      ),
                      ButtonSegment(
                        value: 1,
                        icon: Icon(Icons.auto_fix_normal),
                        label: Text('擦除'),
                      ),
                      ButtonSegment(
                        value: 2,
                        icon: Icon(Icons.zoom_in),
                        label: Text('缩放'),
                      ),
                    ],
                    selected: {_mode},
                    onSelectionChanged: (value) =>
                        setState(() => _mode = value.single),
                  ),
                ),
                IconButton(
                  tooltip: '撤销',
                  onPressed: _history.isEmpty || _preview != null
                      ? null
                      : () => setState(() => _board = _history.removeLast()),
                  icon: const Icon(Icons.undo),
                ),
              ],
            ),
            const Text(
              '缩放模式可双指放大与拖动；切回绘制后精细编辑。',
              style: TextStyle(fontSize: 12, color: Color(0xff61766a)),
            ),
            Row(
              children: [
                TextButton.icon(
                  onPressed: _togglePreview,
                  icon: Icon(_preview == null ? Icons.play_arrow : Icons.stop),
                  label: Text(_preview == null ? '预览演化' : '结束预览'),
                ),
                Text('第 $_generation 代'),
                const Spacer(),
                IconButton(
                  tooltip: '清空',
                  onPressed: () => _replace(Board()),
                  icon: const Icon(Icons.delete_outline),
                ),
                IconButton(
                  tooltip: '收藏',
                  onPressed: () => _run(_save),
                  icon: const Icon(Icons.bookmark_add_outlined),
                ),
              ],
            ),
            const Divider(height: 22),
            const Text(
              '选一个起点',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: ['R五连块', '滑翔机', '脉冲星', '闪烁器', '轻型飞船', '心形', '蝴蝶']
                  .map(
                    (name) => ActionChip(
                      label: Text(name),
                      onPressed: () => _replace(Board.preset(name)),
                    ),
                  )
                  .toList(),
            ),
            Row(
              children: [
                Text('随机密度 $_density%'),
                Expanded(
                  child: Slider(
                    value: _density.toDouble(),
                    min: 0,
                    max: 100,
                    divisions: 100,
                    onChanged: (value) =>
                        setState(() => _density = value.round()),
                  ),
                ),
                FilledButton.tonal(
                  onPressed: () => _replace(Board.random(_density, Random())),
                  child: const Text('生成'),
                ),
              ],
            ),
            TextField(
              controller: _command,
              decoration: const InputDecoration(
                labelText: '说一句，或输入种子指令',
                hintText: '例如：随机密度20%，或生成滑翔机',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _generate(),
            ),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: () => _run(_voice),
                  icon: Icon(_listening ? Icons.stop : Icons.mic_none),
                  label: Text(_listening ? '结束录音' : '语音生成'),
                ),
                const SizedBox(width: 12),
                TextButton(onPressed: _generate, child: const Text('按文字生成')),
              ],
            ),
            const Text(
              '语音由手机系统识别；图案只是初始状态，演化后可能改变或消失。',
              style: TextStyle(fontSize: 12, color: Color(0xff61766a)),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _interval,
                    decoration: const InputDecoration(
                      labelText: '演化间隔',
                      border: OutlineInputBorder(),
                    ),
                    items: [1000, 500, 200, 125]
                        .map(
                          (ms) => DropdownMenuItem(
                            value: ms,
                            child: Text('$ms ms'),
                          ),
                        )
                        .toList(),
                    onChanged: (value) => setState(() {
                      _stopPreview();
                      _interval = value!;
                    }),
                  ),
                ),
                const SizedBox(width: 18),
                const Text('环绕边界'),
                Switch(
                  value: _wrap,
                  onChanged: (value) => setState(() => _wrap = value),
                ),
              ],
            ),
            if (_libraryError != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('收藏读取失败：$_libraryError'),
              ),
            if (_saved.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text(
                '手机收藏',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              ..._saved.asMap().entries.map(
                (entry) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(entry.value.title),
                  subtitle: Text('${entry.value.board.population} 个生命'),
                  onTap: () => _replace(Board.copy(entry.value.board)),
                  trailing: IconButton(
                    tooltip: '删除收藏',
                    icon: const Icon(Icons.close),
                    onPressed: () => _run(() async {
                      final next = [..._saved]..removeAt(entry.key);
                      await _library.save(next);
                      if (mounted) setState(() => _saved = next);
                    }),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_link.writing) LinearProgressIndicator(value: _link.progress),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton.icon(
                onPressed:
                    _link.writing ||
                        _link.connecting ||
                        _link.awaitingConfirmation
                    ? null
                    : () => _run(_send),
                icon: const Icon(Icons.send_outlined),
                label: Text(
                  _link.writing
                      ? '发送中 ${(_link.progress * 100).round()}%'
                      : _link.awaitingConfirmation
                      ? '等待设备实体按键确认'
                      : '发送到设备',
                  style: const TextStyle(fontSize: 17),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
