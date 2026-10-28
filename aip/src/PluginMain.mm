#import <Cocoa/Cocoa.h>
#include <cstring>
#include <dlfcn.h>
#include "SPBasic.h"
#include "SPInterf.h"
#include "SPAccess.h"
#include "SPBlocks.h"
#include "AIMenu.h"
#include "AIPanel.h"
#include "AINotifier.h"
#include "AIRuntime.h"
#include "AIMenuGroups.h"
#include "AIUnicodeString.h"
#include "IAIUnicodeString.h"
#import "PanelController.h"
#import "HostScriptBridge.h"

extern "C" { AIUnicodeStringSuite *sAIUnicodeString=nullptr; SPBlocksSuite *sSPBlocks=nullptr; }
struct ZXPluginState {
    SPBasicSuite *basic=nullptr;
    AIMenuSuite *menu=nullptr;
    SPAccessSuite *access=nullptr;
    AIPanelSuite *panel=nullptr;
    AINotifierSuite *notifier=nullptr;
    SPPluginRef self=nullptr;
    AIPanelRef panelRef=nullptr;
    AINotifierHandle shutdown=nullptr;
    SPAccessRef resident=nullptr;
    AIMenuItemHandle menuItem=nullptr;
};
static ZXPanelController *zxPanel;
static ZXHostScriptBridge *zxBridge;
static NSView *zxContainer;
static void ZXTrace(const char *event,ASErr error=0) {
    NSString *path=[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/ZiXing-native.log"];
    FILE *file=fopen(path.fileSystemRepresentation,"a");
    if(file){fprintf(file,"%s error=%d\n",event,(int)error);fclose(file);}
}

static ASErr ZXShowPanel(ZXPluginState *state) {
    if(!zxPanel){
        AISize minimum={340,400}, preferred={400,720}, maximum={1600,1600};
        ASErr err=state->panel->Create(state->self,ai::UnicodeString::FromUTF8("cool.suba.zixing.native.panel"),ai::UnicodeString::FromUTF8("字醒"),1,minimum,true,nullptr,state,state->panelRef);
        if(err){ZXTrace("panel API failed",err);return err;}
        ZXTrace("panel created");
        ZXTrace("panel sizes",state->panel->SetSizes(state->panelRef,minimum,preferred,preferred,maximum));
        __autoreleasing AIPanelPlatformWindow container=nullptr;
        err=state->panel->GetPlatformWindow(state->panelRef,container);
        if(err){ZXTrace("panel API failed",err);return err;}
        zxContainer=container;
        [container setFrameSize:NSMakeSize(400,720)];
        state->panel->Move(state->panelRef,AIPoint{200,160});
        Dl_info info={};dladdr((const void *)&ZXShowPanel,&info);
        NSURL *binary=[NSURL fileURLWithPath:[NSString stringWithUTF8String:info.dli_fname]];
        NSURL *resources=[[[binary URLByDeletingLastPathComponent] URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"Resources" isDirectory:YES];
        zxBridge=[[ZXHostScriptBridge alloc] initWithResources:resources];
        ZXHostScriptBridge *bridge=zxBridge;
        zxPanel=[[ZXPanelController alloc] initWithContainerView:container resources:resources host:^id(NSString *action,NSDictionary *payload,NSError **error){
            return [bridge performAction:action payload:payload error:error];
        }];
    }
    state->panel->SetCurrentState(state->panelRef,1);
    state->panel->ChangeIsMinimized(state->panelRef,false);
    ASErr result=state->panel->Show(state->panelRef,true);ZXTrace("panel shown",result);
    [zxContainer.window makeKeyAndOrderFront:nil];
    return result;
}

extern "C" __attribute__((visibility("default"))) ASAPI ASErr PluginMain(char *caller,char *selector,void *message) {
    @autoreleasepool {
        SPMessageData *data=(SPMessageData *)message;
        ZXPluginState *state=(ZXPluginState *)data->globals;
        if(!std::strcmp(caller,kSPInterfaceCaller)&&!std::strcmp(selector,kSPInterfaceStartupSelector)){
            ZXTrace("startup entered");
            state=new ZXPluginState;data->globals=state;state->basic=data->basic;state->self=data->self;
            ASErr error=state->basic->AcquireSuite(kSPBlocksSuite,kSPBlocksSuiteVersion,(const void **)&sSPBlocks);
            if(!error)error=state->basic->AcquireSuite(kAIMenuSuite,kAIMenuSuiteVersion,(const void **)&state->menu);
            if(!error)error=state->basic->AcquireSuite(kAIUnicodeStringSuite,kAIUnicodeStringVersion,(const void **)&sAIUnicodeString);
            if(!error)error=state->basic->AcquireSuite(kSPAccessSuite,kSPAccessSuiteVersion,(const void **)&state->access);
            if(!error)error=state->basic->AcquireSuite(kAIPanelSuite,kAIPanelSuiteVersion,(const void **)&state->panel);
            if(!error)error=state->basic->AcquireSuite(kAINotifierSuite,kAINotifierSuiteVersion,(const void **)&state->notifier);
            if(!error)error=state->notifier->AddNotifier(data->self,"ZiXing.Shutdown",kAIApplicationShutdownNotifier,&state->shutdown);
            if(!error){
                AIPlatformAddMenuItemDataUS menuData;
                menuData.groupName=kOtherPalettesMenuGroup;menuData.itemText=ai::UnicodeString::FromUTF8("字醒");
                error=state->menu->AddMenuItem(data->self,"ZiXing.Native.Panel",&menuData,kMenuItemWantsUpdateOption,&state->menuItem);
            }
            if(!error)error=state->access->AcquirePlugin(data->self,&state->resident);
            ZXTrace("startup finished",error);
            return error;
        }
        if(!state)return kNoErr;
        if(!std::strcmp(caller,kCallerAINotify)&&!std::strcmp(selector,kSelectorAINotify)){
            AINotifierMessage *notification=(AINotifierMessage *)message;
            if(notification->notifier==state->shutdown){
                [zxPanel shutdown];zxPanel=nil;zxBridge=nil;
                if(state->panelRef){state->panel->Destroy(state->panelRef);state->panelRef=nullptr;zxContainer=nil;}
            }
            return kNoErr;
        }
        if(!std::strcmp(caller,kCallerAIMenu)){
            AIMenuMessage *menu=(AIMenuMessage *)message;
            if(menu->menuItem==state->menuItem){
                if(!std::strcmp(selector,kSelectorAIUpdateMenuItem))return state->menu->EnableItem(state->menuItem);
                if(!std::strcmp(selector,kSelectorAIGoMenuItem)){ZXTrace("panel opened");return ZXShowPanel(state);}
            }
        }
        if(!std::strcmp(caller,kSPInterfaceCaller)&&!std::strcmp(selector,kSPInterfaceShutdownSelector)){
            [zxPanel shutdown];zxPanel=nil;zxBridge=nil;
            // Keep the image resident through process shutdown while asynchronous WebKit callbacks drain.
            return kNoErr;
        }
        return kNoErr;
    }
}
