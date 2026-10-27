[简体中文](pattern-catalog.zh_CN.md) · **English**

# Web pattern catalog

The PC/mobile editor provides **519** complete named patterns from Stephen Silver's *Life Lexicon*, release 29. Source editors include Dave Greene and David Bell; the full contributor list and CC-BY-SA-3.0 notice are retained in [NOTICE.txt](../assets/patterns/NOTICE.txt), with the [license text](../assets/patterns/CC-BY-SA-3.0.txt). Application code remains MIT; the derived catalog data remains CC-BY-SA-3.0.

| Category | Count |
| --- | ---: |
| Spaceships | 50 |
| Oscillators | 188 |
| Continuing evolution | 78 |
| Transients and reactions | 105 |
| Extinguishing sparks | 18 |
| Still lifes | 80 |

Open the editor's catalog, search Chinese/common English names or characteristics, filter a category, and select a thumbnail. Loading creates one undo step; the selected board can then be edited, previewed or transmitted. The catalog is fetched only on first use, with 24 thumbnails per page. All required data, fonts and decoder assets are served locally by the website; source links are optional external references.

## Provenance and fitting

The reviewed source is [rokicki/lifecontent](https://github.com/rokicki/lifecontent/tree/19eeabbf84b94f6a53791774e4377e766e10c0c6), commit `19eeabbf84b94f6a53791774e4377e766e10c0c6`. Its single-page lexicon SHA-256 is `0e828cf69196ef1a98936ebb40c8791dd9da049f76c4b37386e7dd7389c930c8`. HTML is read by BeautifulSoup/html5lib, and actual pattern coordinates are parsed by the complete `ca-formats` 0.3.5 library rather than a custom format reader.

The generator considers the first diagram for each named entry. It rotates a whole pattern only when needed to fit 36×32, centers it, and never clips cells. It removes symmetry duplicates and periodic phase aliases. Behavior is measured with the production browser B3/S23 model on the actual 36×32 wraparound board, for up to 256 generations. Labels describe this bounded observation, not an infinite-world promise. The original source dimensions, name, source paragraph and reference remain in the JSON data.

The source produced 682 named diagrams; 519 satisfy the fitting, uniqueness and behavior filters. The generated [catalog.json](../assets/patterns/catalog.json) is mirrored to `site/public/patterns/`. Every entry contains its exact 144-byte bitmap, population, bounds and CRC. The website validates these before offering selection; corrupted files do not fall back to a different catalog.

## Rebuild and validate

See the [catalog tools](../tools/catalog/README.md) for the pinned source, dependency setup and commands. Normal builds use the tracked generated data and do not need Rust or a network download of the lexicon. `npm test --prefix site` checks the source identity, category counts, 200+ distinct patterns, 200+ non-still patterns, symmetry uniqueness, mirrored bytes and all 519 exact round trips through the production C acoustic receiver. Website font inventory includes every displayed catalog name and description.

Test PC and mobile search, category filtering, pagination, load/undo, gesture inspection, preview, JSON export and audio reception. Source catalog names are retained where no Chinese common name is provided.
