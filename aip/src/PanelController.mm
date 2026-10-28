#import "PanelController.h"
#import <WebKit/WebKit.h>
#import <signal.h>

static NSError *ZXError(NSString *message) {
    return [NSError errorWithDomain:@"cool.suba.zixing" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];
}

@interface ZXPanelController () <WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate>
@property NSURL *resources;
@property NSURL *work;
@property WKWebView *web;
@property (copy) ZXHostHandler host;
@property NSTask *task;
@property BOOL stopping;
@property BOOL hostBusy;
@end

@implementation ZXPanelController
- (instancetype)initWithResources:(NSURL *)resources host:(ZXHostHandler)host {
    NSPanel *panel=[[NSPanel alloc] initWithContentRect:NSMakeRect(0,0,400,720)
        styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable|NSWindowStyleMaskUtilityWindow
        backing:NSBackingStoreBuffered defer:NO];
    if (!(self=[super initWithWindow:panel])) return nil;
    self.resources=resources; self.host=host;
    panel.title=@"字醒"; panel.minSize=NSMakeSize(340,480); panel.releasedWhenClosed=NO;
    panel.delegate=self; panel.hidesOnDeactivate=YES; [panel center];
    [self attachToContainer:panel.contentView resources:resources host:host];
    return self;
}
- (instancetype)initWithContainerView:(NSView *)container resources:(NSURL *)resources host:(ZXHostHandler)host {
    if (!(self=[super initWithWindow:nil])) return nil;
    [self attachToContainer:container resources:resources host:host];
    return self;
}
- (void)attachToContainer:(NSView *)container resources:(NSURL *)resources host:(ZXHostHandler)host {
    self.resources=resources; self.host=host;
    WKWebViewConfiguration *config=[WKWebViewConfiguration new];
    config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    [config.userContentController addScriptMessageHandler:self name:@"zixing"];
    self.web=[[WKWebView alloc] initWithFrame:container.bounds configuration:config];
    self.web.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    self.web.navigationDelegate=self;
    [container addSubview:self.web];
    NSURL *webRoot=[resources URLByAppendingPathComponent:@"web" isDirectory:YES];
    [self.web loadFileURL:[webRoot URLByAppendingPathComponent:@"index.html"] allowingReadAccessToURL:webRoot];
}
- (void)showPanel { [self showWindow:nil]; [self.window makeKeyAndOrderFront:nil]; }
- (BOOL)windowShouldClose:(NSWindow *)sender { [sender orderOut:nil]; return NO; }
- (void)webView:(WKWebView *)view decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decision {
    NSURL *url=action.request.URL;
    NSString *root=[[self.resources URLByAppendingPathComponent:@"web"].URLByStandardizingPath.path stringByAppendingString:@"/"];
    decision(url.isFileURL&&[url.URLByStandardizingPath.path hasPrefix:root]?WKNavigationActionPolicyAllow:WKNavigationActionPolicyCancel);
}
- (void)deliver:(NSDictionary *)message {
    if(self.stopping)return;
    NSData *data=[NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
    if(!data)return;
    NSString *encoded=[data base64EncodedStringWithOptions:0];
    [self.web evaluateJavaScript:[NSString stringWithFormat:@"window.__zixingDeliver('%@')",encoded] completionHandler:nil];
}
- (void)reply:(NSString *)request data:(id)data error:(NSError *)error {
    [self deliver:error?@{@"id":request,@"ok":@NO,@"error":error.localizedDescription}:@{@"id":request,@"ok":@YES,@"data":data?:@{}}];
}
- (void)clearWork {
    if(self.work){[[NSFileManager defaultManager] removeItemAtURL:self.work error:nil];self.work=nil;}
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    if(self.stopping||!message.frameInfo.mainFrame||![message.body isKindOfClass:NSDictionary.class])return;
    NSDictionary *body=message.body;
    NSString *request=body[@"id"],*method=body[@"method"];
    NSDictionary *payload=body[@"payload"];
    if(![request isKindOfClass:NSString.class]||![payload isKindOfClass:NSDictionary.class])return;
    if(self.task||self.hostBusy){[self reply:request data:nil error:ZXError(@"请等待当前操作完成。")];return;}
    NSError *error=nil;
    if([method isEqual:@"cleanup"]){[self clearWork];[self reply:request data:@{} error:nil];return;}
    if([method isEqual:@"host"]){
        NSString *action=payload[@"action"];
        if(![@[@"ping",@"fonts",@"capture",@"rebuild",@"mergeText"] containsObject:action]){
            [self reply:request data:nil error:ZXError(@"不支持的文档操作。")];return;
        }
        if(![payload[@"payload"] isKindOfClass:NSDictionary.class]){[self reply:request data:nil error:ZXError(@"操作参数无效。")];return;}
        NSMutableDictionary *args=[payload[@"payload"] mutableCopy];
        if([action isEqual:@"capture"]){
            [self clearWork];
            self.work=[[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES] URLByAppendingPathComponent:[@"zixing-" stringByAppendingString:NSUUID.UUID.UUIDString] isDirectory:YES];
            if(![[NSFileManager defaultManager] createDirectoryAtURL:self.work withIntermediateDirectories:YES attributes:nil error:&error]){
                [self reply:request data:nil error:error];return;
            }
            args[@"path"]=[[self.work URLByAppendingPathComponent:@"selection.png"] path];
        }
        self.hostBusy=YES;
        ZXHostHandler handler=[self.host copy];NSURL *operationWork=self.work;
        __weak ZXPanelController *weakSelf=self;
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
            @autoreleasepool{
                NSError *failure=nil;id result=nil;
                @try {result=handler(action,args,&failure);}
                @catch(NSException *exception){failure=ZXError(exception.reason?:@"文档操作异常。");}
                dispatch_async(dispatch_get_main_queue(),^{
                    ZXPanelController *owner=weakSelf;
                    if(!owner||owner.stopping){if(operationWork)[[NSFileManager defaultManager] removeItemAtURL:operationWork error:nil];return;}
                    owner.hostBusy=NO;
                    if([@[@"capture",@"rebuild",@"mergeText"] containsObject:action])[owner.web.window makeKeyAndOrderFront:nil];
                    [owner reply:request data:result error:failure?:(!result?ZXError(@"Illustrator 未返回结果。"):nil)];
                });
            }
        });return;
    }
    if(!self.work){[self reply:request data:nil error:ZXError(@"识别记录已失效，请重新识别选区。")];return;}
    if([method isEqual:@"ocr"]){
        NSString *language=[payload[@"language"] isEqual:@"en"]?@"en":@"zh";
        [self runHelper:@"TextReviveOCR" arguments:@[[[self.work URLByAppendingPathComponent:@"selection.png"] path],language] request:request stream:NO];return;
    }
    if([method isEqual:@"match"]){
        NSArray *lines=payload[@"lines"],*fonts=payload[@"fonts"];
        if(![lines isKindOfClass:NSArray.class]||lines.count<1||lines.count>20||![fonts isKindOfClass:NSArray.class]||fonts.count>30000){[self reply:request data:nil error:ZXError(@"字体比较参数无效。")];return;}
        NSDictionary *input=@{@"image":[[self.work URLByAppendingPathComponent:@"selection.png"] path],@"fonts":fonts,@"lines":lines};
        NSData *data=[NSJSONSerialization dataWithJSONObject:input options:0 error:&error];
        NSURL *file=[self.work URLByAppendingPathComponent:@"font-request.json"];
        if(!data||![data writeToURL:file options:NSDataWritingAtomic error:&error]){[self reply:request data:nil error:error];return;}
        [self runHelper:@"TextReviveMatch" arguments:@[file.path] request:request stream:YES];return;
    }
    [self reply:request data:nil error:ZXError(@"不支持的原生操作。")];
}
- (void)runHelper:(NSString *)name arguments:(NSArray<NSString *> *)arguments request:(NSString *)request stream:(BOOL)stream {
    NSTask *task=[NSTask new]; task.executableURL=[[self.resources URLByAppendingPathComponent:@"bin"] URLByAppendingPathComponent:name];
    task.arguments=arguments;task.standardInput=NSFileHandle.fileHandleWithNullDevice;
    NSPipe *out=[NSPipe pipe],*err=[NSPipe pipe];task.standardOutput=out;task.standardError=err;
    NSError *launchError=nil;
    if(![task launchAndReturnError:&launchError]){[self reply:request data:nil error:launchError];return;}
    self.task=task;
    NSURL *taskWork=self.work;
    __weak ZXPanelController *weakSelf=self;
    __block BOOL timedOut=NO;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(stream?240:90)*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        ZXPanelController *owner=weakSelf;
        if(owner.task==task&&task.running){timedOut=YES;[task terminate];
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW,2*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(task.running)kill(task.processIdentifier,SIGKILL);});}
    });
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
        @autoreleasepool {
            NSMutableData *output=[NSMutableData data],*errors=[NSMutableData data],*lineBuffer=[NSMutableData data];
            __block NSDictionary *result=nil;__block BOOL tooLarge=NO;
            dispatch_group_t readers=dispatch_group_create();
            dispatch_group_async(readers,dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{
                for(;;){@autoreleasepool{
                    NSData *chunk=[err.fileHandleForReading readDataOfLength:4096];if(!chunk.length)break;
                    if(errors.length<16384)[errors appendData:chunk];
                }}
            });
            for(;;){@autoreleasepool{
                NSData *chunk=[out.fileHandleForReading readDataOfLength:8192];if(!chunk.length)break;
                if(output.length+chunk.length>48*1024*1024){tooLarge=YES;if(task.running){[task terminate];kill(task.processIdentifier,SIGKILL);}break;}
                [output appendData:chunk];
                if(stream){
                    [lineBuffer appendData:chunk];
                    for(;;){
                        const uint8_t *bytes=(const uint8_t *)lineBuffer.bytes;NSUInteger split=NSNotFound;
                        for(NSUInteger i=0;i<lineBuffer.length;i++)if(bytes[i]=='\n'){split=i;break;}
                        if(split==NSNotFound)break;
                        NSData *line=[lineBuffer subdataWithRange:NSMakeRange(0,split)];
                        [lineBuffer replaceBytesInRange:NSMakeRange(0,split+1) withBytes:NULL length:0];
                        id record=[NSJSONSerialization JSONObjectWithData:line options:0 error:nil];
                        if(![record isKindOfClass:NSDictionary.class])continue;
                        if([record[@"type"] isEqual:@"result"])result=record;
                        else if([record[@"type"] isEqual:@"progress"])dispatch_async(dispatch_get_main_queue(),^{
                            [weakSelf deliver:@{@"id":request,@"event":@"progress",@"data":record}];
                        });
                    }
                }
            }}
            [task waitUntilExit];dispatch_group_wait(readers,DISPATCH_TIME_FOREVER);
            [out.fileHandleForReading closeFile];[err.fileHandleForReading closeFile];
            if(!stream)result=[NSJSONSerialization JSONObjectWithData:output options:0 error:nil];
            NSString *stderrText=[[NSString alloc] initWithData:errors encoding:NSUTF8StringEncoding];
            dispatch_async(dispatch_get_main_queue(),^{
                ZXPanelController *owner=weakSelf;if(!owner||owner.stopping){[[NSFileManager defaultManager] removeItemAtURL:taskWork error:nil];return;}owner.task=nil;
                NSError *failure=nil;
                if(timedOut)failure=ZXError(@"处理超时，请缩小选区后重试。");
                else if(tooLarge)failure=ZXError(@"返回结果过大，请分段处理。");
                else if(task.terminationStatus!=0||![result isKindOfClass:NSDictionary.class])failure=ZXError(stderrText.length?stderrText:@"本机识别程序未返回有效结果。");
                [owner reply:request data:result error:failure];
            });
        }
    });
}
- (void)shutdown {
    self.stopping=YES;
    [self.web.configuration.userContentController removeScriptMessageHandlerForName:@"zixing"];
    NSTask *task=self.task;
    if(task.running){[task terminate];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,2*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(task.running)kill(task.processIdentifier,SIGKILL);});}
    [self.window orderOut:nil];
    [self.web removeFromSuperview];
    // The worker owns its input until it exits. Defer cleanup while a process is active.
    if(!self.task&&!self.hostBusy)[self clearWork];
}
@end
