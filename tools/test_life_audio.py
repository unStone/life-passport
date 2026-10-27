from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def run(*command):
    subprocess.run(command, cwd=ROOT, check=True)


def main():
    run("cmake", "-S", "tests/acoustic", "-B", "work/acoustic-host", "-DCMAKE_BUILD_TYPE=Release")
    run("cmake", "--build", "work/acoustic-host", "--parallel", "4")
    run("npm", "ci", "--prefix", "site")
    run("npm", "test", "--prefix", "site")
    run("npm", "run", "build", "--prefix", "site")
    print("Acoustic WASM/native interoperability and website build: PASS")


if __name__ == "__main__":
    main()
