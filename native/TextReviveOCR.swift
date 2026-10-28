import Foundation
import Vision
import AppKit

struct Line: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let angle: Double
    let alternatives: [String]
    let preview: String
    let method: String
    let stable: Bool
    let ocrAgreed: Bool
}
struct Result: Codable {
    let ok: Bool
    let width: Int
    let height: Int
    let languages: [String]
    let lines: [Line]
}
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
guard CommandLine.arguments.count >= 2 else { fail("Usage: TextReviveOCR image.png [zh|en|auto]") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("无法读取识别图片。") }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.003
let mode = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "zh"
do {
    let supported = try request.supportedRecognitionLanguages()
    let desired = mode == "en" ? ["en-US"] : ["zh-Hans", "en-US", "zh-Hant"]
    request.recognitionLanguages = desired.filter { supported.contains($0) }
    guard !request.recognitionLanguages.isEmpty else { fail("系统没有可用的识别语言。") }
    // Do not enable automatic language detection: it can override explicit Chinese priority.
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let second = VNRecognizeTextRequest(); second.recognitionLevel = .accurate
    second.usesLanguageCorrection = false;second.minimumTextHeight=request.minimumTextHeight
    second.recognitionLanguages=request.recognitionLanguages
    try VNImageRequestHandler(cgImage:image,options:[:]).perform([second])
    func preview(_ box:CGRect)->String {
        let rect=CGRect(x:box.minX*Double(image.width),y:(1-box.maxY)*Double(image.height),width:box.width*Double(image.width),height:box.height*Double(image.height)).intersection(CGRect(x:0,y:0,width:image.width,height:image.height))
        guard let crop=image.cropping(to:rect) else {return ""}
        let scale=min(1,min(800.0/Double(crop.width),96.0/Double(crop.height)))
        var thumbnail=crop
        if scale<1,let ctx=CGContext(data:nil,width:max(1,Int(Double(crop.width)*scale)),height:max(1,Int(Double(crop.height)*scale)),bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) {
            ctx.draw(crop,in:CGRect(x:0,y:0,width:ctx.width,height:ctx.height));if let im=ctx.makeImage(){thumbnail=im}
        }
        let data=NSMutableData();guard let destination=CGImageDestinationCreateWithData(data,"public.png" as CFString,1,nil) else {return ""}
        CGImageDestinationAddImage(destination,thumbnail,nil);guard CGImageDestinationFinalize(destination) else {return ""}
        return (data as Data).base64EncodedString()
    }
    let lines = (request.results ?? []).compactMap { observation -> Line? in
        guard var candidate = observation.topCandidates(1).first else { return nil }
        let b = observation.boundingBox
        let corroborating=(second.results ?? []).max {a,c in
            a.boundingBox.intersection(b).width*a.boundingBox.intersection(b).height < c.boundingBox.intersection(b).width*c.boundingBox.intersection(b).height
        }
        let other=corroborating.flatMap { obs -> VNRecognizedText? in
            let overlap=obs.boundingBox.intersection(b)
            return overlap.width*overlap.height > b.width*b.height*0.6 ? obs.topCandidates(1).first : nil
        }
        let agreed=other?.string==candidate.string
        var alternatives=observation.topCandidates(5).map{$0.string}
        if let other=other {
            if !alternatives.contains(other.string){alternatives.append(other.string)}
            if other.confidence>candidate.confidence {candidate=other}
        }
        let dx = (observation.topRight.x - observation.topLeft.x) * Double(image.width)
        let dy = (observation.topRight.y - observation.topLeft.y) * Double(image.height)
        return Line(text: candidate.string, confidence: candidate.confidence,
                    x: b.minX, y: b.minY, width: b.width, height: b.height,
                    angle: atan2(dy, dx) * 180 / .pi,
                    alternatives: alternatives,preview:preview(b),method:"vision",stable:agreed && candidate.confidence>=0.8,ocrAgreed:agreed)
    }.sorted { a, b in
        if abs(a.y - b.y) > min(a.height, b.height) * 0.5 { return a.y > b.y }
        return a.x < b.x
    }
    let result = Result(ok: true, width: image.width, height: image.height,
                        languages: request.recognitionLanguages, lines: lines)
    FileHandle.standardOutput.write(try JSONEncoder().encode(result))
} catch { fail("本机 OCR 失败：\(error.localizedDescription)") }
