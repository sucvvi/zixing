#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>
#include <shlobj.h>
#include <bcrypt.h>
#include "BootstrapAbi.h"
#ifdef ZX_NO_CRT
extern "C" void* memset(void* p,int value,size_t size){volatile unsigned char* b=(volatile unsigned char*)p;while(size--)*b++=(unsigned char)value;return p;}
extern "C" void* memcpy(void* p,const void* q,size_t size){volatile unsigned char* a=(volatile unsigned char*)p;const volatile unsigned char* b=(const volatile unsigned char*)q;while(size--)*a++=*b++;return p;}
#endif
static HMODULE module;
static PROCESS_INFORMATION panel;
struct State {ZXBasic* basic;ZXMenu* menu;ZXAccess* access;void* resident;void* item;};
static State state;
static char menuLabel[64]="ZiXing";
static const wchar_t version[]=L"2.1.0-beta3";
static bool Append(wchar_t* target,DWORD capacity,const wchar_t* suffix){DWORD a=lstrlenW(target),b=lstrlenW(suffix);if(a+b>=capacity)return false;for(DWORD i=0;i<=b;i++)target[a+i]=suffix[i];return true;}
static bool UserDirectory(wchar_t* out){if(FAILED(SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,SHGFP_TYPE_CURRENT,out)))return false;if(!Append(out,MAX_PATH,L"\\ZiXing"))return false;return CreateDirectoryW(out,nullptr)||GetLastError()==ERROR_ALREADY_EXISTS;}
static void Log(const char* phase,LONG error,bool reset=false){
 wchar_t path[MAX_PATH];if(!UserDirectory(path)||!Append(path,MAX_PATH,L"\\startup.log"))return;
 HANDLE f=CreateFileW(path,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,reset?CREATE_ALWAYS:OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(f==INVALID_HANDLE_VALUE)return;
 SYSTEMTIME t;GetLocalTime(&t);char line[240];int count=wsprintfA(line,"%04u-%02u-%02u %02u:%02u:%02u beta3 %s code=0x%08lX\r\n",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond,phase,(unsigned long)error);DWORD written;WriteFile(f,line,count,&written,nullptr);CloseHandle(f);
}
static void Notice(const wchar_t* message){MessageBoxW(nullptr,message,L"字醒",MB_OK|MB_ICONERROR);}
static void UpdateMenuLabel(){
 // Register with an ASCII fallback, then write the native label as UTF-16.
 // Never pass UTF-8 Chinese through the host's ANSI ZString decoder.
 if(!state.menu||!state.menu->GetPlatformItem||!state.item)return;
 ZXPlatformMenu platform={};ZXError error=state.menu->GetPlatformItem(state.item,&platform);
 if(error||!platform.menu){Log("menu-label-platform",error);return;}
 HMENU menu=(HMENU)platform.menu;int count=GetMenuItemCount(menu);
 for(int i=0;i<count;i++){
  wchar_t label[80];if(!GetMenuStringW(menu,i,label,80,MF_BYPOSITION))continue;
  if(lstrcmpW(label,L"\u5b57\u9192")==0)return;
  wchar_t plain[80];int used=0;for(int c=0;label[c]&&label[c]!=L'\t'&&used<79;c++)if(label[c]!=L'&')plain[used++]=label[c];plain[used]=0;
  if(lstrcmpW(plain,L"ZiXing")!=0)continue;
  MENUITEMINFOW info={};info.cbSize=sizeof(info);info.fMask=MIIM_STRING;info.dwTypeData=(LPWSTR)L"\u5b57\u9192";
  Log("menu-label-utf16",SetMenuItemInfoW(menu,i,TRUE,&info)?0:GetLastError());return;
 }
 Log("menu-label-fallback",0);
}
static BOOL CALLBACK RaisePanel(HWND window,LPARAM pid){DWORD actual=0;GetWindowThreadProcessId(window,&actual);if(actual==(DWORD)pid&&IsWindowVisible(window)){ShowWindow(window,SW_RESTORE);SetForegroundWindow(window);}return TRUE;}
static void ShowPanel(){
 if(panel.hProcess&&WaitForSingleObject(panel.hProcess,0)==WAIT_TIMEOUT){EnumWindows(RaisePanel,panel.dwProcessId);return;}
 if(panel.hProcess){CloseHandle(panel.hProcess);CloseHandle(panel.hThread);panel.hProcess=nullptr;panel.hThread=nullptr;}
 HRSRC resource=FindResourceW(module,MAKEINTRESOURCEW(101),MAKEINTRESOURCEW(10));if(!resource){Log("panel-resource",GetLastError());Notice(L"面板组件缺失，请重新安装完整的字醒文件。");return;}
 DWORD size=SizeofResource(module,resource);const void* bytes=LockResource(LoadResource(module,resource));if(!bytes||!size){Log("panel-resource-data",GetLastError());return;}
 unsigned char hash[32];BCRYPT_ALG_HANDLE alg=nullptr;NTSTATUS result=BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0);if(result<0){Log("hash-open",result);return;}
 result=BCryptHash(alg,nullptr,0,(PUCHAR)bytes,size,hash,sizeof(hash));BCryptCloseAlgorithmProvider(alg,0);if(result<0){Log("hash",result);return;}
 wchar_t root[MAX_PATH];if(!UserDirectory(root)||!Append(root,MAX_PATH,L"\\")||!Append(root,MAX_PATH,version)){Notice(L"用户缓存目录不可用或路径过长。");return;}CreateDirectoryW(root,nullptr);
 wchar_t digest[65];const wchar_t hex[]=L"0123456789abcdef";for(int i=0;i<32;i++){digest[2*i]=hex[hash[i]>>4];digest[2*i+1]=hex[hash[i]&15];}digest[64]=0;
 if(!Append(root,MAX_PATH,L"\\")||!Append(root,MAX_PATH,digest)){Notice(L"用户缓存路径过长。");return;}CreateDirectoryW(root,nullptr);
 wchar_t exe[MAX_PATH],temporary[MAX_PATH];lstrcpynW(exe,root,MAX_PATH);if(!Append(exe,MAX_PATH,L"\\ZiXingPanel.exe")){Notice(L"面板路径过长。");return;}lstrcpynW(temporary,exe,MAX_PATH);if(!Append(temporary,MAX_PATH,L".tmp"))return;
 HANDLE output=CreateFileW(temporary,GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(output==INVALID_HANDLE_VALUE){Log("write-panel",GetLastError());Notice(L"无法写入面板缓存，请检查磁盘空间及目录权限。");return;}
 DWORD written=0;bool ok=WriteFile(output,bytes,size,&written,nullptr)&&written==size;FlushFileBuffers(output);CloseHandle(output);
 if(!ok||!MoveFileExW(temporary,exe,MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){Log("replace-panel",GetLastError());Notice(L"无法更新面板组件，请关闭旧字醒面板后重试。");return;}
 wchar_t host[MAX_PATH],command[MAX_PATH*2+100];DWORD hostLength=GetModuleFileNameW(nullptr,host,MAX_PATH);if(!hostLength||hostLength>=MAX_PATH){Notice(L"Illustrator 安装路径过长。");return;}
 wsprintfW(command,L"\"%s\" --parent %lu --host \"%s\"",exe,GetCurrentProcessId(),host);
 STARTUPINFOW startup={};startup.cb=sizeof(startup);
 if(!CreateProcessW(exe,command,nullptr,nullptr,FALSE,0,nullptr,root,&startup,&panel)){Log("create-panel",GetLastError());Notice(L"面板无法启动，请检查 .NET Framework 4.8、WebView2 Runtime，并查看字醒启动日志。");}else Log("panel-created",0);
}
extern "C" __declspec(dllexport) ZXError PluginMain(char* caller,char* selector,void* message){
 if(!caller||!selector||!message)return 0x5041524d;
 ZXMessage* data=(ZXMessage*)message;
 if(lstrcmpA(caller,"SP Interface")==0&&lstrcmpA(selector,"Startup")==0){
  Log("entry-startup",0,true);if(!data->basic||!data->basic->AcquireSuite){Log("missing-basic",0x5041524d);return 0x5041524d;}
  state.basic=data->basic;data->globals=&state;
  ZXError error=state.basic->AcquireSuite("AI Menu Suite",11,(const void**)&state.menu);Log("acquire-menu-11",error);if(error)return error;
  error=state.basic->AcquireSuite("SP Access Suite",3,(const void**)&state.access);Log("acquire-access-3",error);if(error)return error;
  if(!state.menu||!state.menu->AddZString||!state.access||!state.access->AcquirePlugin){Log("missing-suite-function",0x5041524d);return 0x5041524d;}
  // The host owns ZString construction. Do not request the old UnicodeString
  // suite, instantiate Adobe C++ strings, or do any OCR/panel work at startup.
  // ZString accepts the Windows system encoding, not necessarily UTF-8.
  // Use it only when the Chinese name is exactly representable; otherwise
  // retain the ASCII fallback and apply the native UTF-16 label below.
  BOOL substituted=FALSE;UINT page=GetACP();int encoded=WideCharToMultiByte(page,page==CP_UTF8?0:WC_NO_BEST_FIT_CHARS,L"\u5b57\u9192",-1,menuLabel,sizeof(menuLabel),nullptr,page==CP_UTF8?nullptr:&substituted);
  if(!encoded||substituted)lstrcpynA(menuLabel,"ZiXing",sizeof(menuLabel));
  error=state.menu->AddZString(data->self,"ZiXing.Windows.Panel","Tool Palettes",(const void*)menuLabel,3,&state.item);Log("register-menu",error);if(error)return error;
  UpdateMenuLabel();
  error=state.access->AcquirePlugin(data->self,&state.resident);Log("pin-plugin",error);if(error)return error;
  Log("startup-ready",0);return 0;
 }
 if(lstrcmpA(caller,"AI Menu")==0&&lstrcmpA(selector,"AI Update")==0){ZXMenuMessage* menu=(ZXMenuMessage*)message;if(menu->item==state.item&&state.item)UpdateMenuLabel();}
 if(lstrcmpA(caller,"AI Menu")==0&&lstrcmpA(selector,"AI Go")==0){ZXMenuMessage* menu=(ZXMenuMessage*)message;if(menu->item==state.item&&state.item)ShowPanel();}
 return 0;
}
extern "C" BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){module=instance;}return TRUE;}
