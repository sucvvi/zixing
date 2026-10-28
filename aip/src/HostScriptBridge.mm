#import "HostScriptBridge.h"
#import <unistd.h>
#import <signal.h>

@interface ZXHostScriptBridge ()
@property NSString *source;
@property NSURL *resources;
@end
@implementation ZXHostScriptBridge
- (instancetype)initWithResources:(NSURL *)resources {
    if((self=[super init])){self.resources=resources;self.source=[NSString stringWithContentsOfURL:[resources URLByAppendingPathComponent:@"host/main.jsx"] encoding:NSUTF8StringEncoding error:nil];}
    return self;
}
static NSString *ZXQuote(NSString *value) {
    NSData *json=[NSJSONSerialization dataWithJSONObject:@[value] options:0 error:nil];
    NSString *array=[[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    NSString *quoted=[array substringWithRange:NSMakeRange(1,array.length-2)];
    return [[quoted stringByReplacingOccurrencesOfString:@"\u2028" withString:@"\\u2028"] stringByReplacingOccurrencesOfString:@"\u2029" withString:@"\\u2029"];
}
- (id)performAction:(NSString *)action payload:(NSDictionary *)payload error:(NSError **)error {
#if !ZX_BRIDGE_HELPER
    NSData *input=[NSJSONSerialization dataWithJSONObject:@{@"action":action,@"payload":payload} options:0 error:error];
    if(!input)return nil;
    NSTask *task=[NSTask new];
    task.executableURL=[[self.resources URLByAppendingPathComponent:@"bin"] URLByAppendingPathComponent:@"ZiXingHost"];
    NSPipe *in=[NSPipe pipe],*out=[NSPipe pipe],*err=[NSPipe pipe];
    task.standardInput=in;task.standardOutput=out;task.standardError=err;
    if(![task launchAndReturnError:error])return nil;
    [in.fileHandleForWriting writeData:input];[in.fileHandleForWriting closeFile];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,185*NSEC_PER_SEC),dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{if(task.running){[task terminate];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,2*NSEC_PER_SEC),dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{if(task.running)kill(task.processIdentifier,SIGKILL);});}});
    NSData *output=[out.fileHandleForReading readDataToEndOfFile];
    [task waitUntilExit];
    NSDictionary *reply=output.length?[NSJSONSerialization JSONObjectWithData:output options:0 error:error]:nil;
    if(![reply isKindOfClass:NSDictionary.class]||![reply[@"ok"] boolValue]){
        if(error)*error=[NSError errorWithDomain:@"字醒" code:task.terminationStatus userInfo:@{NSLocalizedDescriptionKey:([reply isKindOfClass:NSDictionary.class]?reply[@"error"]:nil)?:@"文档桥接进程未返回有效结果。"}];return nil;
    }
    return reply[@"data"]?:@{};
#else
    if(!self.source.length){if(error)*error=[NSError errorWithDomain:@"字醒" code:1 userInfo:@{NSLocalizedDescriptionKey:@"插件中的文档脚本缺失。"}];return nil;}
    NSData *json=[NSJSONSerialization dataWithJSONObject:payload options:0 error:error];if(!json)return nil;
    NSString *encoded=[[[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding] stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.alphanumericCharacterSet];
    // Keep the capture token and original art references in the same Illustrator script engine.
    NSString *script=[NSString stringWithFormat:@"#targetengine \"zixing-native\"\nif(typeof TextReviveAIPBuild==='undefined'||TextReviveAIPBuild!=='2.0.0'){\n%@\nvar TextReviveAIPBuild='2.0.0';}\nTextRevive.dispatch(%@,%@);",self.source,ZXQuote(action),ZXQuote(encoded)];
    // Adobe publishes 'misc'/'DjxM' as the Illustrator do-javascript command in its scripting dictionary.
    // The embedded helper targets only its parent Illustrator process; no osascript, shell or CEP is used.
    NSAppleEventDescriptor *event=[NSAppleEventDescriptor appleEventWithEventClass:'misc' eventID:'DjxM'
        targetDescriptor:[NSAppleEventDescriptor descriptorWithProcessIdentifier:getppid()] returnID:kAutoGenerateReturnID transactionID:kAnyTransactionID];
    [event setParamDescriptor:[NSAppleEventDescriptor descriptorWithString:script] forKeyword:keyDirectObject];
    NSAppleEventDescriptor *reply=[event sendEventWithOptions:NSAppleEventSendWaitForReply|NSAppleEventSendNeverInteract|NSAppleEventSendDontRecord timeout:180 error:error];
    if(!reply)return nil;
    NSAppleEventDescriptor *errorNumber=[reply paramDescriptorForKeyword:keyErrorNumber];
    if(errorNumber.int32Value){if(error)*error=[NSError errorWithDomain:@"Illustrator" code:errorNumber.int32Value userInfo:@{NSLocalizedDescriptionKey:[reply paramDescriptorForKeyword:keyErrorString].stringValue?:@"Illustrator 脚本执行失败。"}];return nil;}
    NSString *raw=[reply paramDescriptorForKeyword:keyDirectObject].stringValue;
    id result=raw?[NSJSONSerialization JSONObjectWithData:[raw dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingFragmentsAllowed error:error]:nil;
    if(![result isKindOfClass:NSDictionary.class]||![result[@"ok"] boolValue]){
        NSString *message=[result isKindOfClass:NSDictionary.class]?result[@"error"]:nil;
        if(error)*error=[NSError errorWithDomain:@"字醒" code:1 userInfo:@{NSLocalizedDescriptionKey:message?:@"Illustrator 未返回有效的文档结果。"}];return nil;
    }
    return result[@"data"]?:@{};
#endif
}
@end
