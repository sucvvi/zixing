#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shlobj.h>
#include <bcrypt.h>
#include <string>
#include <cstring>
#include "SPBasic.h"
#include "SPInterf.h"
#include "SPAccess.h"
#include "SPBlocks.h"
#include "AIMenu.h"
#include "AIMenuGroups.h"
#include "AIUnicodeString.h"
#include "IAIUnicodeString.h"
extern "C" { AIUnicodeStringSuite *sAIUnicodeString=nullptr; SPBlocksSuite *sSPBlocks=nullptr; }
static_assert(sizeof(ai::UnicodeString)==sizeof(void*),"Unexpected SDK string layout");
struct State { SPBasicSuite* basic; AIMenuSuite* menu; SPAccessSuite* access; SPAccessRef resident; AIMenuItemHandle item; };
static HMODULE module;
static PROCESS_INFORMATION panel={};
static bool WriteAll(HANDLE file,const void* data,DWORD size){DWORD written=0;return WriteFile(file,data,size,&written,nullptr)&&written==size;}
static void ShowPanel(){
 if(panel.hProcess&&WaitForSingleObject(panel.hProcess,0)==WAIT_TIMEOUT){
  EnumWindows([](HWND w,LPARAM pid)->BOOL{DWORD actual=0;GetWindowThreadProcessId(w,&actual);if(actual==(DWORD)pid&&IsWindowVisible(w)){ShowWindow(w,SW_RESTORE);SetForegroundWindow(w);}return TRUE;},panel.dwProcessId);return;
 }
 if(panel.hProcess){CloseHandle(panel.hProcess);CloseHandle(panel.hThread);panel={};}
 HRSRC resource=FindResourceW(module,MAKEINTRESOURCEW(101),MAKEINTRESOURCEW(10));
 if(!resource){MessageBoxW(nullptr,L"插件中的面板组件缺失，请重新安装。",L"字醒",MB_OK|MB_ICONERROR);return;}
 DWORD size=SizeofResource(module,resource);const void* bytes=LockResource(LoadResource(module,resource));
 unsigned char hash[32];
 BCRYPT_ALG_HANDLE alg=nullptr;NTSTATUS status=BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0);
 if(status<0){MessageBoxW(nullptr,L"系统无法校验面板组件。",L"字醒",MB_OK);return;}
 status=BCryptHash(alg,nullptr,0,(PUCHAR)bytes,size,hash,sizeof(hash));BCryptCloseAlgorithmProvider(alg,0);if(status<0)return;
 wchar_t local[MAX_PATH];if(FAILED(SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,SHGFP_TYPE_CURRENT,local)))return;
 std::wstring root=std::wstring(local)+L"\\ZiXing";CreateDirectoryW(root.c_str(),nullptr);
 root+=L"\\2.1.0-beta1";CreateDirectoryW(root.c_str(),nullptr);
 wchar_t digest[65];for(int i=0;i<32;i++)swprintf(digest+i*2,3,L"%02x",hash[i]);
 root+=L"\\"+std::wstring(digest);CreateDirectoryW(root.c_str(),nullptr);
 std::wstring exe=root+L"\\ZiXingPanel.exe";
 // Rewrite from the trusted embedded resource instead of executing an unverified cached file.
 std::wstring temporary=exe+L".tmp";
 HANDLE output=CreateFileW(temporary.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(output==INVALID_HANDLE_VALUE){MessageBoxW(nullptr,L"无法写入用户缓存目录，请检查磁盘空间和文件夹权限。",L"字醒",MB_OK|MB_ICONERROR);return;}bool ok=WriteAll(output,bytes,size);FlushFileBuffers(output);CloseHandle(output);
 if(!ok||!MoveFileExW(temporary.c_str(),exe.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){MessageBoxW(nullptr,L"无法更新面板组件，请关闭旧面板后重试，并检查安全软件的提示。",L"字醒",MB_OK|MB_ICONERROR);return;}
 wchar_t host[MAX_PATH];GetModuleFileNameW(nullptr,host,MAX_PATH);
 std::wstring command=L"\""+exe+L"\" --parent "+std::to_wstring(GetCurrentProcessId())+L" --host \""+host+L"\"";
 STARTUPINFOW startup={sizeof(startup)};
 if(!CreateProcessW(exe.c_str(),&command[0],nullptr,nullptr,FALSE,0,nullptr,root.c_str(),&startup,&panel)){
  MessageBoxW(nullptr,L"面板无法启动。请检查 .NET Framework 4.8、WebView2 Runtime 或安全软件的提示。",L"字醒",MB_OK|MB_ICONERROR);
 }
}
extern "C" __declspec(dllexport) ASErr ASAPI PluginMain(char* caller,char* selector,void* message){
 auto* data=(SPMessageData*)message;auto* state=(State*)data->globals;
 try{
  if(!std::strcmp(caller,kSPInterfaceCaller)&&!std::strcmp(selector,kSPInterfaceStartupSelector)){
   state=new State{};data->globals=state;state->basic=data->basic;
   ASErr error=state->basic->AcquireSuite(kSPBlocksSuite,kSPBlocksSuiteVersion,(const void**)&sSPBlocks);
   if(!error)error=state->basic->AcquireSuite(kAIUnicodeStringSuite,kAIUnicodeStringVersion,(const void**)&sAIUnicodeString);
   if(!error)error=state->basic->AcquireSuite(kAIMenuSuite,kAIMenuSuiteVersion,(const void**)&state->menu);
   if(!error)error=state->basic->AcquireSuite(kSPAccessSuite,kSPAccessSuiteVersion,(const void**)&state->access);
   if(!error){AIPlatformAddMenuItemDataUS item;item.groupName=kOtherPalettesMenuGroup;item.itemText=ai::UnicodeString::FromUTF8("字醒");error=state->menu->AddMenuItem(data->self,"ZiXing.Windows.Panel",&item,kMenuItemWantsUpdateOption,&state->item);}
   if(!error)error=state->access->AcquirePlugin(data->self,&state->resident);
   return error;
  }
  if(!state)return kNoErr;
  if(!std::strcmp(caller,kCallerAIMenu)){
   auto* menu=(AIMenuMessage*)message;if(menu->menuItem==state->item){
    if(!std::strcmp(selector,kSelectorAIUpdateMenuItem))return state->menu->EnableItem(state->item);
    if(!std::strcmp(selector,kSelectorAIGoMenuItem)){ShowPanel();return kNoErr;}
   }
  }
  return kNoErr;
 }catch(...){return 'ZXER';}
}
BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){module=instance;DisableThreadLibraryCalls(instance);}return TRUE;}
