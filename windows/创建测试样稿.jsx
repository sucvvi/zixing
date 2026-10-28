#target illustrator
(function () {
    // Explicitly creates a new, unsaved test document. Existing documents are not edited.
    var doc = app.documents.add(DocumentColorSpace.RGB, 900, 700);
    function font(names) {
        for (var i = 0; i < names.length; i++) {
            try { return app.textFonts.getByName(names[i]); } catch (ignore) {}
        }
        return app.textFonts[0];
    }
    var chinese = font(['MicrosoftYaHei', 'SimSun', 'SimHei']);
    var latin = font(['Arial-BoldMT', 'ArialMT', 'Arial']);
    function line(text, x, y, face, size) {
        var item = doc.textFrames.add();
        item.contents = text;
        item.position = [x, y];
        item.textRange.characterAttributes.textFont = face;
        item.textRange.characterAttributes.size = size;
        return item;
    }
    line('字醒 Windows 测试稿（仅新建文档）', 45, 650, chinese, 20);
    var a = line('滚滚长江东逝水', 45, 550, chinese, 42).createOutline();
    var b = line('Editable Type 2026', 45, 460, latin, 38).createOutline();
    var c = line('修改字体 ABC 123', 45, 370, chinese, 36).createOutline();
    line('下方三个文本框用于合并测试：', 45, 260, chinese, 18);
    line('第一行：合并文本', 45, 210, chinese, 24);
    line('第二行：保留换行', 45, 165, chinese, 24);
    line('第三行：ABC 123', 45, 120, latin, 24);
    doc.selection = null;
    a.selected = b.selected = c.selected = true;
    alert('测试稿已新建。顶部三行已转曲并选中，可打开字醒测试识别。\n下方三个文本框用于合并测试。原有文档未改动。');
}());
