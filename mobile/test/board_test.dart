import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:life_controller/board.dart';

void main() {
  test('Cross-language rows, packing and IEEE CRC fixtures', () {
    final fixtures =
        jsonDecode(File('../tests/life_wire_vectors.json').readAsStringSync())
            as List;
    for (final fixture in fixtures) {
      final board = Board.fromRows(fixture['rows'] as List);
      expect(board.checksum, fixture['crc']);
      final request =
          jsonDecode(utf8.decode(board.request(fixture['id'] as int))) as Map;
      expect(request['rows'], fixture['rows']);
      expect(request['crc'], fixture['crc']);
    }
  });
  test('Glider and pulsar keep their true periods', () {
    final original = Board.preset('脉冲星');
    var board = original;
    for (var i = 0; i < 3; i++) {
      board = board.step();
    }
    expect(board.toRows(), original.toRows());
    board = Board.preset('滑翔机');
    for (var i = 0; i < 4; i++) {
      board = board.step();
    }
    expect(board.population, 5);
  });
  test('Voice text commands are explicit and bounded', () {
    expect(boardFromCommand('生成R五连块', Random(1)).population, 5);
    expect(boardFromCommand('生成随机密度0%', Random(1)).population, 0);
    expect(boardFromCommand('随机百分之一百', Random(1)).population, columns * rows);
    expect(
      boardFromCommand('生成随机密度百分之二十', Random(1)).toRows(),
      Board.random(20, Random(1)).toRows(),
    );
    expect(boardFromCommand('来一个滑翔机', Random(1)).population, 5);
    expect(boardFromCommand('放三个滑翔机', Random(1)).population, 15);
    expect(
      boardFromCommand('随机密度二十', Random(1)).toRows(),
      Board.random(20, Random(1)).toRows(),
    );
    expect(() => boardFromCommand('随机生成小猫', Random(1)), throwsFormatException);
    expect(
      () => boardFromCommand('放100个脉冲星', Random(1)),
      throwsFormatException,
    );
    expect(
      () => boardFromCommand('放1.5个滑翔机', Random(1)),
      throwsFormatException,
    );
    expect(() => boardFromCommand('随机150%', Random(1)), throwsFormatException);
    expect(() => boardFromCommand('未知内容', Random(1)), throwsFormatException);
    expect(
      () => Board.fromRows(List.filled(rows, 1 << columns)),
      throwsFormatException,
    );
  });
}
