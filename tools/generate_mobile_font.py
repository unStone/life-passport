import argparse
import hashlib
import json
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
target = ROOT / "assets/fonts/life_mobile.ttf"
copy = ROOT / "mobile/assets/fonts/life_ui.ttf"
manifest = ROOT / "assets/fonts/life_mobile_inventory.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = "许可返回关闭确定取消查看说明剪切复制粘贴全选撤销重做选择文本" + "".join(
        path.read_text() for path in (ROOT / "mobile/lib").rglob("*.dart"))
    points = sorted(set(range(32, 127)) | {0xA9} | {ord(c) for c in text if ord(c) > 127})
    if args.check:
        data = json.loads(manifest.read_text())
        missing = sorted(set(points) - set(data["codepoints"]))
        if missing:
            raise SystemExit("Mobile font missing inventory: " + ",".join(f"U+{n:04X}" for n in missing))
        for file in (target, copy):
            if hashlib.sha256(file.read_bytes()).hexdigest() != data["sha256"]:
                raise SystemExit(f"Mobile font checksum mismatch: {file}")
        print(f"Mobile font: PASS ({len(points)} code points)")
        return
    if not args.source or not args.source.is_file():
        parser.error("--source must name the licensed Noto Sans SC variable font")
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    font = TTFont(args.source, recalcTimestamp=False)
    if "fvar" in font:
        instantiateVariableFont(font, {"wght": 500}, inplace=True)
    required = set(points) - set(font.getBestCmap())
    if required:
        raise SystemExit(f"Source font lacks {required}")
    subsetter = subset.Subsetter()
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    font.save(target)
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, copy)
    for name in ("NOTICE.txt", "OFL.txt"):
        shutil.copy2(ROOT / "assets/fonts" / name, copy.parent / name)
    manifest.write_text(json.dumps({"family": "Noto Sans SC", "weight": 500,
        "fonttools": "4.60.1", "license": "OFL-1.1", "codepoints": points,
        "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2) + "\n")
    print(f"Generated mobile font: {len(points)} code points, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
