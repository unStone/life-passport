import argparse
import hashlib
import json
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets/fonts/life_web.ttf"
COPY = ROOT / "site/public/fonts/life_web.ttf"
MANIFEST = ROOT / "assets/fonts/life_web_inventory.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = (ROOT / "site/index.html").read_text() + "".join(path.read_text() for path in (ROOT / "site/src").glob("*.*"))
    points = sorted(set(range(32, 127)) | {ord(c) for c in text if ord(c) > 127})
    if args.check:
        data = json.loads(MANIFEST.read_text())
        missing = set(points) - set(data["codepoints"])
        if missing:
            raise SystemExit(f"Website font inventory missing: {missing}")
        for file in (TARGET, COPY):
            if hashlib.sha256(file.read_bytes()).hexdigest() != data["sha256"]:
                raise SystemExit(f"Website font checksum mismatch: {file}")
        print(f"Website font: PASS ({len(points)} code points)")
        return
    if not args.source or not args.source.is_file():
        parser.error("--source must name the licensed Noto Sans SC variable font")
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    font = TTFont(args.source, recalcTimestamp=False)
    if "fvar" in font:
        instantiateVariableFont(font, {"wght": 500}, inplace=True)
    missing = set(points) - set(font.getBestCmap())
    if missing:
        raise SystemExit(f"Source font lacks website glyphs: {missing}")
    subsetter = subset.Subsetter()
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    font.save(TARGET)
    COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TARGET, COPY)
    for name in ("NOTICE.txt", "OFL.txt"):
        shutil.copy2(ROOT / "assets/fonts" / name, COPY.parent / name)
    MANIFEST.write_text(json.dumps({"family": "Noto Sans SC", "weight": 500, "fonttools": "4.60.1",
        "license": "OFL-1.1", "codepoints": points, "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(TARGET.read_bytes()).hexdigest()}, indent=2) + "\n")
    print(f"Generated website font: {len(points)} code points")


if __name__ == "__main__":
    main()
