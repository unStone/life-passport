import argparse
import asyncio
import copy
import json
from pathlib import Path
import time

from bleak import BleakClient, BleakScanner


SERVICE = "e13b0001-c18b-4a9f-8949-7e9aa6579220"
RX = "e13b0002-c18b-4a9f-8949-7e9aa6579220"
TX = "e13b0003-c18b-4a9f-8949-7e9aa6579220"
STATUS = "e13b0004-c18b-4a9f-8949-7e9aa6579220"
ROOT = Path(__file__).resolve().parents[1]


async def write(client, value):
    encoded = (json.dumps(value, separators=(",", ":")) + "\n").encode()
    if len(encoded) >= 1024:
        raise ValueError("Probe request exceeds the firmware contract")
    for offset in range(0, len(encoded), 20):
        await client.write_gatt_char(RX, encoded[offset:offset + 20], response=True)


async def reply(client, predicate, seconds=8):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = json.loads(bytes(await client.read_gatt_char(STATUS)).decode())
        if value.get("v") != 1:
            raise ValueError(f"Unexpected protocol: {value}")
        if predicate(value):
            return value
        await asyncio.sleep(0.15)
    raise TimeoutError("No matching application acknowledgement")


async def main(args):
    devices = await asyncio.wait_for(BleakScanner.discover(
        timeout=8, return_adv=True, service_uuids=[SERVICE]), timeout=20)
    candidates = [device for device, adv in devices.values()
                  if (adv.local_name or device.name or "").startswith("LifePassport")]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected exactly one LifePassport, found {len(candidates)}")
    results = {"device": candidates[0].name, "automated": "NOT RUN", "physical": "NOT RUN"}
    async with BleakClient(candidates[0], timeout=15) as client:
        changes = []
        await client.start_notify(TX, lambda _, data: changes.append(bytes(data)))
        initial = json.loads(bytes(await client.read_gatt_char(STATUS)).decode())
        if initial.get("v") != 1:
            raise RuntimeError("The selected device is not running the Life protocol")
        results["initial"] = initial
        if args.status_only:
            print(json.dumps(initial), flush=True)
            args.report.write_text(json.dumps(results, indent=2))
            return
        vectors = json.loads((ROOT / "tests/life_wire_vectors.json").read_text())
        seed = {key: value for key, value in vectors[1].items() if key != "name"}
        seed["id"] = int(time.time() * 1000) % 0x7ffffffe + 1
        invalid = copy.deepcopy(seed)
        invalid["crc"] ^= 1
        await write(client, invalid)
        error = await reply(client, lambda value: value.get("ok") is False)
        if error.get("error") != "checksum":
            raise AssertionError(f"Expected checksum rejection: {error}")
        results["checksum_rejection"] = "PASS"
        await write(client, seed)
        received = await reply(client, lambda value: value.get("id") == seed["id"] and value.get("state") == "preview")
        if received.get("crc") != seed["crc"] or received.get("population") != 4:
            raise AssertionError(f"Unexpected received seed: {received}")
        results["fragmented_seed"] = "PASS"
        await write(client, seed)
        repeated = await reply(client, lambda value: value.get("id") == seed["id"] and value.get("state") == "preview")
        if repeated.get("crc") != seed["crc"]:
            raise AssertionError("Duplicate request changed the checksum")
        results["idempotent_retry"] = "PASS"
        busy = copy.deepcopy(seed)
        busy["id"] += 1
        await write(client, busy)
        rejected = await reply(client, lambda value: value.get("id") == busy["id"] and value.get("ok") is False)
        if rejected.get("error") != "busy":
            raise AssertionError(f"Pending preview was not protected: {rejected}")
        results["pending_protection"] = "PASS"
        await write(client, seed)
        await reply(client, lambda value: value.get("id") == seed["id"] and value.get("state") == "preview")
        results["automated"] = "PASS"
        results["seed_id"] = seed["id"]
        results["seed_crc"] = seed["crc"]
        results["notifications"] = len(changes)
        print("BLE_AUTOMATED_PASS; board is previewing four corner cells", flush=True)
        args.report.write_text(json.dumps(results, indent=2))
        if args.wait_confirm:
            print("READY_FOR_PHYSICAL_CONFIRMATION: press board OK to apply", flush=True)
            applied = await reply(client, lambda value: value.get("id") == seed["id"] and value.get("state") in ("applied", "cancelled"), args.wait_confirm)
            results["physical"] = applied["state"]
            args.report.write_text(json.dumps(results, indent=2))
            print(json.dumps(applied), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--status-only", action="store_true")
    parser.add_argument("--wait-confirm", type=float, default=0)
    arguments = parser.parse_args()
    asyncio.run(main(arguments))
