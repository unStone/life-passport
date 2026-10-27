import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:life_controller/phone_ble.dart';

void main() {
  test('Only matching id and CRC can acknowledge a seed', () {
    final valid = parseReply(
      utf8.encode('{"v":1,"id":7,"ok":true,"state":"preview","crc":123}'),
    );
    expect(transactionState(valid, 7, 123), 'preview');
    expect(transactionState(valid, 8, 123), isNull);
    expect(() => transactionState(valid, 7, 124), throwsFormatException);
    final zero = {...valid, 'id': 0};
    expect(transactionState(zero, 7, 123), isNull);
    expect(
      () =>
          parseReply(utf8.encode('{"v":1,"id":-1,"ok":true,"state":"ready"}')),
      throwsFormatException,
    );
    expect(
      () =>
          parseReply(utf8.encode('{"v":1,"id":7,"ok":true,"state":"unknown"}')),
      throwsFormatException,
    );
    expect(
      () => transactionState(
        {'v': 1, 'id': 7, 'ok': false, 'error': 'busy'},
        7,
        123,
      ),
      throwsStateError,
    );
  });
}
