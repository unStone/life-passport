import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:life_controller/main.dart';
import 'package:life_controller/grid_editor.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final entry in {
      'LifeUI': 'assets/fonts/life_ui.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    }.entries) {
      final loader = FontLoader(entry.key)
        ..addFont(rootBundle.load(entry.value));
      await loader.load();
    }
  });
  testWidgets('Capture the real Flutter editor, command generation and zoom', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const key = ValueKey('capture');
    await tester.pumpWidget(const RepaintBoundary(key: key, child: LifeApp()));
    await tester.pumpAndSettle();
    Future<void> capture(String name) async {
      await tester.pump();
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(key),
      );
      await tester.runAsync(() async {
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        final directory = Directory('../work/mobile-shots')
          ..createSync(recursive: true);
        await File(
          '${directory.path}/$name.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('editor');
    for (var i = 0; i < 8 && find.byType(TextField).evaluate().isEmpty; i++) {
      await tester.dragFrom(const Offset(8, 600), const Offset(0, -320));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(find.byType(TextField));
    await tester.enterText(find.byType(TextField), '放三个滑翔机');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    await capture('command');
    await tester.dragFrom(const Offset(8, 200), const Offset(0, 1800));
    await tester.pumpAndSettle();
    expect(find.text('15 个生命'), findsOneWidget);
    await capture('generated');
    await tester.tap(find.text('缩放'));
    await tester.pumpAndSettle();
    final center = tester.getCenter(find.byType(GridEditor));
    final first = await tester.createGesture(pointer: 1);
    final second = await tester.createGesture(pointer: 2);
    await first.down(center - const Offset(40, 0));
    await second.down(center + const Offset(40, 0));
    await first.moveTo(center - const Offset(90, 0));
    await second.moveTo(center + const Offset(90, 0));
    await first.moveTo(center - const Offset(120, 0));
    await second.moveTo(center + const Offset(120, 0));
    await first.up();
    await second.up();
    await tester.pumpAndSettle();
    final viewer = tester.widget<InteractiveViewer>(
      find.descendant(
        of: find.byType(GridEditor),
        matching: find.byType(InteractiveViewer),
      ),
    );
    expect(
      viewer.transformationController!.value.getMaxScaleOnAxis(),
      greaterThan(1.5),
    );
    await capture('zoom');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
