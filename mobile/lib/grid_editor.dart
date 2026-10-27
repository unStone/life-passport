import 'dart:math';
import 'package:flutter/material.dart';
import 'board.dart';

class GridEditor extends StatefulWidget {
  const GridEditor({
    super.key,
    required this.board,
    required this.mode,
    required this.editable,
    required this.onStart,
    required this.onCell,
  });
  final Board board;
  final int mode;
  final bool editable;
  final VoidCallback onStart;
  final void Function(int x, int y, bool alive) onCell;
  @override
  State<GridEditor> createState() => _GridEditorState();
}

class _GridEditorState extends State<GridEditor> {
  final _transform = TransformationController();
  Point<int>? _last;
  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  void _paint(Offset position, double size) {
    if (!widget.editable || widget.mode == 2) return;
    final x = (position.dx / size * columns).floor();
    final y = (position.dy / size * columns).floor();
    if (x < 0 || x >= columns || y < 0 || y >= rows) return;
    final from = _last ?? Point(x, y);
    final steps = max((x - from.x).abs(), (y - from.y).abs());
    for (var i = 0; i <= steps; i++) {
      final ratio = steps == 0 ? 1.0 : i / steps;
      widget.onCell(
        (from.x + (x - from.x) * ratio).round(),
        (from.y + (y - from.y) * ratio).round(),
        widget.mode == 0,
      );
    }
    _last = Point(x, y);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final width = box.maxWidth;
      return ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          height: width * rows / columns,
          child: InteractiveViewer(
            transformationController: _transform,
            minScale: 1,
            maxScale: 5,
            panEnabled: widget.mode == 2,
            scaleEnabled: widget.mode == 2,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanDown: widget.editable && widget.mode != 2
                  ? (event) {
                      if (widget.editable && widget.mode != 2) {
                        _last = null;
                        widget.onStart();
                        _paint(event.localPosition, width);
                      }
                    }
                  : null,
              onPanUpdate: widget.editable && widget.mode != 2
                  ? (event) => _paint(event.localPosition, width)
                  : null,
              onPanEnd: widget.editable && widget.mode != 2
                  ? (_) => _last = null
                  : null,
              onPanCancel: widget.editable && widget.mode != 2
                  ? () => _last = null
                  : null,
              child: CustomPaint(
                size: Size(width, width * rows / columns),
                painter: _BoardPainter(widget.board),
              ),
            ),
          ),
        ),
      );
    },
  );
}

class _BoardPainter extends CustomPainter {
  _BoardPainter(this.board);
  final Board board;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(const Color(0xff0a2420), BlendMode.src);
    final pitch = size.width / columns;
    final paint = Paint()..color = const Color(0xffd9ef85);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < columns; x++) {
        if (board.cells[y * columns + x] == 0) continue;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(
              x * pitch + .7,
              y * pitch + .7,
              pitch - 1.4,
              pitch - 1.4,
            ),
            const Radius.circular(1.8),
          ),
          paint,
        );
      }
    }
    final grid = Path();
    for (var x = 0; x <= columns; x++) {
      grid.moveTo(x * pitch, 0);
      grid.lineTo(x * pitch, size.height);
    }
    for (var y = 0; y <= rows; y++) {
      grid.moveTo(0, y * pitch);
      grid.lineTo(size.width, y * pitch);
    }
    canvas.drawPath(
      grid,
      Paint()
        ..color = const Color(0xff27463e)
        ..style = PaintingStyle.stroke
        ..strokeWidth = .35,
    );
  }

  @override
  bool shouldRepaint(covariant _BoardPainter oldDelegate) => true;
}
