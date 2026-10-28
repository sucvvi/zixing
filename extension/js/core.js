(function (root, factory) {
  // CEP exposes Node's module globals even inside a browser script tag.
  if (typeof window === 'object') window.ReviveCore = factory();
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviveCore = factory();
}(this, function () {
  'use strict';
  function toRect(line, bounds) {
    var w = bounds[2] - bounds[0], h = bounds[1] - bounds[3];
    ['x', 'y', 'width', 'height'].forEach(function (key) {
      if (typeof line[key] !== 'number' || !isFinite(line[key])) throw new Error('识别坐标无效');
    });
    if (line.width <= 0 || line.height <= 0 || line.x < -0.01 || line.y < -0.01 ||
        line.x + line.width > 1.01 || line.y + line.height > 1.01) throw new Error('识别坐标超出图片');
    return [bounds[0] + line.x * w, bounds[3] + (line.y + line.height) * h,
      line.width * w, line.height * h];
  }
  function validateLines(lines, bounds) {
    if (!lines.length) throw new Error('请至少保留一行文字');
    return lines.map(function (line) {
      if (!line.text || !line.text.replace(/\s/g, '')) throw new Error('文字不能为空');
      if (line.text.length > 2000 || /[\r\n\u0000]/.test(line.text)) throw new Error('每个识别框只能输入一行文字，最多 2000 字');
      if (Math.abs(line.angle || 0) > 3) throw new Error('本版只重建水平文字：请先把选区旋转到水平再识别');
      return { text: line.text, rect: toRect(line, bounds), confidence: line.confidence, font: line.font || '' };
    });
  }
  function chooseFont(line,candidates) {
    if (!candidates || !candidates.length) return '';
    var best=candidates[0],next=candidates[1];
    var separated=best.similarity>=0.62&&next&&best.similarity-next.similarity>=0.20;
    if (best.similarity<0.78&&!separated) return '';
    // Equivalent regional faces can share glyphs. Keep their candidates available;
    // do not turn a close tie into an empty result.
    return best.name;
  }
  return { toRect: toRect, validateLines: validateLines, chooseFont:chooseFont };
}));
