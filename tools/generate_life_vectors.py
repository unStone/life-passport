import json
from pathlib import Path
import zlib


root = Path(__file__).resolve().parents[1]
vectors = []
for name, points in [
    ("empty", []),
    ("corners", [(0, 0), (35, 0), (0, 31), (35, 31)]),
    ("glider", [(17, 14), (18, 15), (16, 16), (17, 16), (18, 16)]),
    ("full", [(x, y) for y in range(32) for x in range(36)]),
]:
    rows = [0] * 32
    bits = bytearray(144)
    for x, y in points:
        rows[y] |= 1 << x
        index = y * 36 + x
        bits[index // 8] |= 1 << (index % 8)
    vectors.append({"name": name, "v": 1, "id": len(vectors) + 1,
                    "op": "seed", "w": 36, "h": 32, "rows": rows,
                    "crc": zlib.crc32(bits), "interval_ms": 200, "wrap": True})
(root / "tests/life_wire_vectors.json").write_text(json.dumps(vectors, indent=2) + "\n")
print([(v["name"], v["crc"]) for v in vectors])
