import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:archive/archive.dart';

const columns = 36;
const rows = 32;
const maximumRow = 68719476735;

class Board {
  Board() : cells = Uint8List(columns * rows);
  Board.copy(Board source) : cells = Uint8List.fromList(source.cells);
  final Uint8List cells;

  int get population => cells.fold(0, (sum, value) => sum + value);
  void set(int x, int y, bool alive) {
    if (x < 0 || x >= columns || y < 0 || y >= rows) {
      throw RangeError('Cell ($x,$y) is outside $columns×$rows');
    }
    cells[y * columns + x] = alive ? 1 : 0;
  }

  static Board fromRows(List<dynamic> values) {
    if (values.length != rows) throw const FormatException('种子必须包含32行');
    final board = Board();
    for (var y = 0; y < rows; y++) {
      final value = values[y];
      if (value is! int || value < 0 || value > maximumRow) {
        throw const FormatException('种子行数据超出36列范围');
      }
      for (var x = 0; x < columns; x++) {
        board.set(x, y, (value ~/ pow(2, x).toInt()) % 2 != 0);
      }
    }
    return board;
  }

  List<int> toRows() => List.generate(rows, (y) {
    var value = 0;
    for (var x = 0; x < columns; x++) {
      if (cells[y * columns + x] != 0) value += pow(2, x).toInt();
    }
    return value;
  });

  Uint8List get packed {
    final bytes = Uint8List(columns * rows ~/ 8);
    for (var bit = 0; bit < cells.length; bit++) {
      if (cells[bit] != 0) bytes[bit ~/ 8] |= 1 << (bit % 8);
    }
    return bytes;
  }

  int get checksum => getCrc32(packed);
  List<int> request(int id, {int interval = 200, bool wrap = true}) {
    if (id < 1 ||
        id > 0xffffffff ||
        ![125, 200, 500, 1000].contains(interval)) {
      throw ArgumentError('Invalid request id or interval');
    }
    return utf8.encode(
      '${jsonEncode({'v': 1, 'id': id, 'op': 'seed', 'w': columns, 'h': rows, 'rows': toRows(), 'crc': checksum, 'interval_ms': interval, 'wrap': wrap})}\n',
    );
  }

  Board step({bool wrap = true}) {
    final next = Board();
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < columns; x++) {
        var neighbours = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            var nx = x + dx;
            var ny = y + dy;
            if (wrap) {
              nx = (nx + columns) % columns;
              ny = (ny + rows) % rows;
            }
            if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) {
              neighbours += cells[ny * columns + nx];
            }
          }
        }
        next.set(
          x,
          y,
          neighbours == 3 || (neighbours == 2 && cells[y * columns + x] != 0),
        );
      }
    }
    return next;
  }

  static Board random(int density, Random random) {
    if (density < 0 || density > 100) throw RangeError.range(density, 0, 100);
    final board = Board();
    for (var i = 0; i < board.cells.length; i++) {
      board.cells[i] = random.nextInt(100) < density ? 1 : 0;
    }
    return board;
  }

  static Board preset(String name, {int count = 1}) {
    final patterns = <String, List<String>>{
      'R五连块': ['.OO', 'OO.', '.O.'],
      '滑翔机': ['.O.', '..O', 'OOO'],
      '闪烁器': ['OOO'],
      '脉冲星': [
        '..OOO...OOO..',
        '.............',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '..OOO...OOO..',
        '.............',
        '..OOO...OOO..',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '.............',
        '..OOO...OOO..',
      ],
      '轻型飞船': ['.O..O', 'O....', 'O...O', 'OOOO.'],
      '心形': ['.OO.OO.', 'OOOOOOO', 'OOOOOOO', '.OOOOO.', '..OOO..', '...O...'],
      '蝴蝶': [
        'OO.....OO',
        '.OO...OO.',
        '..OO.OO..',
        '...OOO...',
        '..OO.OO..',
        '.OO...OO.',
        'OO.....OO',
      ],
      '空白': ['.'],
    };
    final pattern = patterns[name];
    if (pattern == null) throw ArgumentError.value(name, 'name', '未知预设');
    final board = Board();
    final pitchX = pattern.first.length + 2;
    final pitchY = pattern.length + 2;
    final capacity = ((columns + 2) ~/ pitchX) * ((rows + 2) ~/ pitchY);
    if (count < 1 || count > capacity) {
      throw FormatException('该图案最多可放$capacity个，请减少数量');
    }
    final across = min(count, (columns + 2) ~/ pitchX);
    final down = (count + across - 1) ~/ across;
    final ox = (columns - ((across - 1) * pitchX + pattern.first.length)) ~/ 2;
    final oy = (rows - ((down - 1) * pitchY + pattern.length)) ~/ 2;
    for (var n = 0; n < count; n++) {
      for (var y = 0; y < pattern.length; y++) {
        for (var x = 0; x < pattern[y].length; x++) {
          board.set(
            ox + (n % across) * pitchX + x,
            oy + (n ~/ across) * pitchY + y,
            pattern[y][x] == 'O',
          );
        }
      }
    }
    return board;
  }
}

