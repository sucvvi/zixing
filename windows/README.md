# 字醒 Windows 原生测试版

版本：2.1.0-beta2，Windows x64。当前为跨平台构建产物，尚未在 Windows Illustrator 中加载和操作验证，不能作为已验证的正式发行版。

## 兼容目标

- Windows 10/11 x64。
- Illustrator 2020–2026（24–30）。使用官方 Illustrator 2020 SDK；仅申请启动、菜单、Unicode 等基础接口，通过活动 Illustrator 的 COM 接口执行文档操作。这个设计用于争取旧版兼容，但不构成兼容性实测结论。
- 更早的 Illustrator、Windows ARM64、32 位 Windows 不在本测试版目标内。
- 需要 .NET Framework 4.8 和 Microsoft Edge WebView2 Evergreen Runtime。插件不会自动联网下载组件。
- 通过“窗口 → 字醒”打开独立浮动窗口，暂不支持停靠到 Illustrator 侧边栏。

## beta2 启动修订

beta1 收到 Illustrator 启动时“检测到插件问题”的反馈；完整宿主版本仍待提供，不能把原因断定为缺少 WebView2。beta2 移除旧 UnicodeString v8 与 Blocks 套件、跨模块 C++ 字符串和启动阶段的面板创建，仅以 C 类型注册菜单；错误阶段记录到 `%LOCALAPPDATA%\ZiXing\startup.log`。

## 构建

首选在 Windows x64 的 Visual Studio 2022 开发者命令行执行 `python windows/tools/build-windows.py`，以 Microsoft 编译器和静态 /MT 运行库构建。官方 WebView2 SDK 1.0.4314.35 和 OCR 构建资源从固定官方地址获取，并校验 SHA256；需要 .NET Framework 4.8 参考程序集。SDK 不随仓库分发。

引导层采用最小 C 接口视图 `BootstrapAbi.h`，不包含 Adobe SDK 实现；`tests/sdk-abi-check.cpp` 在本地单独使用官方 2020 SDK 验证消息布局、菜单函数位置及套件版本。现代 MSVC 构建不需要附带 SDK。macOS 交叉构建执行 `python3 windows/tools/build-cross.py --sdk '官方 SDK 根目录'`，Windows 引导层不链接 CRT DLL。

`.github/workflows/windows-build.yml` 用 Windows Server 2022 执行 MSVC 编译及 DLL 真实加载检查。`loader-smoke.cpp` 使用模拟菜单宿主验证入口、注册、驻留、重载和面板资源，不能替代在 Illustrator 中的测试。构建通过后的 ZIP 作为 Actions 产物提供，尚不自动发布正式版。

## 结构与边界

- `.aip` 内嵌 `ZiXingPanel.exe`；后者内嵌网页、ExtendScript、OCR 模型、WebView2 加载器和许可文件。每次从自身资源重写辅助程序，不直接执行旧缓存。
- 首次打开解包到 `%LOCALAPPDATA%\ZiXing\2.1.0-beta2\<hash>`。WebView2 缓存在同一产品目录下；选区 PNG 使用临时的 `zixing-<随机标识>` 目录。
- UI 禁止外部导航和外部网页请求；OCR 与字体比较在本机完成。WebView2 Evergreen 本身的更新由微软运行库管理。
- 文档操作只连接已运行的 Illustrator，并核对启动宿主的版本和安装路径。全局脚本引擎维持捕获令牌，恢复文字与合并文本复用现有宿主逻辑。
- Windows 字体匹配使用 GDI/GDI+，根据实际字体的 PostScript 名称匹配 Illustrator 字体列表；读不到的字体会跳过，不使用系统替代字体冒充。无法保证识别艺术字体或找回未安装的原字体。
- 本版 OCR 与 macOS 的 Apple Vision 实现不同。真实离线样例中普通中英文两行识别正确，艺术字体一行误读；原始观察记录在 `tests/offline-ocr-observed.json`。

## 尚缺的发行门槛

在 Windows 实机上完成加载、WebView2 本地资源映射、COM 文档连接、GDI 字体枚举与匹配、恢复、合并、撤销、重启清理的验证；逐版记录 Illustrator 2020–2026 的结果。当前没有这些结果，不应写为“已兼容所有版本”。
