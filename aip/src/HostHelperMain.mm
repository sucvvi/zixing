#import <Foundation/Foundation.h>
#import "HostScriptBridge.h"
int main(int argc,const char *argv[]){@autoreleasepool{
    NSData *input=[NSFileHandle.fileHandleWithStandardInput readDataToEndOfFile];
    NSError *error=nil;id data=nil;
    NSDictionary *request=input.length<1024*1024?[NSJSONSerialization JSONObjectWithData:input options:0 error:&error]:nil;
    NSArray *actions=@[@"ping",@"fonts",@"capture",@"rebuild",@"mergeText"];
    if([request isKindOfClass:NSDictionary.class]&&[actions containsObject:request[@"action"]]&&[request[@"payload"] isKindOfClass:NSDictionary.class]){
        NSURL *executable=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[0]]];
        NSURL *resources=[[executable URLByDeletingLastPathComponent] URLByDeletingLastPathComponent];
        ZXHostScriptBridge *bridge=[[ZXHostScriptBridge alloc] initWithResources:resources];
        data=[bridge performAction:request[@"action"] payload:request[@"payload"] error:&error];
    }
    NSDictionary *reply=data?@{@"ok":@YES,@"data":data}:@{@"ok":@NO,@"error":error.localizedDescription?:@"文档参数无效。"};
    NSData *result=[NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];
    [NSFileHandle.fileHandleWithStandardOutput writeData:result];
    return data?0:1;
}}
