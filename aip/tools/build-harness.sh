#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
task_app="$task_root/aip/build/字醒原生面板测试.app"
mkdir -p "$task_app/Contents/MacOS" "$task_app/Contents/Resources/bin"
xcrun clang++ -std=c++17 -fobjc-arc -fblocks -mmacosx-version-min=13.0 \
 -Wno-nullability-completeness -Wno-incompatible-pointer-types \
 "$task_root/aip/src/PanelController.mm" "$task_root/aip/tests/PanelHarness.mm" \
 -framework Cocoa -framework WebKit -o "$task_app/Contents/MacOS/ZiXingPanelTest"
/usr/bin/ditto "$task_root/aip/resources" "$task_app/Contents/Resources"
/bin/cp "$task_root/extension/bin/TextReviveOCR" "$task_root/extension/bin/TextReviveMatch" "$task_app/Contents/Resources/bin/"
/bin/cp "$task_root/tests/selection.png" "$task_app/Contents/Resources/selection.png"
cat > "$task_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cool.suba.zixing.paneltest</string><key>CFBundleName</key><string>字醒原生面板测试</string>
<key>CFBundleExecutable</key><string>ZiXingPanelTest</string><key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
/usr/bin/xattr -dr com.apple.FinderInfo "$task_app" 2>/dev/null || true
/usr/bin/xattr -dr com.apple.ResourceFork "$task_app" 2>/dev/null || true
/usr/bin/codesign --force --sign - "$task_app"
echo "$task_app"
