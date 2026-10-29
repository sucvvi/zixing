#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "../src/BootstrapAbi.h"
static int registered=0,pinned=0,unicodeRequests=0;
static HMENU nativeMenu;
static ZXError Add(void*,const char*,const char* group,const void* label,int32_t flags,void** item){
 wchar_t decoded[64];if(!MultiByteToWideChar(CP_ACP,0,(const char*)label,-1,decoded,64))return 101;
 if(strcmp(group,"Tool Palettes")||(lstrcmpW(decoded,L"ZiXing")&&lstrcmpW(decoded,L"\u5b57\u9192"))||flags!=3)return 101;
 nativeMenu=CreatePopupMenu();AppendMenuW(nativeMenu,MF_STRING,100,L"Other plugin");AppendMenuW(nativeMenu,MF_STRING,200,L"ZiXing");
 *item=(void*)0x1234;registered++;return 0;
}
static ZXError Platform(void*,ZXPlatformMenu* out){out->menu=nativeMenu;out->item=200;return 0;}
static ZXError Pin(void*,void** out){*out=(void*)0x5678;pinned++;return 0;}
static ZXMenu menu={nullptr,Add,{nullptr},Platform};static ZXAccess access={Pin};
static ZXError Acquire(const char* name,int32_t version,const void** out){
 if(!strcmp(name,"AI Menu Suite")&&version==11){*out=&menu;return 0;}
 if(!strcmp(name,"SP Access Suite")&&version==3){*out=&access;return 0;}
 if(strstr(name,"Unicode"))unicodeRequests++;
 *out=nullptr;return 999;
}
int wmain(int argc,wchar_t** argv){
 if(argc!=2){fprintf(stderr,"Usage: loader-smoke.exe path-to-aip\n");return 2;}
 HMODULE dll=LoadLibraryW(argv[1]);if(!dll){fprintf(stderr,"FAIL LoadLibraryW: %lu\n",GetLastError());return 3;}
 typedef ZXError (*Entry)(char*,char*,void*);Entry entry=(Entry)GetProcAddress(dll,"PluginMain");if(!entry)return 4;
 ZXBasic basic={Acquire,nullptr};ZXMessage data={0x5350436b,(void*)1,nullptr,&basic};
 ZXError code=entry((char*)"SP Interface",(char*)"Startup",&data);
 if(code||registered!=1||pinned!=1||unicodeRequests||!data.globals){fprintf(stderr,"FAIL startup=%ld menus=%d pinned=%d Unicode=%d\n",(long)code,registered,pinned,unicodeRequests);return 5;}
 wchar_t title[40];GetMenuStringW(nativeMenu,1,title,40,MF_BYPOSITION);if(lstrcmpW(title,L"\u5b57\u9192"))return 11;
 GetMenuStringW(nativeMenu,0,title,40,MF_BYPOSITION);if(lstrcmpW(title,L"Other plugin"))return 12;
 ZXMenuMessage update={data,(void*)0x1234};if(entry((char*)"AI Menu",(char*)"AI Update",&update))return 13;
 if(entry((char*)"SP Access",(char*)"Reload",&data))return 6;
 if(entry((char*)"SP Interface",(char*)"Shutdown",&data))return 7;
 if(entry(nullptr,nullptr,nullptr)!=0x5041524d)return 8;
 HRSRC resource=FindResourceW(dll,MAKEINTRESOURCEW(101),MAKEINTRESOURCEW(10));if(!resource||SizeofResource(dll,resource)<100000)return 9;
 const unsigned char* embedded=(const unsigned char*)LockResource(LoadResource(dll,resource));if(!embedded||embedded[0]!='M'||embedded[1]!='Z')return 10;
 DestroyMenu(nativeMenu);FreeLibrary(dll);
 puts("PASS native Windows menu UTF-16 label is exactly ZiXing Chinese name, and unrelated menu items remain unchanged.");
 puts("PASS Windows x64 LoadLibrary, PluginMain, C ABI startup, menu registration, plugin pin, reload, shutdown, null guard and embedded panel. Illustrator itself was NOT tested.");
 return 0;
}
