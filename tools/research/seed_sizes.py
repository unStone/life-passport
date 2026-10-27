import argparse
import csv
import hashlib
import io
import json
import math
import platform
from pathlib import Path
import random
import statistics
import subprocess
import zlib


ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = 36, 32
CELLS = WIDTH * HEIGHT


def pack(cells):
    result = bytearray((len(cells) + 7) // 8)
    for i, cell in enumerate(cells):
        result[i // 8] |= bool(cell) << (i % 8)
    return bytes(result)


def unpack(data, count):
    if len(data) != (count + 7) // 8:
        raise ValueError("Bitmap byte length does not match cell count")
    return [(data[i // 8] >> (i % 8)) & 1 for i in range(count)]


def candidates(data):
    cells = unpack(data, CELLS)
    variants = {"bitmap": data}
    live = [i for i, cell in enumerate(cells) if cell]
    for invert, name in ((False, "sparse_live"), (True, "sparse_dead")):
        indices = [i for i, cell in enumerate(cells) if bool(cell) != invert]
        bits = 0
        for index in indices:
            bits = (bits << 11) | index
        encoded = len(indices).to_bytes(2, "big") + bits.to_bytes((11 * len(indices) + 7) // 8, "big")
        decoded = [int(invert)] * CELLS
        restored = int.from_bytes(encoded[2:], "big")
        for _ in range(int.from_bytes(encoded[:2], "big")):
            decoded[restored & 2047] = int(not invert)
            restored >>= 11
        assert decoded == cells
        variants[name] = encoded
    if live:
        left, right = min(i % WIDTH for i in live), max(i % WIDTH for i in live)
        top, bottom = min(i // WIDTH for i in live), max(i // WIDTH for i in live)
        width, height = right - left + 1, bottom - top + 1
        crop = [cells[y * WIDTH + x] for y in range(top, bottom + 1) for x in range(left, right + 1)]
        header = left | (top << 6) | ((width - 1) << 11) | ((height - 1) << 17)
        encoded = header.to_bytes(3, "little") + pack(crop)
        restored_header = int.from_bytes(encoded[:3], "little")
        restored_left = restored_header & 63
        restored_top = (restored_header >> 6) & 31
        restored_width = ((restored_header >> 11) & 63) + 1
        restored_height = ((restored_header >> 17) & 31) + 1
        decoded = [0] * CELLS
        for i, cell in enumerate(unpack(encoded[3:], restored_width * restored_height)):
            decoded[(restored_top + i // restored_width) * WIDTH + restored_left + i % restored_width] = cell
        assert decoded == cells
        variants["bbox_bitmap"] = encoded
    if not live or len(live) == CELLS:
        # 空白和全满各占一个模式编号，不需要额外棋盘载荷。
        variants["constant"] = b""
    invert = len(live) > CELLS // 2
    indices = [i for i, cell in enumerate(cells) if bool(cell) != invert]
    count = len(indices)
    rank = sum(math.comb(position, order) for order, position in enumerate(indices, 1))
    rank_bytes = ((math.comb(CELLS, count) - 1).bit_length() + 7) // 8
    encoded = count.to_bytes(2, "big") + rank.to_bytes(rank_bytes, "big")
    decoded = [int(invert)] * CELLS
    remainder = int.from_bytes(encoded[2:], "big")
    upper = CELLS - 1
    for order in range(count, 0, -1):
        low, high = order - 1, upper
        while low < high:
            middle = (low + high + 1) // 2
            if math.comb(middle, order) <= remainder:
                low = middle
            else:
                high = middle - 1
        decoded[low] = int(not invert)
        remainder -= math.comb(low, order)
        upper = low - 1
    assert decoded == cells and remainder == 0
    variants["enumerative_dead" if invert else "enumerative_live"] = encoded
    compressor = zlib.compressobj(level=9, wbits=-15)
    compressed = compressor.compress(data) + compressor.flush()
    assert zlib.decompress(compressed, wbits=-15) == data
    variants["deflate"] = compressed
    return variants


def describe(name, data):
    variants = candidates(data)
    lengths = {key: len(value) + 1 for key, value in variants.items()}
    best = min(lengths, key=lengths.get)
    return {"name": name, "population": sum(unpack(data, CELLS)),
            "bytes_including_one_mode_byte": lengths, "best": best, "best_bytes": lengths[best]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "work/research/seed-sizes.json")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    executable = args.output.parent / "life_corpus"
    subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-I", str(ROOT / "main"),
                    str(ROOT / "tools/research/life_corpus.c"), str(ROOT / "main/life.c"), "-o", str(executable)], check=True)
    corpus = subprocess.check_output([str(executable)], text=True)
    cases = [describe(row["name"], bytes.fromhex(row["packed_hex"])) for row in csv.DictReader(io.StringIO(corpus))]
    groups = []
    generator = random.Random(20261027)
    for density in (1, 5, 10, 28, 50, 90, 99):
        samples = [describe(str(i), pack([generator.randrange(100) < density for _ in range(CELLS)])) for i in range(100)]
        sizes = [sample["best_bytes"] for sample in samples]
        groups.append({"density_percent": density, "samples": len(samples), "min": min(sizes), "max": max(sizes),
                       "median": statistics.median(sizes), "mean": statistics.mean(sizes)})
    entropy = {str(p): CELLS * (-p * math.log2(p) - (1 - p) * math.log2(1 - p)) / 8 for p in (0.28, 0.5)}
    result = {"board": [WIDTH, HEIGHT], "raw_bytes": CELLS // 8, "common_object_header_and_crc_excluded": True,
              "life_source_sha256": hashlib.sha256((ROOT / "main/life.c").read_bytes()).hexdigest(),
              "python": platform.python_version(), "zlib": zlib.ZLIB_RUNTIME_VERSION,
              "mode_byte_included": True, "firmware_cases": cases, "random_groups": groups,
              "bernoulli_entropy_bytes_not_a_per_board_minimum": entropy,
              "roundtrips": len(cases) + sum(group["samples"] for group in groups)}
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
