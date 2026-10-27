import json
from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
MASK = (1 << 64) - 1


def board(key):
    state = key or 0x9E3779B97F4A7C15
    bits = bytearray(144)
    for bit in range(1152):
        state ^= state >> 12
        state ^= (state << 25) & MASK
        state ^= state >> 27
        value = (state * 2685821657736338717) & MASK
        if value % 100 < 28:
            bits[bit // 8] |= 1 << (bit % 8)
    return bits


def main():
    vectors = []
    for index, text in enumerate(("0000000000", "0000000001", "0123456789", "HELLOWORLD", "ZZZZZZZZZZ"), 1):
        key = int(text, 36)
        bits = board(key)
        prefix = b"LP" + bytes((1, 13, index)) + key.to_bytes(7, "little")
        packet = prefix + struct.pack("<I", zlib.crc32(prefix))
        vectors.append({"key": text, "value": key, "seq": index, "packet_hex": packet.hex(),
                        "board_hex": bits.hex(), "board_crc": zlib.crc32(bits), "population": sum(bin(x).count("1") for x in bits)})
    (ROOT / "tests/audio_vectors.json").write_text(json.dumps(vectors, indent=2) + "\n")


if __name__ == "__main__":
    main()
