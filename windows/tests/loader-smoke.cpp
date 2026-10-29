#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "../src/BootstrapAbi.h"
static int registered=0,pinned=0,unicodeRequests=0;
static ZXError Add(void*,const char*,const char* group,const void* label,int32_t flags,void** item){
 if(strcmp(group,"Tool Palettes")||strcmp((const char*)label,"字醒")||flags!=2)return 101;
 *item=(void*)0x1234;registered++;return 0;
}
static ZXError Pin(void*,void** out){*out=(void*)0x5678;pinned++;return 0;}
static ZXMenu menu={nullptr,Add};static ZXAccess access={Pin};
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
 if(entry((char*)"SP Access",(char*)"Reload",&data))return 6;
 if(entry((char*)"SP Interface",(char*)"Shutdown",&data))return 7;
 if(entry(nullptr,nullptr,nullptr)!=0x5041524d)return 8;
 HRSRC resource=FindResourceW(dll,MAKEINTRESOURCEW(101),MAKEINTRESOURCEW(10));if(!resource||SizeofResource(dll,resource)<100000)return 9;
 const unsigned char* embedded=(const unsigned char*)LockResource(LoadResource(dll,resource));if(!embedded||embedded[0]!='M'||embedded[1]!='Z')return 10;
 FreeLibrary(dll);
 puts("PASS Windows x64 LoadLibrary, PluginMain, C ABI startup, menu registration, plugin pin, reload, shutdown, null guard and embedded panel. Illustrator itself was NOT tested.");
 return 0;
}
