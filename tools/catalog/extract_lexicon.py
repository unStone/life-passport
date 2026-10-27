import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[2]
PIN = "19eeabbf84b94f6a53791774e4377e766e10c0c6"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--parser", type=Path, required=True)
    args = parser.parse_args()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=args.source).decode().strip()
    if commit != PIN:
        raise SystemExit(f"Life Lexicon source commit {commit} != pinned {PIN}")
    path = args.source / "lexicon/zip/lex_htm1/lexicon.htm"
    raw = path.read_bytes()
    soup = BeautifulSoup(raw, "html5lib", from_encoding="ascii")
    entries, credits, current, seen = [], {}, None, set()
    for tag in soup.find_all(["h3", "p", "pre"]):
        if tag.name == "h3":
            continue
        if tag.name == "p" and tag.get_text().lstrip().startswith(":") and tag.find("b"):
            name = tag.find("b").get_text(" ", strip=True)
            anchor = tag.find("a", attrs={"name": True})
            current = {"name": name, "anchor": anchor["name"] if anchor else None,
                       "sourceNote": tag.get_text(" ", strip=True)[:700]}
        if tag.name != "pre" or not current or current["name"] in seen:
            continue
        text = tag.get_text()
        # Reject non-pattern examples; the library performs all coordinate parsing.
        if not set(text).issubset(set(".O* \t\r\n")) or not set(text).intersection("O*"):
            continue
        seen.add(current["name"])
        source = "https://github.com/rokicki/lifecontent/blob/" + PIN + "/lexicon/zip/lex_htm1/lexicon.htm"
        entry = {**current, "id": f"lexicon-{len(entries) + 1}", "pattern": text,
                 "source": source, "reference": "https://conwaylife.com/ref/lexicon/lexicon.htm" + ("#" + current["anchor"] if current["anchor"] else "")}
        entries.append(entry)
    for title in ("CREDITS", "COPYING"):
        heading = next(tag for tag in soup.find_all("h3") if tag.get_text(strip=True) == title)
        nodes = []
        for sibling in heading.next_siblings:
            if isinstance(sibling, Tag) and sibling.name == "h3":
                break
            nodes.append(sibling.get_text(" ", strip=True) if isinstance(sibling, Tag) else str(sibling).strip())
        credits[title] = "\n".join(filter(None, nodes))
    if "CC BY-SA 3.0" not in credits["COPYING"]:
        raise SystemExit("Source license does not match the reviewed CC BY-SA 3.0 notice")
    directory = ROOT / "work/catalog"
    directory.mkdir(exist_ok=True)
    (directory / "requests.json").write_text(json.dumps(entries))
    result = subprocess.run([str(args.parser.resolve())], input=json.dumps(entries).encode(), stdout=subprocess.PIPE, check=True)
    (directory / "parsed.json").write_bytes(result.stdout)
    metadata = {"repository": "https://github.com/rokicki/lifecontent", "commit": PIN,
                "source_sha256": hashlib.sha256(raw).hexdigest(), "release": "Life Lexicon release 29, 2018-07-02",
                "license": "CC-BY-SA-3.0", "credits": credits}
    (directory / "source.json").write_text(json.dumps(metadata, indent=2))
    print(f"Parsed {len(entries)} named Life Lexicon patterns with ca-formats 0.3.5")


if __name__ == "__main__":
    main()
