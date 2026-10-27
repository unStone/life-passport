import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import random
import statistics
import subprocess

import constriction
import numpy as np

from seed_sizes import CELLS, WIDTH, pack, unpack


ROOT = Path(__file__).resolve().parents[2]


def model(q):
    return constriction.stream.model.Categorical(np.array([256 - q, q], dtype=np.float64), perfect=False)


def predictors(cells):
    return [((int(cells[i - 1]) if i % WIDTH else 0) << 1) | (int(cells[i - WIDTH]) if i >= WIDTH else 0)
            for i in range(CELLS)]


def encode_case(data):
    cells = np.array(unpack(data, CELLS), dtype=np.int32)
    sizes = {"bitmap": 145}
    q_fitted = max(1, min(255, round((int(cells.sum()) + 1) * 256 / (CELLS + 2))))
    for label, q, metadata in (("fixed28", round(.28 * 256), 0), ("fitted", q_fitted, 1)):
        distribution = model(q)
        encoder = constriction.stream.queue.RangeEncoder()
        encoder.encode(cells, distribution)
        words = encoder.get_compressed()
        restored = constriction.stream.queue.RangeDecoder(words).decode(distribution, CELLS)
        assert np.array_equal(restored, cells)
        sizes["range_" + label] = words.nbytes + metadata + 1
        encoder = constriction.stream.stack.AnsCoder()
        encoder.encode_reverse(cells, distribution)
        words = encoder.get_compressed()
        decoder = constriction.stream.stack.AnsCoder(words)
        assert np.array_equal(decoder.decode(distribution, CELLS), cells) and decoder.is_empty()
        sizes["ans_" + label] = words.nbytes + metadata + 1

    contexts = predictors(cells)
    frequencies = [[1, 1] for _ in range(4)]
    for context, cell in zip(contexts, cells):
        frequencies[context][int(cell)] += 1
    qs = [max(1, min(255, round(256 * ones / (zeros + ones)))) for zeros, ones in frequencies]
    tables = np.array([[256 - qs[context], qs[context]] for context in contexts], dtype=np.float64)
    family = constriction.stream.model.Categorical(perfect=False)
    distributions = [model(q) for q in qs]
    for kind in ("range", "ans"):
        encoder = constriction.stream.queue.RangeEncoder() if kind == "range" else constriction.stream.stack.AnsCoder()
        if kind == "range":
            encoder.encode(cells, family, tables)
        else:
            encoder.encode_reverse(cells, family, tables)
        words = encoder.get_compressed()
        decoder = constriction.stream.queue.RangeDecoder(words) if kind == "range" else constriction.stream.stack.AnsCoder(words)
        restored = np.zeros(CELLS, dtype=np.int32)
        for i in range(CELLS):
            context = ((int(restored[i - 1]) if i % WIDTH else 0) << 1) | (int(restored[i - WIDTH]) if i >= WIDTH else 0)
            restored[i] = decoder.decode(distributions[context])
        assert np.array_equal(restored, cells)
        if kind == "ans":
            assert decoder.is_empty()
        sizes[kind + "_four_contexts"] = words.nbytes + 4 + 1
    return sizes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=ROOT / "work/research/life_corpus")
    parser.add_argument("--output", type=Path, default=ROOT / "work/research/entropy-trials.json")
    args = parser.parse_args()
    if not args.corpus.is_file():
        raise RuntimeError("Run tools/research/seed_sizes.py first to create the actual firmware corpus")
    corpus = subprocess.check_output([str(args.corpus)], text=True)
    cases = [{"name": row["name"], "bytes": encode_case(bytes.fromhex(row["packed_hex"]))}
             for row in csv.DictReader(io.StringIO(corpus))]
    generator = random.Random(20261027)
    groups = []
    for density in (1, 5, 10, 28, 50, 90, 99):
        samples = [encode_case(pack([generator.randrange(100) < density for _ in range(CELLS)])) for _ in range(100)]
        medians = {name: statistics.median(sample[name] for sample in samples) for name in samples[0]}
        groups.append({"density_percent": density, "samples": len(samples), "median_bytes": medians})
        print(json.dumps(groups[-1]), flush=True)
    result = {"constriction": "0.4.2", "numpy": np.__version__, "board": [36, 32],
              "source_sha256": hashlib.sha256((ROOT / "main/life.c").read_bytes()).hexdigest(),
              "word_size_bits": 32, "common_object_header_and_crc_excluded": True,
              "mode_and_model_parameters_included": True, "firmware_cases": cases,
              "random_groups": groups, "physical_decoder_test": "NOT RUN"}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
