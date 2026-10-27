import argparse
import itertools
import json
import math
from pathlib import Path
import random
import struct
import zlib

from reedsolo import RSCodec, ReedSolomonError


ROOT = Path(__file__).resolve().parents[2]


def intact(data):
    return len(data) >= 4 and zlib.crc32(data[:-4]) == int.from_bytes(data[-4:], "little")


def error_trials(payload, generator):
    codec = RSCodec(32)
    coded = codec.encode(payload)
    results = []
    for errors, erasures in ((0, 0), (8, 0), (16, 0), (17, 0), (0, 32), (0, 33), (8, 16)):
        accepted, rejected, wrong = 0, 0, 0
        for _ in range(100):
            positions = generator.sample(range(len(coded)), errors + erasures)
            damaged = bytearray(coded)
            for position in positions:
                damaged[position] ^= generator.randrange(1, 256)
            try:
                recovered = bytes(codec.decode(damaged, erase_pos=positions[:erasures])[0])
            except ReedSolomonError:
                # 信道错误是本实验输入；解码器明确拒绝计入观测结果。
                rejected += 1
                continue
            if not intact(recovered):
                rejected += 1
            elif recovered != payload:
                wrong += 1
            else:
                accepted += 1
        if 2 * errors + erasures <= 32:
            assert accepted == 100
        assert wrong == 0
        results.append({"errors": errors, "known_erasures": erasures, "trials": 100,
                        "exact_recoveries": accepted, "rejected": rejected, "wrong_crc_accepted": wrong})
    return results


def interleaving(payload):
    codec = RSCodec(8)
    assert len(payload) == 156
    blocks = [codec.encode(payload[i:i + 39]) for i in range(0, 156, 39)]
    output = []
    for interleaved in (False, True):
        wire = bytearray(value for column in zip(*blocks) for value in column) if interleaved else bytearray().join(blocks)
        for i in range(20, 32):
            wire[i] ^= 0xA5
        damaged = [wire[i::4] for i in range(4)] if interleaved else [wire[i:i + 47] for i in range(0, 188, 47)]
        try:
            recovered = b"".join(bytes(codec.decode(block)[0]) for block in damaged)
        except ReedSolomonError:
            recovered = b""
        output.append({"interleaved": interleaved, "consecutive_corrupt_bytes": 12,
                       "same_32_parity_bytes": True, "exact_recovery": recovered == payload})
    assert not output[0]["exact_recovery"] and output[1]["exact_recovery"]
    return output


def erasure_shards(payload):
    codec = RSCodec(4)
    padded = payload.ljust(160, b"\0")
    source = [padded[i:i + 16] for i in range(0, 160, 16)]
    encoded_columns = [codec.encode(bytes(shard[column] for shard in source)) for column in range(16)]
    shards = [bytes(column[i] for column in encoded_columns) for i in range(14)]
    recovered_count = 0
    for missing in itertools.combinations(range(14), 4):
        columns = []
        for column in range(16):
            damaged = bytearray(shard[column] for shard in shards)
            for index in missing:
                damaged[index] = 0
            columns.append(codec.decode(damaged, erase_pos=list(missing))[0])
        decoded = bytes(value for row in zip(*columns) for value in row)[:len(payload)]
        assert decoded == payload and intact(decoded)
        recovered_count += 1
    return {"source_shards": 10, "total_shards": 14, "bytes_per_shard": 16,
            "lost_frames": 4, "all_loss_subsets_tested": recovered_count, "all_recovered": True,
            "frame_headers_audio_inner_fec_excluded": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "work/research/fec-trials.json")
    args = parser.parse_args()
    generator = random.Random(20261027)
    body = struct.pack("<BBBBI", 1, 0, 1, 2, 0x10203040) + bytes(generator.randrange(256) for _ in range(144))
    payload = body + struct.pack("<I", zlib.crc32(body))
    result = {"payload_bytes": len(payload), "rs_parity_bytes": 32, "rs_total_bytes": len(payload) + 32,
              "byte_corruption": error_trials(payload, generator), "burst_model": interleaving(payload),
              "packet_erasure_model": erasure_shards(payload), "physical_acoustic_test": "NOT RUN"}
    result["independent_frame_loss_model"] = [
        {"loss_probability": p, "ten_data_frames_one_pass": (1 - p) ** 10,
         "ten_data_plus_four_parity_one_pass": sum(math.comb(14, received) * (1 - p) ** received * p ** (14 - received)
                                                   for received in range(10, 15)),
         "ten_data_frames_two_passes": (1 - p * p) ** 10}
        for p in (0.1, 0.2)
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
