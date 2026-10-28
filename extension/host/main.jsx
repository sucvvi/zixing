/* 字醒 1.3.0. ES3 host code; no user content is evaluated as code. */
var TextRevive = (function () {
    var snapshot = null;
    function quote(s) {
        return '"' + String(s).replace(/["\\\x00-\x1f\u2028\u2029]/g, function (c) {
            var codes = {'"':'\\"', '\\':'\\\\', '\n':'\\n', '\r':'\\r', '\t':'\\t'};
            if (codes[c]) return codes[c];
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    function stringify(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return quote(v);
        if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
        if (typeof v === 'boolean') return String(v);
        var out = [], i;
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) out.push(stringify(v[i]));
            return '[' + out.join(',') + ']';
        }
        for (i in v) if (v.hasOwnProperty(i)) out.push(quote(i) + ':' + stringify(v[i]));
        return '{' + out.join(',') + '}';
    }
    function parse(text) {
        var pos = 0;
        function ws() { while (/\s/.test(text.charAt(pos)) && pos < text.length) pos++; }
        function value() {
            ws(); var c = text.charAt(pos++), out, key, ch, hex, m;
            if (c === '"') {
                out = '';
                while (pos < text.length) {
                    ch = text.charAt(pos++);
                    if (ch === '"') return out;
                    if (ch === '\\') {
                        ch = text.charAt(pos++);
                        if (ch === 'u') {
                            hex = text.substr(pos, 4);
                            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw Error('JSON Unicode 无效');
                            out += String.fromCharCode(parseInt(hex, 16)); pos += 4;
                        } else {
                            var escapes = {'"':'"', '\\':'\\', '/':'/', b:'\b', f:'\f', n:'\n', r:'\r', t:'\t'};
                            if (!escapes.hasOwnProperty(ch)) throw Error('JSON 转义无效');
                            out += escapes[ch];
                        }
                    } else { if (ch.charCodeAt(0) < 32) throw Error('JSON 控制字符无效'); out += ch; }
                }
                throw Error('JSON 字符串未结束');
            }
            if (c === '[' || c === '{') {
                out = c === '[' ? [] : {}; ws();
                var end = c === '[' ? ']' : '}';
                if (text.charAt(pos) === end) { pos++; return out; }
                while (true) {
                    if (c === '{') {
                        ws(); if (text.charAt(pos) !== '"') throw Error('JSON 键无效');
                        key = value();
                        if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw Error('JSON 键被拒绝');
                        ws(); if (text.charAt(pos++) !== ':') throw Error('JSON 缺少冒号');
                        out[key] = value();
                    } else out.push(value());
                    ws(); ch = text.charAt(pos++);
                    if (ch === end) return out;
                    if (ch !== ',') throw Error('JSON 缺少逗号');
                }
            }
            pos--;
            var rest = text.substr(pos);
            if (rest.substr(0, 4) === 'true') { pos += 4; return true; }
            if (rest.substr(0, 5) === 'false') { pos += 5; return false; }
            if (rest.substr(0, 4) === 'null') { pos += 4; return null; }
            m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
            if (m) { pos += m[0].length; return Number(m[0]); }
            throw Error('JSON 数据无效');
        }
        var result = value(); ws(); if (pos !== text.length) throw Error('JSON 尾部无效'); return result;
    }
    function paths(item, out) {
        var i;
        if (item.hidden || item.locked) throw Error('选区含隐藏或锁定对象，请只选中需要恢复的转曲文字。');
        if (item.typename === 'PathItem') {
            if (item.guides || item.clipping) throw Error('暂不支持参考线或剪切蒙版。');
            if (item.filled || item.stroked) out.push(item);
        } else if (item.typename === 'CompoundPathItem') {
            for (i = 0; i < item.pathItems.length; i++) paths(item.pathItems[i], out);
        } else if (item.typename === 'GroupItem') {
            if (item.clipped) throw Error('请先释放剪切蒙版后只选择文字。');
            for (i = 0; i < item.pageItems.length; i++) paths(item.pageItems[i], out);
        } else throw Error('请只选择转曲文字路径；选区不能包含图片、可编辑文字或其他对象。');
    }
    function fingerprint(items) {
        var list = [], h = 2166136261, i, j, k, s, p;
        for (i = 0; i < items.length; i++) paths(items[i], list);
        for (i = 0; i < list.length; i++) {
            p = list[i]; s = p.closed + ':' + p.pathPoints.length + ':' + p.opacity + ':' + p.filled + ':' + p.stroked + ':' + p.strokeWidth;
            for (j = 0; j < p.pathPoints.length; j++) {
                s += ';' + p.pathPoints[j].anchor.join(',') + ';' + p.pathPoints[j].leftDirection.join(',') + ';' + p.pathPoints[j].rightDirection.join(',');
            }
            for (k = 0; k < s.length; k++) { h = ((h << 5) - h + s.charCodeAt(k)) | 0; }
        }
        return String(h) + ':' + list.length;
    }
    function capture(p) {
        snapshot = null;
        if (!app.documents.length) throw Error('请先打开 Illustrator 文档。');
        var doc = app.activeDocument, sel = doc.selection, items = [], all = [], i, b;
        if (!sel || !sel.length || sel.typename === 'TextRange') throw Error('请用选择工具选中转曲文字。');
        for (i = 0; i < sel.length; i++) { items.push(sel[i]); paths(sel[i], all); }
        if (!all.length) throw Error('没有找到可见文字路径。');
        if (all.length > 12000) throw Error('选区路径过多，请分段识别。');
        var bounds = [1e12, -1e12, -1e12, 1e12], itemBounds = [];
        for (i = 0; i < items.length; i++) {
            b = items[i].visibleBounds;
            itemBounds.push([b[0], b[1], b[2], b[3]]);
            bounds[0] = Math.min(bounds[0], b[0]); bounds[1] = Math.max(bounds[1], b[1]);
            bounds[2] = Math.max(bounds[2], b[2]); bounds[3] = Math.min(bounds[3], b[3]);
        }
        var width = bounds[2] - bounds[0], height = bounds[1] - bounds[3];
        if (width < 0.1 || height < 0.1 || width > 16000 || height > 16000) throw Error('选区尺寸无效或过大，请缩小选区。');
        var pad = 6, frame = [bounds[0]-pad, bounds[1]+pad, bounds[2]+pad, bounds[3]-pad];
        var scale = Math.min(5, 4500 / Math.max(width + 2*pad, height + 2*pad));
        var tmp = null, output = new File(p.path), sig = fingerprint(items);
        if (!output.parent.exists) throw Error('临时文件夹不可用。');
        try {
            tmp = app.documents.add(DocumentColorSpace.RGB, width + 2*pad, height + 2*pad);
            tmp.artboards[0].artboardRect = frame;
            for (i = 0; i < items.length; i++) {
                var copy = items[i].duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
                b = copy.visibleBounds;
                // Illustrator rebases cross-document duplicates to the new artboard origin.
                copy.translate(itemBounds[i][0] - b[0], itemBounds[i][1] - b[1]);
            }
            var copies = [];
            for (i = 0; i < tmp.layers[0].pageItems.length; i++) {
                if (tmp.layers[0].pageItems[i].parent === tmp.layers[0]) paths(tmp.layers[0].pageItems[i], copies);
            }
            var black = new RGBColor(); black.red = black.green = black.blue = 0;
            for (i = 0; i < copies.length; i++) {
                if (copies[i].filled) copies[i].fillColor = black;
                if (copies[i].stroked) copies[i].strokeColor = black;
                copies[i].opacity = 100;
            }
            var opts = new ExportOptionsPNG24();
            opts.antiAliasing = true; opts.transparency = false; opts.artBoardClipping = true;
            opts.horizontalScale = opts.verticalScale = scale * 100;
            tmp.exportFile(output, ExportType.PNG24, opts);
        } finally {
            if (tmp) tmp.close(SaveOptions.DONOTSAVECHANGES);
            doc.activate(); doc.selection = null;
            for (i = 0; i < items.length; i++) items[i].selected = true;
        }
        if (!output.exists) throw Error('Illustrator 未能导出识别图片。');
        var token = String(new Date().getTime()) + '-' + Math.floor(Math.random()*1000000);
        snapshot = {doc:doc, items:items, paths:all, frame:frame, signature:sig, token:token};
        return {token:token, bounds:frame, count:items.length, path:output.fsName};
    }
    function fonts() {
        var out = [], i, f;
        for (i = 0; i < app.textFonts.length; i++) {
            f = app.textFonts[i]; out.push({name:f.name, family:f.family, style:f.style});
        }
        return out;
    }
    function inkBounds(tf) {
        var probe = tf.duplicate(), outlined = null, b;
        try { outlined = probe.createOutline(); b = outlined.visibleBounds; return [b[0], b[1], b[2], b[3]]; }
        finally { if (outlined) outlined.remove(); else { try { probe.remove(); } catch (_) {} } }
    }
    function lineStyle(rect) {
        var best = null, score = 1e30, i, b, dx, dy, d;
        for (i = 0; i < snapshot.paths.length; i++) {
            b = snapshot.paths[i].visibleBounds;
            dx = (b[0]+b[2])/2 - (rect[0]+rect[2]/2);
            dy = (b[1]+b[3])/2 - (rect[1]-rect[3]/2);
            d = dx*dx + dy*dy;
            if (d < score) { score = d; best = snapshot.paths[i]; }
        }
        return best;
    }
    function rebuild(p) {
        if (!snapshot || p.token !== snapshot.token) throw Error('识别记录已失效，请重新识别选区。');
        var doc = snapshot.doc, i, j;
        if (!app.documents.length || app.activeDocument !== doc) throw Error('请回到识别时的原文档。');
        if (fingerprint(snapshot.items) !== snapshot.signature) throw Error('原路径已发生变化，请重新识别。');
        if (!p.lines || !p.lines.length || p.lines.length > 500) throw Error('需要 1–500 行文字。');
        var lineFonts = [];
        var frame = snapshot.frame, output = [], layer = null, hidden = [];
        // Validate the entire request before mutating the document.
        for (i = 0; i < p.lines.length; i++) {
            var line = p.lines[i], r = line.rect;
            try { lineFonts.push(app.textFonts.getByName(line.font || p.font)); }
            catch (_) { throw Error('第 ' + (i+1) + ' 行所选字体不可用，请刷新字体列表。'); }
            if (typeof line.text !== 'string' || !line.text.replace(/\s/g,'') || line.text.length > 2000 || /[\r\n\x00]/.test(line.text)) throw Error('每个识别框必须是一行有效文字。');
            if (!r || r.length !== 4) throw Error('坐标格式无效。');
            for (j = 0; j < 4; j++) if (typeof r[j] !== 'number' || !isFinite(r[j])) throw Error('坐标无效。');
            if (r[2] < 0.05 || r[3] < 0.05 || r[0] < frame[0]-1 || r[1] > frame[1]+1 || r[0]+r[2] > frame[2]+1 || r[1]-r[3] < frame[3]-1) throw Error('文字框超出识别区域。');
        }
        try {
            layer = doc.layers.add(); layer.name = '字醒 · 可编辑文本';
            for (i = 0; i < p.lines.length; i++) {
                line = p.lines[i]; r = line.rect;
                var tf = layer.textFrames.add(); output.push(tf);
                tf.contents = line.text;
                tf.textRange.characterAttributes.textFont = lineFonts[i];
                tf.textRange.characterAttributes.size = 100;
                tf.textRange.characterAttributes.strokeWeight = 0;
                tf.textRange.characterAttributes.strokeColor = new NoColor();
                var style = lineStyle(r), color = style && style.filled ? style.fillColor : null;
                if (!color || color.typename === 'GradientColor' || color.typename === 'PatternColor') {
                    color = new RGBColor(); color.red = color.green = color.blue = 0;
                }
                tf.textRange.characterAttributes.fillColor = color;
                if (style) tf.opacity = style.opacity;
                tf.position = [r[0], r[1]];
                var b = inkBounds(tf), w = b[2]-b[0], h = b[1]-b[3];
                if (w <= 0 || h <= 0) throw Error('字体无法生成可测量字形，请选择支持这些文字的字体。');
                var sy = r[3]/h*100, sx = r[2]/w*100;
                if (sy < 0.1 || sy > 10000 || sx/sy < 0.1 || sx/sy > 10) throw Error('文字尺寸比例异常，请校对内容或更换字体。');
                tf.resize(sx, sy, true, true, true, true, 100);
                b = inkBounds(tf); tf.translate(r[0]-b[0], r[1]-b[1]);
                tf.name = '复活 · ' + line.text.substr(0, 30);
                tf.note = '字醒 1.3.0; OCR 重建；字体可编辑。';
            }
            if (p.hideOriginals) {
                for (i = 0; i < snapshot.items.length; i++) {
                    hidden.push({item:snapshot.items[i], value:snapshot.items[i].hidden});
                    snapshot.items[i].hidden = true;
                }
            }
            doc.selection = null;
            for (i = 0; i < output.length; i++) output[i].selected = true;
            app.redraw();
        } catch (e) {
            for (i = 0; i < hidden.length; i++) { try { hidden[i].item.hidden = hidden[i].value; } catch (_) {} }
            if (layer) { try { layer.remove(); } catch (_) {} }
            throw e;
        }
        var count = output.length; snapshot = null;
        return {count:count};
    }
    function mergeText() {
        if (!app.documents.length) throw Error('请先打开 Illustrator 文档。');
        var doc = app.activeDocument, selection = doc.selection, originalSelection = [], frames = [], i, j, total = 0;
        if (!selection || !selection.length || selection.typename === 'TextRange') throw Error('请用选择工具选中至少两个可编辑文本框。');
        function collect(item) {
            if (item.hidden || item.locked || item.editable === false) throw Error('选区含隐藏或锁定对象，请先解锁。');
            var n;
            if (item.typename === 'GroupItem' && !item.clipped) {
                for (n = 0; n < item.pageItems.length; n++) if (item.pageItems[n].parent === item) collect(item.pageItems[n]);
            } else if (item.typename === 'TextFrame') {
                for (n = 0; n < frames.length; n++) if (frames[n] === item) return;
                frames.push(item);
            } else throw Error('请只选择可编辑文本框，不能包含转曲路径、图片或蒙版。');
        }
        for (i = 0; i < selection.length; i++) { originalSelection.push(selection[i]); collect(selection[i]); }
        if (frames.length < 2 || frames.length > 200) throw Error('每次请选择 2–200 个可编辑文本框。');
        var records = [], opacity = frames[0].opacity, mode = frames[0].blendingMode;
        // Validate every source before creating output or hiding anything.
        for (i = 0; i < frames.length; i++) {
            var tf = frames[i], ancestor = tf.parent;
            while (ancestor && ancestor !== doc) {
                if (ancestor.locked || ancestor.hidden || ancestor.visible === false) throw Error('文字所在图层或编组不可编辑，请先解锁并显示。');
                ancestor = ancestor.parent;
            }
            if (tf.kind === TextType.PATHTEXT || tf.orientation !== TextOrientation.HORIZONTAL) throw Error('合并暂只支持水平文字，不支持路径文字或竖排文字。');
            if (tf.kind === TextType.AREATEXT && (tf.nextFrame || tf.previousFrame)) throw Error('选区包含串接文本，请先解除文本框串接后再合并。');
            var m = tf.matrix;
            if (Math.abs(m.mValueB) > 0.001 || Math.abs(m.mValueC) > 0.001 || m.mValueA <= 0 || m.mValueD <= 0) throw Error('请先将旋转、倾斜或镜像文字调整为水平后再合并。');
            if (tf.opacity !== opacity || tf.blendingMode !== mode) throw Error('选中文本框的不透明度或混合模式不同，请先统一后合并。');
            var text = tf.contents, b = tf.geometricBounds;
            if (!text || !text.replace(/\s/g, '')) throw Error('选区含空文本框，请取消选择空框后再合并。');
            total += text.length;
            if (total > 50000) throw Error('合并文字过多，请分段处理，每次最多 50000 字符。');
            var size = tf.characters[0].characterAttributes.size;
            var baseline = tf.kind === TextType.POINTTEXT ? tf.anchor[1] : b[1]-size*0.8, lastBaseline = baseline;
            for (j = 1; j < tf.lines.length; j++) {
                var lineAttrs = tf.lines[j].characterAttributes, lineLeading = lineAttrs.leading;
                if (lineAttrs.autoLeading !== false || typeof lineLeading !== 'number' || !isFinite(lineLeading)) lineLeading = tf.lines[j].characters[0].characterAttributes.size*1.2;
                lastBaseline -= lineLeading;
            }
            records.push({frame:tf, text:text, left:b[0], right:b[2], height:Math.max(1,b[1]-b[3]), size:size,
                baseline:baseline, lastBaseline:lastBaseline, index:i});
        }
        records.sort(function(a,b){return b.baseline-a.baseline || a.left-b.left || a.index-b.index;});
        var rows = [];
        for (i = 0; i < records.length; i++) {
            var rec = records[i], row = null;
            for (j = 0; j < rows.length; j++) {
                if (Math.abs(rec.baseline-rows[j].baseline) <= Math.max(1,Math.min(rec.height,rows[j].height)*0.3)) { row = rows[j]; break; }
            }
            if (!row) { row = {baseline:rec.baseline,height:rec.height,bottomBaseline:rec.lastBaseline,items:[]}; rows.push(row); }
            row.items.push(rec); row.bottomBaseline = Math.min(row.bottomBaseline,rec.lastBaseline);
        }
        rows.sort(function(a,b){return b.baseline-a.baseline;});
        var plan = [], expected = '';
        for (i = 0; i < rows.length; i++) {
            rows[i].items.sort(function(a,b){return a.left-b.left || a.index-b.index;});
            for (j = 0; j < rows[i].items.length; j++) {
                rec = rows[i].items[j]; var sep = '';
                if (plan.length && !/[\r\n\x03]$/.test(expected) && !/^[\r\n\x03]/.test(rec.text)) {
                    if (j === 0) sep = '\r';
                    else {
                        var prev = rows[i].items[j-1];
                        if (rec.left-prev.right > Math.min(prev.size,rec.size)*0.12 && /[A-Za-z0-9,;:!?]$/.test(expected) && /^[A-Za-z0-9]/.test(rec.text)) sep = ' ';
                    }
                }
                if (j === 0) rows[i].paragraphIndex = ((expected+sep).match(/\r/g)||[]).length;
                plan.push({record:rec,separator:sep}); expected += sep + rec.text;
            }
        }
        var layer = null, merged = null, hidden = [];
        try {
            layer = doc.layers.add(); layer.name = '字醒 · 合并文本';
            merged = layer.textFrames.add(); merged.opacity = opacity; merged.blendingMode = mode;
            for (i = 0; i < plan.length; i++) {
                if (plan[i].separator) merged.characters.add(plan[i].separator);
                plan[i].record.frame.textRange.duplicate(merged.textRange, ElementPlacement.PLACEATEND);
            }
            if (merged.contents !== expected) throw Error('合并内容校验未通过，原文本保持不变。');
            merged.translate(rows[0].items[0].left-merged.anchor[0], rows[0].baseline-merged.anchor[1]);
            // Preserve internal paragraph styles and set only the boundary between source rows.
            for (i = 0; i < rows.length; i++) {
                var paragraph = merged.paragraphs[rows[i].paragraphIndex];
                paragraph.paragraphAttributes.leftIndent = rows[i].items[0].left-rows[0].items[0].left;
                if (i > 0) {
                    var leading = rows[i-1].bottomBaseline-rows[i].baseline;
                    if (leading > 0 && leading <= 1296) {
                        paragraph.characterAttributes.autoLeading = false;
                        paragraph.characterAttributes.leading = leading;
                    }
                }
            }
            merged.name = '字醒 · 合并 ' + frames.length + ' 个文本框';
            merged.note = '字醒 1.3.0; 合并文本；原框已隐藏保留。';
            for (i = 0; i < frames.length; i++) { hidden.push(frames[i]); frames[i].hidden = true; }
            doc.selection = null; merged.selected = true; app.redraw();
        } catch (e) {
            for (i = 0; i < hidden.length; i++) { try { hidden[i].hidden = false; } catch (_) {} }
            if (layer) { try { layer.remove(); } catch (_) {} }
            try { doc.selection = null; for (i = 0; i < originalSelection.length; i++) originalSelection[i].selected = true; } catch (_) {}
            throw e;
        }
        snapshot = null;
        return {count:frames.length, rows:rows.length};
    }
    function dispatch(action, encoded) {
        try {
            var p = parse(decodeURIComponent(encoded || '%7B%7D')), result;
            if (action === 'capture') result = capture(p);
            else if (action === 'fonts') result = fonts();
            else if (action === 'rebuild') result = rebuild(p);
            else if (action === 'mergeText') result = mergeText();
            else if (action === 'ping') result = {version:app.version, name:app.name};
            else throw Error('未知操作');
            return stringify({ok:true, data:result});
        } catch (e) { return stringify({ok:false, error:String(e.message || e)}); }
    }
    return {dispatch:dispatch};
}());
