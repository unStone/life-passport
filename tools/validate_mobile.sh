#!/usr/bin/env bash
set -euo pipefail
mode="${1:---tests}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
case "${mode}" in --tests|--android|--ios|--all) ;; *) echo "Usage: $0 [--tests|--android|--ios|--all]" >&2; exit 2 ;; esac
cd "${repo_root}/mobile"
flutter --no-version-check --suppress-analytics pub get
flutter --no-version-check --suppress-analytics analyze --no-pub
flutter --no-version-check --suppress-analytics test --no-pub
if [[ "${mode}" == --android || "${mode}" == --all ]]; then
    flutter --no-version-check --suppress-analytics build apk --release --no-pub
fi
if [[ "${mode}" == --ios || "${mode}" == --all ]]; then
    if [[ "$(uname -s)" != Darwin ]]; then
        echo "iOS builds require macOS and initialized Xcode." >&2
        exit 1
    fi
    xcodebuild -checkFirstLaunchStatus
    flutter --no-version-check --suppress-analytics build ios --simulator --debug --no-pub
    flutter --no-version-check --suppress-analytics build ios --release --no-codesign --no-pub
fi
