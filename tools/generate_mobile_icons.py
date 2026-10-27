from pathlib import Path
import shutil
import subprocess


root = Path(__file__).resolve().parents[1]
source = root / "assets/images/life-controller.svg"
for command in ("rsvg-convert", "magick"):
    if not shutil.which(command):
        raise SystemExit(f"Install {command} to regenerate mobile icons")
files = list((root / "mobile/android/app/src/main/res").glob("mipmap-*/ic_launcher.png"))
files += list((root / "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset").glob("*.png"))
files += list((root / "mobile/web/icons").glob("*.png"))
files += [root / "mobile/web/favicon.png"]
for file in files:
    size = subprocess.check_output(["magick", "identify", "-format", "%w", str(file)], text=True).strip()
    subprocess.run(["rsvg-convert", "--width", size, "--height", size, "--output", str(file), str(source)], check=True)
print(f"Generated {len(files)} mobile icons from {source.name}")
