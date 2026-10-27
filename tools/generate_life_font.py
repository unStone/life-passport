import argparse
import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "assets/fonts"


def inventory():
    text = (ROOT / "main/life_ui.c").read_text(encoding="utf-8")
    return sorted(set(range(32, 127)) | {ord(c) for c in text if ord(c) > 127})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    points = inventory()
    manifest_path = FONT_DIR / "life_font_inventory.json"
    generated = FONT_DIR / "life_font_16.c"
    if args.check:
        manifest = json.loads(manifest_path.read_text())
        missing = sorted(set(points) - set(manifest["codepoints"]))
        if missing:
            raise SystemExit("Missing font inventory: " + ", ".join(f"U+{cp:04X}" for cp in missing))
        if hashlib.sha256(generated.read_bytes()).hexdigest() != manifest["generated_sha256"]:
            raise SystemExit("Generated font differs from its verified inventory; regenerate it")
        print(f"Font inventory: PASS ({len(points)} required code points, 16px)")
        return
    if not args.source or not args.source.is_file():
        parser.error("--source must name the licensed Noto Sans SC source font")
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    FONT_DIR.mkdir(parents=True, exist_ok=True)
    intermediate = ROOT / "work/NotoSansSC-Medium.ttf"
    intermediate.parent.mkdir(exist_ok=True)
    font = TTFont(args.source, recalcTimestamp=False)
    copyright_notice = font["name"].getDebugName(0)
    if not copyright_notice:
        raise SystemExit("Source font has no copyright notice")
    if "fvar" in font:
        instantiateVariableFont(font, {"wght": 500}, inplace=True)
    subsetter = subset.Subsetter()
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    font.save(intermediate)
    command = [str(ROOT / "tools/font/node_modules/.bin/lv_font_conv"),
               "--font", str(intermediate), "--range", "0x20-0x7e",
               "--symbols", "".join(chr(cp) for cp in points if cp > 126),
               "--size", "16", "--bpp", "4", "--format", "lvgl",
               "--no-compress", "--no-prefilter", "--lv-font-name", "life_font_16",
               "--lv-include", "lvgl.h", "--output", str(generated)]
    subprocess.run(command, check=True)
    (FONT_DIR / "NOTICE.txt").write_text(
        copyright_notice + "\n\nDerived Noto Sans SC glyph subset at weight 500.\n"
        "Licensed under the SIL Open Font License 1.1; see OFL.txt.\n")
    (FONT_DIR / "life_font_codepoints.h").write_text(
        "#pragma once\n#include <stdint.h>\nstatic const uint32_t life_font_codepoints[] = {\n"
        + "".join(f"    0x{cp:04X},\n" for cp in points) + "};\n")
    manifest_path.write_text(json.dumps({
        "family": "Noto Sans SC", "license": "OFL-1.1", "size": 16, "bpp": 4,
        "converter": "lv_font_conv 1.5.3", "node": "22.22.3",
        "fonttools": "4.60.1", "weight": 500,
        "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "generated_sha256": hashlib.sha256(generated.read_bytes()).hexdigest(),
        "codepoints": points,
    }, indent=2) + "\n")
    print(f"Generated {len(points)} glyphs: {generated.stat().st_size} source bytes")


if __name__ == "__main__":
    main()
