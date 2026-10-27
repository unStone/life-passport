import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'board.dart';

class SavedSeed {
  SavedSeed(this.title, this.board);
  final String title;
  final Board board;
}

class SeedLibrary {
  static const key = 'life.seeds.v1';
  Future<List<SavedSeed>> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getStringList(key) ?? [];
    return raw.map((entry) {
      final value = jsonDecode(entry);
      if (value is! Map ||
          value['title'] is! String ||
          value['rows'] is! List) {
        throw const FormatException('收藏数据损坏，未自动覆盖');
      }
      return SavedSeed(
        value['title'] as String,
        Board.fromRows(value['rows'] as List),
      );
    }).toList();
  }

  Future<void> save(List<SavedSeed> seeds) async {
    if (seeds.length > 20) throw StateError('最多保存20份种子，请先删除不需要的收藏');
    final preferences = await SharedPreferences.getInstance();
    final success = await preferences.setStringList(
      key,
      seeds
          .map(
            (seed) =>
                jsonEncode({'title': seed.title, 'rows': seed.board.toRows()}),
          )
          .toList(),
    );
    if (!success) throw StateError('收藏保存失败，当前棋盘仍保留');
  }
}
