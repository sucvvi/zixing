import Foundation
import CoreText
import CoreGraphics
import ImageIO

struct MatchLine: Decodable { let text: String; let x: Double; let y: Double; let width: Double; let height: Double }
struct MatchInput: Decodable { let image: String; let fonts: [String]; let lines: [MatchLine] }
struct Candidate: Codable { let name: String; let similarity: Double; let preview: String }
struct MatchRow: Codable { let index: Int; let candidates: [Candidate]; let compared: Int; let original: String; let warning: String? }
struct MatchOutput: Codable { let type: String; let ok: Bool; let rows: [MatchRow]; let requestedFonts: Int; let resolvedFonts: Int }
struct Mask { let pixels: [UInt8]; let width: Int; let height: Int }
struct GlyphRequest: Decodable { let image: String; let font: String; let lines: [MatchLine] }
struct GlyphLine: Encodable { let text: String; let confidence: Double; let x: Double; let y: Double; let width: Double; let height: Double; let angle: Double; let alternatives: [String]; let method: String; let stable: Bool; let preview: String }
struct GlyphResult: Encodable { let ok: Bool; let lines: [GlyphLine] }
func emit<T: Encodable>(_ value: T) {
    if let data = try? JSONEncoder().encode(value) { FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])) }
}
func fail(_ message: String) -> Never { FileHandle.standardError.write(Data((message + "\n").utf8)); exit(1) }
let space = CGColorSpaceCreateDeviceGray()
func bitmap(_ image: CGImage) -> Mask? {
    var data = [UInt8](repeating: 255, count: image.width * image.height)
    let ok = data.withUnsafeMutableBytes { bytes -> Bool in
        guard let ctx = CGContext(data: bytes.baseAddress, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width, space: space, bitmapInfo: 0) else { return false }
        ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: image.width, height: image.height))
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height)); return true
    }
    return ok ? Mask(pixels: data, width: image.width, height: image.height) : nil
}
func tight(_ mask: Mask) -> CGRect? {
    var left = mask.width, right = -1, top = mask.height, bottom = -1
    for y in 0..<mask.height { for x in 0..<mask.width where mask.pixels[y*mask.width+x] < 170 {
        left = min(left,x); right = max(right,x); top = min(top,y); bottom = max(bottom,y)
    }}
    guard right >= left, bottom >= top else { return nil }
    return CGRect(x: left, y: top, width: right-left+1, height: bottom-top+1)
}
func normalized(_ mask: Mask, rect: CGRect, width: Int, height: Int) -> Mask {
    var pixels = [UInt8](repeating: 255, count: width*height)
    // Four subpixel samples avoid rewarding font weight changes caused by nearest-neighbour scaling.
    for y in 0..<height { for x in 0..<width {
        var total = 0
        for oy in [0.25,0.75] { for ox in [0.25,0.75] {
            let sx = min(mask.width-1,max(0,Int(rect.minX + (Double(x)+ox)*rect.width/Double(width))))
            let sy = min(mask.height-1,max(0,Int(rect.minY + (Double(y)+oy)*rect.height/Double(height))))
            total += Int(mask.pixels[sy*mask.width+sx])
        }}
        pixels[y*width+x] = UInt8(total/4)
    }}
    return Mask(pixels: pixels, width: width, height: height)
}
func png(_ mask: Mask) -> String {
    guard let provider = CGDataProvider(data: Data(mask.pixels) as CFData),
          let image = CGImage(width: mask.width, height: mask.height, bitsPerComponent: 8, bitsPerPixel: 8,
            bytesPerRow: mask.width, space: space, bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider,
            decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return "" }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else { return "" }
    CGImageDestinationAddImage(destination,image,nil)
    guard CGImageDestinationFinalize(destination) else { return "" }
    return (data as Data).base64EncodedString()
}
func glyphPath(_ text: String, font: CTFont) -> CGPath? {
    let units = Array(text.utf16)
    var glyphs = [CGGlyph](repeating: 0, count: units.count)
    guard CTFontGetGlyphsForCharacters(font,units,&glyphs,units.count) else { return nil }
    let attrs: [NSAttributedString.Key:Any] = [NSAttributedString.Key(kCTFontAttributeName as String):font,
        NSAttributedString.Key(kCTLigatureAttributeName as String):0, NSAttributedString.Key(kCTKernAttributeName as String):0]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string:text,attributes:attrs))
    let path = CGMutablePath()
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let attributes = CTRunGetAttributes(run) as NSDictionary
        let actual = attributes[kCTFontAttributeName] as! CTFont
        // Never score a fallback font under a requested font's name.
        guard CTFontCopyPostScriptName(actual) == CTFontCopyPostScriptName(font) else { return nil }
        let count = CTRunGetGlyphCount(run)
        var rg = [CGGlyph](repeating:0,count:count), positions = [CGPoint](repeating:.zero,count:count)
        CTRunGetGlyphs(run,CFRange(location:0,length:0),&rg); CTRunGetPositions(run,CFRange(location:0,length:0),&positions)
        for i in 0..<count {
            if let g = CTFontCreatePathForGlyph(actual,rg[i],nil) {
                path.addPath(g,transform:CGAffineTransform(translationX:positions[i].x,y:positions[i].y))
            }
        }
    }
    return path.isEmpty ? nil : path
}
func render(_ path: CGPath, width: Int, height: Int) -> Mask? {
    let b = path.boundingBoxOfPath
    guard b.width > 0, b.height > 0 else { return nil }
    var data = [UInt8](repeating:255,count:width*height)
    let ok = data.withUnsafeMutableBytes { bytes -> Bool in
        guard let ctx = CGContext(data:bytes.baseAddress,width:width,height:height,bitsPerComponent:8,
            bytesPerRow:width,space:space,bitmapInfo:0) else { return false }
        ctx.setFillColor(gray:1,alpha:1);ctx.fill(CGRect(x:0,y:0,width:width,height:height))
        ctx.setShouldAntialias(true)
        ctx.scaleBy(x:CGFloat(width)/b.width,y:CGFloat(height)/b.height)
        ctx.translateBy(x:-b.minX,y:-b.minY)
        ctx.addPath(path);ctx.setFillColor(gray:0,alpha:1);ctx.fillPath();return true
    }
    return ok ? Mask(pixels:data,width:width,height:height) : nil
}
func similarity(_ a: Mask, _ b: Mask) -> Double {
    // Soft ink intersection-over-union, with a one-pixel alignment tolerance.
    var best = 0.0
    for dy in -1...1 { for dx in -1...1 {
        var intersection = 0, union = 0
        for y in 0..<a.height { for x in 0..<a.width {
            let ax = 255-Int(a.pixels[y*a.width+x]), bx = x+dx, by = y+dy
            let bv = bx >= 0 && bx < b.width && by >= 0 && by < b.height ? 255-Int(b.pixels[by*b.width+bx]) : 0
            intersection += min(ax,bv);union += max(ax,bv)
        }}
        if union > 0 { best = max(best,Double(intersection)/Double(union)) }
    }}
    return best
}
// A known font can decode ordinary, evenly spaced Chinese glyphs without relying on
// a natural-image OCR model. The alphabet is Unicode, never a phrase whitelist.
func recognizeGlyphs(_ request: GlyphRequest) throws -> GlyphResult {
    let font = CTFontCreateWithName(request.font as CFString,100,nil)
    guard CTFontCopyPostScriptName(font) as String == request.font else { throw NSError(domain:"Glyph",code:1,userInfo:[NSLocalizedDescriptionKey:"系统无法读取指定字体。"] ) }
    guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:request.image) as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil),let bitmap=bitmap(image) else { throw NSError(domain:"Glyph",code:2,userInfo:[NSLocalizedDescriptionKey:"无法读取选区图片。"] ) }
    struct Entry { let text:String; let full:Mask; let coarse:Mask; let aspect:Double; let glyphHeight:Double }
    var entries=[Entry]()
    let characters=(0x4E00...0x9FFF).map{UniChar($0)}
    var glyphs=[CGGlyph](repeating:0,count:characters.count)
    _ = CTFontGetGlyphsForCharacters(font,characters,&glyphs,characters.count)
    for i in characters.indices where glyphs[i] != 0 {
        autoreleasepool {
            if let p=CTFontCreatePathForGlyph(font,glyphs[i],nil),let full=render(p,width:32,height:48),let coarse=render(p,width:16,height:24) {
                let b=p.boundingBoxOfPath
                entries.append(Entry(text:String(UnicodeScalar(Int(characters[i]))!),full:full,coarse:coarse,aspect:b.width/b.height,glyphHeight:b.height))
            }
        }
    }
    func coarseScore(_ a:Mask,_ b:Mask)->Double {
        var intersection=0,union=0
        for i in a.pixels.indices { let av=255-Int(a.pixels[i]),bv=255-Int(b.pixels[i]);intersection+=min(av,bv);union+=max(av,bv) }
        return union>0 ? Double(intersection)/Double(union) : 0
    }
    // Locate whole rows directly from the exported vector raster. General OCR can
    // miss these fonts entirely or split a single row into incorrect fragments.
    var runs=[(Int,Int)](),start:Int?=nil
    for y in 0..<bitmap.height {
        var ink=0;for x in 0..<bitmap.width where bitmap.pixels[y*bitmap.width+x]<170 {ink+=1}
        if ink>1 {if start==nil {start=y}}
        else if let first=start {runs.append((first,y));start=nil}
    }
    if let first=start {runs.append((first,bitmap.height))}
    var merged=[(Int,Int)]();let gap=max(3,bitmap.height/70)
    for run in runs {if let last=merged.last,run.0-last.1<=gap {merged[merged.count-1]=(last.0,run.1)}else{merged.append(run)}}
    let heights=entries.map{$0.glyphHeight}.sorted(),medianHeight=heights.isEmpty ? 100:heights[heights.count/2]
    var advance=[CGSize.zero];let middleGlyph=[glyphs[0x4E2D-0x4E00]]
    _ = CTFontGetAdvancesForGlyphs(font,.horizontal,middleGlyph,&advance,1)
    let advanceWidth=max(1,advance[0].width)
    var detected=[MatchLine]()
    for band in merged where band.1-band.0>=3 {
        var left=bitmap.width,right=0
        for y in band.0..<band.1 {for x in 0..<bitmap.width where bitmap.pixels[y*bitmap.width+x]<170 {left=min(left,x);right=max(right,x+1)}}
        if right<=left {continue}
        let rect=CGRect(x:Double(left)/Double(bitmap.width),y:1-Double(band.1)/Double(bitmap.height),width:Double(right-left)/Double(bitmap.width),height:Double(band.1-band.0)/Double(bitmap.height))
        let overlap=request.lines.max{a,b in
            CGRect(x:a.x,y:a.y,width:a.width,height:a.height).intersection(rect).width < CGRect(x:b.x,y:b.y,width:b.width,height:b.height).intersection(rect).width
        }
        let seed=overlap?.text ?? ""
        let n=seed.unicodeScalars.filter{(0x4E00...0x9FFF).contains(Int($0.value))}.count
        let estimate=max(2,min(24,Int((Double(right-left)/Double(band.1-band.0)*medianHeight/advanceWidth).rounded())))
        detected.append(MatchLine(text:n>=2&&n<=24 ? seed:String(repeating:"字",count:estimate),x:rect.minX,y:rect.minY,width:rect.width,height:rect.height))
    }
    guard detected.count<=20 else {throw NSError(domain:"Glyph",code:3,userInfo:[NSLocalizedDescriptionKey:"指定字体辅助每次最多 20 行，请缩小选区。"])}
    var output=[GlyphLine]()
    for line in detected {
        let count=line.text.unicodeScalars.filter{(0x4E00...0x9FFF).contains(Int($0.value))}.count
        guard count>=2,count<=24 else {
            output.append(GlyphLine(text:line.text,confidence:0,x:line.x,y:line.y,width:line.width,height:line.height,angle:0,alternatives:[],method:"font-glyph-unavailable",stable:false,preview:""));continue
        }
        let x=max(0,Int(line.x*Double(image.width))),y=max(0,Int((1-line.y-line.height)*Double(image.height)))
        let right=min(image.width,Int(ceil((line.x+line.width)*Double(image.width)))),bottom=min(image.height,Int(ceil((1-line.y)*Double(image.height))))
        guard right>x,bottom>y else { continue }
        var data=[UInt8]();for ry in y..<bottom { data.append(contentsOf:bitmap.pixels[(ry*image.width+x)..<(ry*image.width+right)]) }
        let crop=Mask(pixels:data,width:right-x,height:bottom-y)
        guard let bounds=tight(crop) else {continue}
        let left=Int(bounds.minX),top=Int(bounds.minY),w=Int(bounds.width),h=Int(bounds.height)
        var projection=[Int](repeating:0,count:w)
        for cx in 0..<w {for cy in 0..<h where crop.pixels[(top+cy)*crop.width+left+cx]<170 {projection[cx]+=1}}
        var bestText=line.text,bestScore=0.0,bestMin=0.0,bestMargin=0.0
        for n in max(2,count-2)...min(24,count+2) {
            var cuts=[0]
            for k in 1..<n {
                let center=Double(k)*Double(w)/Double(n),radius=max(2,Int(Double(w)/Double(n)*0.23))
                let lo=max(cuts.last!+1,Int(center)-radius),hi=min(w-(n-k),Int(center)+radius)
                guard hi>=lo else {continue}
                var cut=lo,metric=Double.greatestFiniteMagnitude
                for xx in lo...hi {let m=Double(projection[xx])*3+abs(Double(xx)-center)*0.15;if m<metric {metric=m;cut=xx}}
                cuts.append(cut)
            }
            cuts.append(w);if cuts.count != n+1 {continue}
            var decoded="",scores=[Double](),margins=[Double](),debug=[String]()
            for k in 0..<n {
                let sw=cuts[k+1]-cuts[k];if sw<=0 {continue}
                var part=[UInt8]();for cy in 0..<h {part.append(contentsOf:crop.pixels[((top+cy)*crop.width+left+cuts[k])..<((top+cy)*crop.width+left+cuts[k+1])])}
                let segment=Mask(pixels:part,width:sw,height:h)
                guard let ink=tight(segment) else {continue}
                let target=normalized(segment,rect:ink,width:32,height:48),coarse=normalized(segment,rect:ink,width:16,height:24)
                var shortlist=[(Int,Double)]()
                for ei in entries.indices {
                    let score=coarseScore(coarse,entries[ei].coarse)
                    if shortlist.count<12 || score>shortlist.last!.1 {shortlist.append((ei,score));shortlist.sort{$0.1>$1.1};if shortlist.count>12 {shortlist.removeLast()}}
                }
                let ranked=shortlist.map{($0.0,similarity(target,entries[$0.0].full))}.sorted{$0.1>$1.1}
                debug.append(ranked.prefix(3).map{entries[$0.0].text+":"+String(format:"%.2f",$0.1)}.joined(separator:" "))
                if ranked.count>1 {decoded+=entries[ranked[0].0].text;scores.append(ranked[0].1);margins.append(ranked[0].1-ranked[1].1)}
            }
            guard scores.count==n else {continue}
            let score=scores.reduce(0,+)/Double(n)-0.012*Double(abs(n-count))
            if ProcessInfo.processInfo.environment["TEXTREVIVE_DEBUG"]=="1" {
                FileHandle.standardError.write(Data(("n=\(n) cuts=\(cuts) text=\(decoded) score=\(score) min=\(scores.min() ?? 0) margin=\(margins.min() ?? 0)\n"+debug.joined(separator:" | ")+"\n").utf8))
            }
            if score>bestScore {bestText=decoded;bestScore=score;bestMin=scores.min() ?? 0;bestMargin=margins.min() ?? 0}
        }
        let stable=bestScore>=0.78 && bestMin>=0.66 && bestMargin>=0.025
        let preview=png(normalized(crop,rect:bounds,width:min(960,max(32,Int(bounds.width/bounds.height*48))),height:48))
        // A plausible correction may be shown for review without authorizing replacement.
        let suggested=bestScore>=0.62 && bestMin>=0.55 ? bestText : line.text
        output.append(GlyphLine(text:suggested,confidence:bestScore,x:line.x,y:line.y,width:line.width,height:line.height,angle:0,alternatives:bestText==suggested ? []:[bestText],method:"font-glyph",stable:stable,preview:preview))
    }
    return GlyphResult(ok:true,lines:output)
}
if CommandLine.arguments.count==3 && CommandLine.arguments[1]=="--glyph" {
    do {let request=try JSONDecoder().decode(GlyphRequest.self,from:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[2])));emit(try recognizeGlyphs(request));exit(0)}
    catch {fail("字体辅助识别失败：\(error.localizedDescription)")}
}
if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--list-fonts" {
    emit(CTFontManagerCopyAvailablePostScriptNames() as! [String]); exit(0)
}
guard CommandLine.arguments.count == 2 else { fail("Usage: TextReviveMatch request.json") }
do {
    let input = try JSONDecoder().decode(MatchInput.self,from:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1])))
    guard input.lines.count > 0 && input.lines.count <= 20 && input.fonts.count <= 20000 else { fail("每次最多匹配 20 行、20000 个字体。") }
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath:input.image) as CFURL,nil),
          let image = CGImageSourceCreateImageAtIndex(source,0,nil), let original = bitmap(image) else { fail("无法读取原始选区图片。") }
    var resolved = [(String,CTFont)](), names = Set<String>()
    for name in input.fonts where !names.contains(name) {
        names.insert(name)
        let font = CTFontCreateWithName(name as CFString,100,nil)
        if CTFontCopyPostScriptName(font) as String == name { resolved.append((name,font)) }
    }
    var rows = [MatchRow]()
    for (index,line) in input.lines.enumerated() {
        guard !line.text.isEmpty, line.text.utf16.count <= 120,
              [line.x,line.y,line.width,line.height].allSatisfy({$0.isFinite}), line.width > 0, line.height > 0 else {
            rows.append(MatchRow(index:index,candidates:[],compared:0,original:"",warning:"单行最多 120 字，请分段匹配。")); continue
        }
        let x = max(0,Int(line.x*Double(image.width))), y = max(0,Int((1-line.y-line.height)*Double(image.height)))
        let right = min(image.width,Int(ceil((line.x+line.width)*Double(image.width))))
        let bottom = min(image.height,Int(ceil((1-line.y)*Double(image.height))))
        guard right > x, bottom > y else { fail("文字行坐标超出图片。") }
        var region = [UInt8](); region.reserveCapacity((right-x)*(bottom-y))
        for ry in y..<bottom { region.append(contentsOf:original.pixels[(ry*image.width+x)..<(ry*image.width+right)]) }
        let crop = Mask(pixels:region,width:right-x,height:bottom-y)
        guard let bounds = tight(crop) else { rows.append(MatchRow(index:index,candidates:[],compared:0,original:"",warning:"没有找到可比较的字形。")); continue }
        let height = 48, width = max(32,min(960,Int((bounds.width/bounds.height)*Double(height))))
        let target = normalized(crop,rect:bounds,width:width,height:height)
        var best = [(String,Double,Mask)](), compared = 0
        for (fi,entry) in resolved.enumerated() {
            autoreleasepool {
                if let path = glyphPath(line.text,font:entry.1), let mask = render(path,width:width,height:height) {
                    compared += 1
                    let score = similarity(target,mask)
                    if best.count < 5 || score > best.last!.1 {
                        best.append((entry.0,score,mask));best.sort{$0.1 > $1.1};if best.count>5 {best.removeLast()}
                    }
                }
            }
            if fi % 100 == 0 { emit(["type":"progress","line":String(index+1),"lines":String(input.lines.count),"done":String(fi),"total":String(resolved.count)]) }
        }
        rows.append(MatchRow(index:index,candidates:best.map{Candidate(name:$0.0,similarity:$0.1,preview:png($0.2))},
            compared:compared,original:png(target),warning:best.first.map{$0.1 < 0.7 ? "相似度偏低，可能缺少原字体、字距不同或原稿有变形；请人工比较。" : "候选按字形相似度排序，不能据此确认原字体。"}))
    }
    emit(MatchOutput(type:"result",ok:true,rows:rows,requestedFonts:input.fonts.count,resolvedFonts:resolved.count))
} catch { fail("字体匹配失败：\(error.localizedDescription)") }
