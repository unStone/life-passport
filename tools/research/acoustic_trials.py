import argparse
from array import array
import ctypes as ct
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
import zlib


ROOT = Path(__file__).resolve().parents[2]
GGWAVE_COMMIT = "060aec73dd7123ccac200442f75bdc7369795ffe"
PROTOCOLS = {"DT_FASTEST": 8, "MT_FASTEST": 11}


class Parameters(ct.Structure):
    _fields_ = [("payloadLength", ct.c_int), ("sampleRateInp", ct.c_float),
                ("sampleRateOut", ct.c_float), ("sampleRate", ct.c_float),
                ("samplesPerFrame", ct.c_int), ("soundMarkerThreshold", ct.c_float),
                ("sampleFormatInp", ct.c_int), ("sampleFormatOut", ct.c_int),
                ("operatingMode", ct.c_int)]


def library(path):
    lib = ct.CDLL(str(path.resolve()))
    lib.ggwave_setLogFile.argtypes = [ct.c_void_p]
    lib.ggwave_setLogFile(None)
    lib.ggwave_getDefaultParameters.restype = Parameters
    lib.ggwave_init.argtypes = [Parameters]
    lib.ggwave_init.restype = ct.c_int
    lib.ggwave_free.argtypes = [ct.c_int]
    lib.ggwave_rxToggleProtocol.argtypes = [ct.c_int, ct.c_int]
    lib.ggwave_txToggleProtocol.argtypes = [ct.c_int, ct.c_int]
    lib.ggwave_encode.argtypes = [ct.c_int, ct.c_void_p, ct.c_int, ct.c_int, ct.c_int, ct.c_void_p, ct.c_int]
    lib.ggwave_encode.restype = ct.c_int
    lib.ggwave_ndecode.argtypes = [ct.c_int, ct.c_void_p, ct.c_int, ct.c_void_p, ct.c_int]
    lib.ggwave_ndecode.restype = ct.c_int
    return lib


def instance(lib, transmit, length):
    params = lib.ggwave_getDefaultParameters()
    params.payloadLength = length
    params.sampleRateInp = params.sampleRateOut = params.sampleRate = 24000
    params.samplesPerFrame = 512
    params.sampleFormatInp = 5 if transmit else 4  # SDK: F32 output, I16 microphone
    params.sampleFormatOut = 5
    params.operatingMode = (4 if transmit else 2) | 16  # TX/RX plus DSS
    result = lib.ggwave_init(params)
    if result < 0:
        raise RuntimeError("GGWave instance allocation failed")
    return result


def encode(lib, payload, protocol):
    sender = instance(lib, True, len(payload))
    try:
        source = ct.create_string_buffer(payload)
        size = lib.ggwave_encode(sender, source, len(payload), protocol, 25, None, 1)
        if size <= 0 or size % 4:
            raise RuntimeError(f"Unexpected GGWave waveform size: {size}")
        target = ct.create_string_buffer(size)
        count = lib.ggwave_encode(sender, source, len(payload), protocol, 25, target, 0)
        if count <= 0 or count % 4:
            raise RuntimeError(f"GGWave encoding failed: {count}")
        result = array("f")
        result.frombytes(target.raw[:count])
        return result
    finally:
        lib.ggwave_free(sender)


def corrupt(signal, condition, generator):
    values = list(signal)
    sigma = None
    if condition.startswith("snr_"):
        snr = float(condition.removeprefix("snr_"))
        rms = math.sqrt(sum(x * x for x in values) / len(values))
        sigma = rms / (10 ** (snr / 20))
    elif condition == "gain_0.1":
        values = [x * 0.1 for x in values]
    elif condition == "clip_0.04":
        values = [max(-0.04, min(0.04, x)) for x in values]
    elif condition.startswith("dropout_"):
        count = round(float(condition.removeprefix("dropout_")) / 1000 * 24000)
        start = generator.randrange(max(1, len(values) - count))
        values[start:start + count] = [0] * count
    elif condition == "echo_60ms":
        delay = 1440
        original = values[:]
        values = [x + (0.9 * original[i - delay] if i >= delay else 0) for i, x in enumerate(original)]
    elif condition == "speed_1.01":
        original = values
        values = []
        for i in range(int((len(original) - 1) / 1.01)):
            position = i * 1.01
            left = int(position)
            ratio = position - left
            values.append(original[left] * (1 - ratio) + original[left + 1] * ratio)
    elif condition != "clean":
        raise ValueError(f"Unknown channel model: {condition}")
    prefix = [0] * generator.randrange(512, 4096)
    waveform = prefix + values + [0] * 16384
    if sigma is not None:
        waveform = [x + generator.gauss(0, sigma) for x in waveform]
    return array("f", waveform)