Board boardFromCommand(String text, Random random, {int density = 28}) {
  final names = [
    'R五连块',
    '滑翔机',
    '脉冲星',
    '闪烁器',
    '轻型飞船',
    '心形',
    '蝴蝶',
    '空白',
  ].where(text.contains).toList();
  if (names.length > 1) throw const FormatException('一次请选择一种图案');
  final countMatch = RegExp(
    r'(-?\d+(?:\.\d+)?|负?[零一二两三四五六七八九十百]+)[个只]',
  ).firstMatch(text);
  if (names.isNotEmpty) {
    if (text.contains('密度') || text.contains('百分之') || text.contains('%')) {
      throw const FormatException('预设图案和随机密度请分别生成');
    }
    return Board.preset(
      names.single,
      count: countMatch == null ? 1 : _wholeNumber(countMatch.group(1)!),
    );
  }
  if (text.contains('随机') || text.contains('随便')) {
    final digits = RegExp(r'(-?\d+(?:\.\d+)?)').firstMatch(text);
    final chinese = RegExp(
      r'(?:百分之|密度|随机)(负?[零一二两三四五六七八九十百]+)(?!分)',
    ).firstMatch(text);
    var remainder = text;
    for (final token in [
      '帮我',
      '给我',
      '请',
      '生成',
      '创建',
      '随机',
      '随便',
      '密度',
      '百分之',
      '一个',
      '世界',
      '种子',
      '棋盘',
      '的',
      '来',
      '个',
    ]) {
      remainder = remainder.replaceAll(token, '');
    }
    remainder = remainder.replaceAll(
      RegExp(r'-?\d+(?:\.\d+)?|负?[零一二两三四五六七八九十百]+|[\s%％，。,、!?！？]'),
      '',
    );
    if (remainder.isNotEmpty) {
      throw const FormatException('暂不支持该描述，请使用预设名或随机密度指令');
    }
    var value = density;
    if (countMatch != null &&
        !text.contains('密度') &&
        !text.contains('%') &&
        !text.contains('百分之')) {
      if (_wholeNumber(countMatch.group(1)!) != 1) {
        throw const FormatException('随机世界一次生成一份，请使用密度指令');
      }
    } else if (digits != null) {
      value = int.tryParse(digits.group(1)!) ?? -1;
    } else if (chinese != null) {
      value = _wholeNumber(chinese.group(1)!);
    }
    if (value < 0 || value > 100) throw const FormatException('随机密度应在0到100之间');
    return Board.random(value, random);
  }
  if (text.contains('清空')) return Board();
  throw const FormatException('支持R五连块、滑翔机、脉冲星、闪烁器、轻型飞船、心形、蝴蝶或随机密度指令');
}

int _wholeNumber(String text) {
  final integer = int.tryParse(text);
  if (integer != null) return integer;
  if (text.startsWith('负')) return -_wholeNumber(text.substring(1));
  const numbers = {
    '零': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  };
  if (text == '一百') return 100;
  if (text.contains('十')) {
    final parts = text.split('十');
    if (parts.length == 2 &&
        (parts.first.isEmpty || numbers.containsKey(parts.first)) &&
        (parts.last.isEmpty || numbers.containsKey(parts.last))) {
      return (parts.first.isEmpty ? 1 : numbers[parts.first]!) * 10 +
          (parts.last.isEmpty ? 0 : numbers[parts.last]!);
    }
  } else if (numbers.containsKey(text)) {
    return numbers[text]!;
  }
  throw const FormatException('无法理解数量，请使用0到100的整数');
}
