import argparse
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "work/ui-captures")
    args = parser.parse_args()
    build = ROOT / "work/visual-build"
    subprocess.run(["cmake", "-S", str(ROOT / "tests/visual"), "-B", str(build),
                    "-DLVGL_ROOT=" + str(ROOT / "managed_components/lvgl__lvgl"),
                    "-DCMAKE_BUILD_TYPE=Release"], check=True)
    subprocess.run(["cmake", "--build", str(build), "--parallel", "8"], check=True)
    args.output.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(build / "life_visual"), str(args.output)], check=True, timeout=90)


if __name__ == "__main__":
    main()