def decode(lib, waveform, payload):
    receiver = instance(lib, False, len(payload))
    rejected = 0
    try:
        raw = array("h", (round(max(-1, min(1, sample)) * 32767) for sample in waveform)).tobytes()
        target = ct.create_string_buffer(64)
        for start in range(0, len(raw), 512 * 2):
            block = raw[start:start + 512 * 2]
            source = ct.create_string_buffer(block)
            count = lib.ggwave_ndecode(receiver, source, len(block), target, len(target))
            if count == -2:
                raise RuntimeError("GGWave output exceeded the configured payload buffer")
            if count > 0:
                recovered = target.raw[:count]
                if recovered == payload:
                    return True, rejected
                valid_crc = len(recovered) == len(payload) and zlib.crc32(recovered[:-4]) == int.from_bytes(recovered[-4:], "little")
                if valid_crc:
                    raise AssertionError("Unexpected incorrect payload passed CRC32")
                rejected += 1
        return False, rejected
    finally:
        lib.ggwave_free(receiver)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--library", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, default=ROOT / "work/research-ggwave")
    parser.add_argument("--trials", type=int, default=10)
    parser.add_argument("--payload", type=int, choices=(8, 16, 24, 32, 64), default=24)
    parser.add_argument("--output", type=Path, default=ROOT / "work/research/acoustic-trials.json")
    args = parser.parse_args()
    if args.trials < 1:
        parser.error("--trials must be positive")
    commit = subprocess.check_output(["git", "-C", str(args.source_root), "rev-parse", "HEAD"], text=True).strip()
    if commit != GGWAVE_COMMIT:
        raise RuntimeError(f"GGWave checkout must be {GGWAVE_COMMIT}, found {commit}")
    lib = library(args.library)
    generator = random.Random(20261027)
    result = {"ggwave_commit": GGWAVE_COMMIT, "fixed_payload_bytes": args.payload, "sample_rate": 24000,
              "library_sha256": hashlib.sha256(args.library.read_bytes()).hexdigest(),
              "fft_samples": 512, "microphone_format": "signed 16-bit PCM", "noise_in_silence": True,
              "physical_test": "NOT RUN", "channels": []}
    for name, protocol in PROTOCOLS.items():
        for index in range(12):
            lib.ggwave_rxToggleProtocol(index, int(index == protocol))
            lib.ggwave_txToggleProtocol(index, int(index == protocol))
        for condition in ("clean", "snr_20", "snr_10", "snr_5", "snr_0", "snr_-5", "snr_-10", "snr_-15",
                          "gain_0.1", "clip_0.04", "dropout_80", "dropout_200", "dropout_500", "dropout_1000",
                          "echo_60ms", "speed_1.01"):
            successes = rejected = 0
            duration = 0
            for _ in range(args.trials):
                body = bytes(generator.randrange(256) for _ in range(args.payload - 4))
                payload = body + zlib.crc32(body).to_bytes(4, "little")
                signal = encode(lib, payload, protocol)
                duration = len(signal) / 24000
                recovered, invalid = decode(lib, corrupt(signal, condition, generator), payload)
                successes += recovered
                rejected += invalid
            if condition == "clean":
                assert successes == args.trials
            row = {"protocol": name, "condition": condition, "trials": args.trials,
                   "exact_recoveries": successes, "wrong_payloads_rejected": rejected,
                   "waveform_seconds": duration}
            result["channels"].append(row)
            print(json.dumps(row), flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
