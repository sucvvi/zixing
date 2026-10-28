#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
task_build=$(mktemp -d "${TMPDIR:-/tmp}/textrevive-build.XXXXXX")
trap 'rm -rf "$task_build"' EXIT
mkdir -p "$task_root/extension/bin"
for task_helper in TextReviveOCR TextReviveMatch; do
 for task_arch in arm64 x86_64; do
  xcrun swiftc -O -module-cache-path "$task_build/cache" -target "$task_arch-apple-macos13.0" \
    "$task_root/native/$task_helper.swift" -o "$task_build/$task_helper-$task_arch"
 done
 xcrun lipo -create "$task_build/$task_helper-arm64" "$task_build/$task_helper-x86_64" -output "$task_root/extension/bin/$task_helper"
 codesign --force --sign - "$task_root/extension/bin/$task_helper"
done
echo 'Universal OCR helper built.'
