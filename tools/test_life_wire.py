import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
idf = os.environ.get("IDF_PATH")
if not idf:
    raise SystemExit("Activate the pinned ESP-IDF 5.5.3 before running wire integration tests")
cjson = Path(idf) / "components/json/cJSON"
if not (cjson / "cJSON.c").is_file():
    raise SystemExit(f"ESP-IDF cJSON source missing: {cjson}")
output = ROOT / "work/test_life_wire"
output.parent.mkdir(exist_ok=True)
compiler = os.environ.get("CC", "cc")
vendor_object = ROOT / "work/life_cjson.o"
# macOS SDK 将上游 cJSON 的 sprintf 标记为弃用；单独编译且保留警告，
# 应用代码仍使用 -Werror，双方均启用内存与未定义行为检查。
subprocess.run([compiler, "-std=c11", "-Wall", "-Wextra", "-fsanitize=address,undefined", "-DCJSON_NESTING_LIMIT=4",
                "-I" + str(cjson), "-c", str(cjson / "cJSON.c"), "-o", str(vendor_object)], check=True)
subprocess.run([compiler, "-std=c11", "-Wall", "-Wextra", "-Werror",
                "-fsanitize=address,undefined", "-I" + str(ROOT / "main"), "-I" + str(cjson),
                str(ROOT / "tests/test_life_wire.c"), str(ROOT / "main/life_wire.c"),
                str(vendor_object), "-lz", "-lm", "-o", str(output)], check=True)
subprocess.run([str(output), str(ROOT / "tests/life_wire_vectors.json")], check=True)
