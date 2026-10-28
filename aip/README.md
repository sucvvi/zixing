# 字醒原生版 2.0.0

目标平台：macOS 13+，Illustrator 2026（30.x）。包含 arm64 / x86_64 两种架构；实际兼容范围以本目录验证报告为准。

## 安装

1. 保存文档并退出 Illustrator。
2. 将整个 `字醒.aip` 拖进 Illustrator 的 `Plug-ins`（中文 Finder 中可能显示为“增效工具”）文件夹，不要拆开包内容。
3. 重新启动 Illustrator，从“窗口 → 字醒”打开。旧 CEP 版的入口仍在“窗口 → 扩展功能 → 字醒”，两者不同。

如果应用程序目录要求管理员认证，由用户自己完成认证。也可把 `.aip` 放在自选文件夹，通过 Illustrator“首选项 → 增效工具和暂存盘 → 其他增效工具文件夹”指定该目录，然后重启。避免在多个扫描目录重复放置同一插件。

## 功能

选中转曲文字后进行本机 OCR 和字体匹配，校对并恢复为可编辑文字；选中多个可编辑文本框可合并为一个多行文本对象。原路径及合并前文本保留。仍需安装原字体，不能保证还原未安装或缺字的字体。

## 分发说明

Mac Finder 将 `.aip` 包显示为一个项目。内部已经包含面板和三个 Universal 辅助程序，不需要另装 CEP 扩展、Node.js、Python 或 Xcode，不需要开启 CEP 未签名扩展调试设置。

当前包采用本地 ad-hoc 签名，不是 Apple Developer ID 签名，也尚未公证。其他 Mac 通过网络接收后可能受 Gatekeeper 限制；不能把本机测试通过等同于所有 Mac 无提示安装。公开发布前应完成 Developer ID 签名、公证及干净机器的下载安装验证。

## 开发

官方 SDK：Adobe Illustrator 2026 Mac SDK 30.8.114（Aug 2026），单独从 Adobe Developer Console 获取；SDK 本身不随成品分发。

执行 `bash aip/tools/build-aip.sh "SDK 根目录"` 构建 Universal 包。面板使用 Cocoa / WebKit，注册菜单使用 Illustrator SDK；文档操作由包内 ZiXingHost 辅助程序，通过 Illustrator 已公开的 do-javascript Apple Event 请求父进程执行。无 osascript、HTTP 服务或 CEP 依赖。本机 Illustrator 30.8.2 已完成两轮识别、恢复、合并实测；最终构建还完成对象级核验和样稿保存。
