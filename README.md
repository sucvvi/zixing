# 字醒 · ZiXing

**简体中文** | [English](README.en.md)

把 Illustrator 中已经转曲的文字恢复为可编辑文字，并把多个文本框合并为一个。

字醒先在本机识别文字，再把原字形与本机字体进行比较。校对内容、选择字体后，可以重新编辑文字和更换字体。原转曲对象与合并前文本会保留，方便找回。

> 转曲会丢失原文字和字体信息。字醒提供识别与候选匹配，不能保证准确还原原字体；原字体未安装、艺术字或变形文字尤其需要人工校对。

## 功能截图

以下截图来自 **macOS 原生版 2.0.0 / Illustrator 30.8.2**，使用专门的演示稿实测截取。界面目前为中文；这些截图不代表 Windows 版已经通过实机验证。

### 识别文字、校对内容与比较字体

识别后，每行内容都可以修改，也可以单独勾选需要恢复的行。展开“对照 / 更换字体”，可查看原稿与候选字形：**上方为原稿，下方为候选**，并可手动选择本机字体。字体候选需要人工核对。

<p>
  <img src="docs/images/recognize.jpg" alt="字醒识别结果：三行文字可分别校对并选择字体" width="340">
  <img src="docs/images/font-compare.jpg" alt="字形对照：上方是原稿，下方是候选字体，可展开更换字体" width="340">
</p>

### 恢复可编辑文字，合并多个文本框

恢复后，文字可以继续编辑和更换字体。选中多个可编辑文本框后，点击“合并选中文本”，会按位置合并并保留换行与字符样式；原文本会隐藏保留。下图为演示中三个恢复后的文本框合并成一个对象的结果，三行使用不同字体。

<img src="docs/images/editable-result.jpg" alt="Illustrator 中合并后的单个可编辑文本对象，三行仍保留各自的字体" width="960">

<details>
<summary>查看文本合并完成提示</summary>

<p><img src="docs/images/merge-text.jpg" alt="字醒提示：已将三个文本框合并为一个，原文本已隐藏保留" width="340"></p>
</details>

## 下载

**Windows 测试状态：** beta2 已有用户确认可正常启动。beta3 修订中文菜单编码和字体候选比较，并通过 [Windows 加载、菜单与字体回归](https://github.com/sucvvi/zixing/actions/runs/40827243277)。请下载 beta3 测试版复测实际稿件；20 组系统字体 / 字距样例的首选命中数由 17 提升到 20，这个小样本不代表通用准确率。

请从 [Releases](https://github.com/sucvvi/zixing/releases) 下载对应系统的安装包，源码 ZIP 不能直接安装。

| 版本 | 适用范围与验证状态 | 下载 |
| --- | --- | --- |
| macOS 2.0.0 | macOS 13+，Universal arm64 / x86_64；已在 Apple Silicon、Illustrator 2026 30.8.2 实测识别、恢复与合并；其他机器和 Intel Mac 未实测 | [Mac 安装包](https://github.com/sucvvi/zixing/releases/tag/v2.0.0-macos) |
| Windows 2.1.0-beta3 | Windows 10/11 x64；以 Illustrator 2020–2026 为兼容目标；**beta3 真实稿件复测待完成，未逐版验证 Illustrator 兼容性** | [Windows 测试包](https://github.com/sucvvi/zixing/releases/tag/v2.1.0-beta3-windows) |

Mac 包采用本地 ad-hoc 签名，尚未 Developer ID 签名或公证，下载后可能受 Gatekeeper 限制。Windows 包未商业签名，仍是供实机验证的测试版。不要为运行插件关闭安全软件；先在测试稿副本中使用。

## 安装与使用

1. 保存工作，退出 Illustrator。
2. 解压对应系统的发行包，将其中的 `字醒.aip` 放入该 Illustrator 的 `Plug-ins`（增效工具）文件夹。Mac 需要复制整个 `.aip` 包。
3. 重启 Illustrator，从 **窗口 → 字醒** 打开。
4. 选中转曲文字，点击“识别选中文字”，校对内容并选择候选字体，再恢复为可编辑文字。字体比较进度显示在顶部。
5. 如需合并，选中多个可编辑文本框，点击“合并选中文本”。

Windows 版需安装 **.NET Framework 4.8** 和 **Microsoft Edge WebView2 Evergreen Runtime**，使用独立浮动窗口。详细步骤、运行库链接与测试样稿随 Windows 包提供。

恢复效果取决于文字内容、选区、字形变形以及本机字体。Windows 采用本地 Tesseract OCR，Mac 采用 Apple Vision；两者识别效果不同。Windows 实际离线样例中普通中英文两行正确，艺术字体一行出现明显误读，需先手动更正内容。

## 源码结构

| 目录 | 内容 |
| --- | --- |
| `aip/` | macOS 原生插件、WebKit 面板和宿主桥接 |
| `native/` | macOS 本机识别与字体匹配辅助程序 |
| `windows/` | Windows 原生插件、WebView2 窗口、离线 OCR 接口与字体比较 |
| `extension/` | 早期 CEP 版的源码及共用逻辑；不是当前原生版安装入口 |
| `tests/` | 可公开的核心逻辑与宿主模拟测试 |

仓库不包含 Adobe SDK、商业字体、用户设计稿、本机字体清单或临时构建文件。发行包在 Releases 单独提供。

## 开发与检查

Adobe SDK 需开发者自行从 Adobe Developer Console 获取并遵守其条款，不随仓库分发。

Mac：先运行 `bash tools/build.sh` 编译辅助程序，再运行 `bash aip/tools/build-aip.sh 'SDK 根目录'`。需要 Xcode 命令行工具和 Illustrator 2026 Mac SDK。详见 [Mac 开发说明](aip/README.md)。

Windows：先执行 `python3 windows/tools/fetch-ocr-assets.py` 下载固定版本并校验哈希的 OCR 构建资源，再按 [Windows 开发说明](windows/README.md) 准备 Windows 微软编译工具；官方 SDK 仅用于可选的接口布局核对。发行包已内嵌 OCR 资源，使用时无需下载模型。

不依赖 Illustrator 的 JavaScript 检查：

```sh
node --test tests/core.test.cjs tests/panel.test.cjs tests/merge-host.test.cjs aip/tests/runtime.test.cjs windows/tests/runtime.test.cjs
```

Windows 仍需补齐真实宿主加载、字体枚举、恢复、合并与撤销的实机验证，详见 [Windows 验证报告](windows/验证报告.md)。自动化和模拟检查通过不等于已通过 Illustrator 实测。

## 反馈

欢迎在 [Issues](https://github.com/sucvvi/zixing/issues) 提交问题，并附系统版本、Illustrator 完整版本、字醒版本、操作步骤和错误截图。请只提供可公开的测试稿，不要上传客户或其他敏感文件。

第三方依赖许可见 `windows/resources/licenses/`，发行包也保留相关许可说明。
