#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
task_sdk="${1:-/private/tmp/zixing-ai-sdk/Adobe Illustrator 2026 SDK}"
if [[ ! -f "$task_sdk/illustratorapi/illustrator/AIMenu.h" ]]; then
 echo '缺少 Adobe 官方 Illustrator 2026 Mac SDK。请把已解压的 SDK 根目录作为第一个参数。' >&2; exit 1
fi
task_output="$task_root/aip/build/字醒.aip"
task_stage=$(mktemp -d "${TMPDIR:-/tmp}/zixing-aip-build.XXXXXX")
trap 'rm -rf "$task_stage"' EXIT
task_bundle="$task_stage/字醒.aip"
mkdir -p "$task_bundle/Contents/MacOS" "$task_bundle/Contents/Resources/bin" "$task_bundle/Contents/Resources/pipl"
task_includes=()
while IFS= read -r task_dir; do task_includes+=("-I$task_dir"); done < <(python3 - "$task_sdk" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
dirs=sorted({str(p.parent) for p in (root/'illustratorapi').rglob('*.h')})
print('\n'.join(dirs))
PY
)
for task_arch in arm64 x86_64; do
 xcrun clang++ -std=c++17 -arch "$task_arch" -mmacosx-version-min=13.0 -DMAC_ENV=1 -DAI_AUTO_SUITE_AVAILABLE=0 \
  -fobjc-arc -fblocks -fvisibility=hidden -Wno-nullability-completeness -Wno-incompatible-pointer-types -Wno-deprecated-declarations \
  "${task_includes[@]}" -bundle \
  "$task_root/aip/src/PluginMain.mm" "$task_root/aip/src/PanelController.mm" "$task_root/aip/src/HostScriptBridge.mm" \
  "$task_sdk/illustratorapi/illustrator/IAIUnicodeString.cpp" \
  -framework Cocoa -framework WebKit -framework Carbon -o "$task_stage/ZiXing-$task_arch"
 xcrun clang++ -std=c++17 -arch "$task_arch" -mmacosx-version-min=13.0 -DZX_BRIDGE_HELPER=1 -fobjc-arc -fblocks -Wno-incompatible-pointer-types \
  "$task_root/aip/src/HostScriptBridge.mm" "$task_root/aip/src/HostHelperMain.mm" -framework Cocoa -o "$task_stage/ZiXingHost-$task_arch"
done
xcrun lipo -create "$task_stage/ZiXingHost-arm64" "$task_stage/ZiXingHost-x86_64" -output "$task_bundle/Contents/Resources/bin/ZiXingHost"
xcrun lipo -create "$task_stage/ZiXing-arm64" "$task_stage/ZiXing-x86_64" -output "$task_bundle/Contents/MacOS/ZiXing"
xcrun Rez -useDF -d 'PIPL_PLUGIN_NAME="ZiXing"' -d 'PIPL_ENTRY="PluginMain"' \
 -i "$task_sdk/samplecode/common/mac" \
 -o "$task_bundle/Contents/Resources/ZiXing.rsrc" "$task_sdk/samplecode/common/mac/Plugin.r"
printf 'ARPIART5' > "$task_bundle/Contents/PkgInfo"
(
 cd "$task_bundle/Contents/Resources/pipl"
 python3 "$task_sdk/tools/pipl/create_pipl.py" -input '[{"name":"ZiXing","entry_point":"PluginMain"}]'
)
/usr/bin/ditto --norsrc --noextattr "$task_root/aip/resources" "$task_bundle/Contents/Resources"
/bin/cp -X "$task_root/extension/bin/TextReviveOCR" "$task_root/extension/bin/TextReviveMatch" "$task_bundle/Contents/Resources/bin/"
cat > "$task_bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cool.suba.zixing.native</string><key>CFBundleName</key><string>字醒</string>
<key>CFBundleDisplayName</key><string>字醒</string><key>CFBundleExecutable</key><string>ZiXing</string>
<key>CFBundlePackageType</key><string>ARPI</string><key>CFBundleSignature</key><string>ART5</string>
<key>CFBundleVersion</key><string>2.0.0</string><key>CFBundleShortVersionString</key><string>2.0.0</string>
<key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
for task_helper in TextReviveOCR TextReviveMatch ZiXingHost; do /usr/bin/codesign --force --sign - "$task_bundle/Contents/Resources/bin/$task_helper"; done
/usr/bin/codesign --force --sign - "$task_bundle"
mkdir -p "$(dirname "$task_output")"
/usr/bin/ditto --norsrc --noextattr "$task_bundle" "$task_output"
/usr/bin/codesign --verify --deep --strict "$task_output"
xcrun lipo -info "$task_output/Contents/MacOS/ZiXing"
echo "$task_output"
