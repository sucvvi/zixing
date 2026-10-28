# 字醒 Windows 原生测试版

版本：2.1.0-beta1，Windows x64。当前为跨平台构建产物，尚未在 Windows Illustrator 中加载和操作验证，不能作为已验证的正式发行版。

## 兼容目标

- Windows 10/11 x64。
- Illustrator 2020–2026（24–30）。使用官方 Illustrator 2020 SDK；仅申请启动、菜单、Unicode 等基础接口，通过活动 Illustrator 的 COM 接口执行文档操作。这个设计用于争取旧版兼容，但不构成兼容性实测结论。
- 更早的 Illustrator、Windows ARM64、32 位 Windows 不在本测试版目标内。
- 需要 .NET Framework 4.8 和 Microsoft Edge WebView2 Evergreen Runtime。插件不会自动联网下载组件。
- 通过“窗口 → 字醒”打开独立浮动窗口，暂不支持停靠到 Illustrator 侧边栏。

## 构建

`tools/build-cross.py` 在 macOS 使用 LLVM-MinGW 编译 Windows x64 DLL，并用 Microsoft Roslyn + .NET Framework 4.8 参考程序集编译辅助窗口。生成物是 PE32+ `.aip`，不是 macOS 文件改后缀。

官方工具和 SDK 需分别获取；Adobe SDK 不随项目分享包分发。默认工具缓存 `/private/tmp/zixing-win-tools`：

| 内容 | 此次构建版本 / 路径 |
| --- | --- |
| Adobe SDK | Illustrator 2020 Windows SDK v3 Aug 2020，`sdk2020/Adobe Illustrator 2020 SDK` |
| LLVM-MinGW | `llvm-mingw-20261020-ucrt-macos-universal` |
| .NET SDK / Roslyn | 8.0.427，`dotnet/`；仅用于构建 |
| .NET Framework 参考程序集 | Microsoft.NETFramework.ReferenceAssemblies.net48 1.0.3，`net48/` |
| WebView2 SDK | Microsoft.Web.WebView2 1.0.4314.35，`webview2/` |
| OCR | Tesseract.js / core 5.1.1，离线资源在 `resources/web/ocr/` |
| 模型 | 官方 tessdata_fast，commit 见 `resources/OCR-MODELS.txt` |

先运行 `python3 windows/tools/fetch-ocr-assets.py` 获取并校验固定版本的 OCR 资源。

在项目根目录执行：

```sh
python3 windows/tools/build-cross.py --tools /private/tmp/zixing-win-tools --sdk '/private/tmp/zixing-win-tools/sdk2020/Adobe Illustrator 2020 SDK'
python3 windows/tests/verify-package.py
node --test tests/core.test.cjs tests/panel.test.cjs tests/merge-host.test.cjs aip/tests/runtime.test.cjs windows/tests/runtime.test.cjs
```

构建输出 `windows/build/字醒.aip`，以及资源哈希清单与 PE 检查记录。SDK 的旧版 UTF-16 字符串适配在 `LegacyU16Traits.h`；MinGW 与 Illustrator 的实际接口兼容性仍须实机核验。

## 结构与边界

- `.aip` 内嵌 `ZiXingPanel.exe`；后者内嵌网页、ExtendScript、OCR 模型、WebView2 加载器和许可文件。每次从自身资源重写辅助程序，不直接执行旧缓存。
- 首次打开解包到 `%LOCALAPPDATA%\ZiXing\2.1.0-beta1\<hash>`。WebView2 缓存在同一产品目录下；选区 PNG 使用临时的 `zixing-<随机标识>` 目录。
- UI 禁止外部导航和外部网页请求；OCR 与字体比较在本机完成。WebView2 Evergreen 本身的更新由微软运行库管理。
- 文档操作只连接已运行的 Illustrator，并核对启动宿主的版本和安装路径。全局脚本引擎维持捕获令牌，恢复文字与合并文本复用现有宿主逻辑。
- Windows 字体匹配使用 GDI/GDI+，根据实际字体的 PostScript 名称匹配 Illustrator 字体列表；读不到的字体会跳过，不使用系统替代字体冒充。无法保证识别艺术字体或找回未安装的原字体。
- 本版 OCR 与 macOS 的 Apple Vision 实现不同。真实离线样例中普通中英文两行识别正确，艺术字体一行误读；原始观察记录在 `tests/offline-ocr-observed.json`。

## 尚缺的发行门槛

在 Windows 实机上完成加载、WebView2 本地资源映射、COM 文档连接、GDI 字体枚举与匹配、恢复、合并、撤销、重启清理的验证；逐版记录 Illustrator 2020–2026 的结果。当前没有这些结果，不应写为“已兼容所有版本”。
