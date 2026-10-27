import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:life_controller/main.dart';
import 'package:life_controller/grid_editor.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('LifeUI')
      ..addFont(rootBundle.load('assets/fonts/life_ui.ttf'));
    await font.load();
  });
  for (final size in [const Size(320, 760), const Size(1024, 768)]) {
    testWidgets('Editor layout fits $size with the real Chinese font', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const LifeApp());
      await tester.pumpAndSettle();
      expect(find.text('发送到设备'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets('Phone editor paints, undoes and previews on a compact screen', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const LifeApp());
    await tester.pumpAndSettle();
    expect(find.text('生命种子'), findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(ActionChip, '滑翔机'));
    await tester.tap(find.widgetWithText(ActionChip, '滑翔机'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, 1500));
    await tester.pumpAndSettle();
    expect(find.text('5 个生命'), findsOneWidget);
    await tester.ensureVisible(find.byType(GridEditor));
    final point =
        tester.getTopLeft(find.byType(GridEditor)) + const Offset(10, 10);
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, 1500));
    await tester.pumpAndSettle();
    expect(find.text('6 个生命'), findsOneWidget);
    await tester.ensureVisible(find.byTooltip('撤销'));
    await tester.tap(find.byTooltip('撤销'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, 1500));
    await tester.pumpAndSettle();
    expect(find.text('5 个生命'), findsOneWidget);
    await tester.ensureVisible(find.text('预览演化'));
    await tester.tap(find.text('预览演化'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('第 2 代'), findsOneWidget);
    await tester.tap(find.text('结束预览'));
    await tester.pumpAndSettle();
    expect(find.text('第 0 代'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
