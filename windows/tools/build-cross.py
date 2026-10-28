#!/usr/bin/env python3
"""Build a Windows x64 test AIP on macOS from the separately obtained official SDK."""
from pathlib import Path
import argparse,hashlib,json,os,struct,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,default=Path('/private/tmp/zixing-win-tools'));p.add_argument('--sdk',type=Path,default=Path('/private/tmp/zixing-win-tools/sdk2020/Adobe Illustrator 2020 SDK'));a=p.parse_args();tools=a.tools;sdk=a.sdk
build=ROOT/'windows/build';build.mkdir(parents=True,exist_ok=True)
refs=tools/'net48/build/.NETFramework/v4.8';web=tools/'webview2/lib/net462';dotnet=tools/'dotnet/dotnet';compiler=next((tools/'dotnet/sdk').glob('*/Roslyn/bincore/csc.dll'))
assetFiles={p.relative_to(ROOT/'windows/resources').as_posix():p for p in (ROOT/'windows/resources').rglob('*') if p.is_file()}
for n in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']:assetFiles[n]=web/n
assetFiles['WebView2Loader.dll']=tools/'webview2/runtimes/win-x64/native/WebView2Loader.dll'
with zipfile.ZipFile(build/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n,p in sorted(assetFiles.items()):z.write(p,n)
references=['mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','System.IO.Compression','System.IO.Compression.FileSystem','System.Web.Extensions','Microsoft.CSharp']
command=[str(dotnet),str(compiler),'-nologo','-noconfig','-nostdlib+','-target:winexe','-platform:x64','-langversion:latest','-optimize+','-out:'+str(build/'ZiXingPanel.exe'),'-resource:'+str(build/'payload.zip')+',ZiXing.Payload']
command+=['-r:'+str(refs/(name+'.dll')) for name in references]
command+=['-r:'+str(web/name) for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']]
command+=[str(p) for p in sorted((ROOT/'windows/src').glob('*.cs'))]
env=dict(os.environ,DOTNET_CLI_HOME=str(tools/'dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',DOTNET_CLI_TELEMETRY_OPTOUT='1',DOTNET_NOLOGO='1',DOTNET_GENERATE_ASPNET_CERTIFICATE='false')
subprocess.run(command,env=env,check=True)
# Same PiPL v2 property layout as Adobe's SDK generator; explicit Windows target for cross builds.
props=[(b'kind',b'SPEA'),(b'ivrs',struct.pack('>I',2)),(b'wx86',b'PluginMain\0\0\0\0'),(b'pinm',b'ZiXing')]
data=struct.pack('>III',1,0,len(props))
for key,value in props:
 value+=b'\0'*((-len(value))%4);data+=b'ADBE'+key+struct.pack('>II',0,len(value))+value
(build/'plugin.pipl').write_bytes(data)
resource='''#include <windows.h>
plugin pipl "plugin.pipl"
101 RCDATA "ZiXingPanel.exe"
1 VERSIONINFO
FILEVERSION 2,1,0,1
PRODUCTVERSION 2,1,0,1
FILEOS VOS_NT_WINDOWS32
FILETYPE VFT_DLL
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "FileDescription", "ZiXing Windows experimental plug-in\\0"
   VALUE "ProductName", "ZiXing\\0"
   VALUE "FileVersion", "2.1.0-beta1\\0"
  END
 END
END
'''
(build/'plugin.rc').write_text(resource)
bin=next(tools.glob('llvm-mingw-*/bin'))
subprocess.run([str(bin/'x86_64-w64-mingw32-windres'),'-i','plugin.rc','-o','plugin-resource.o'],cwd=build,check=True)
command=[str(bin/'x86_64-w64-mingw32-clang++'),'-std=c++17','-O2','-include',str(ROOT/'windows/src/LegacyU16Traits.h'),'-DWIN_ENV=1','-D_WINDOWS','-D_USRDLL','-D_WIN32_WINNT=0x0A00','-DAI_HAS_NOEXCEPT=1','-DAI_AUTO_SUITE_AVAILABLE=0','-shared','-static','-Wno-multichar','-Wno-pragma-pack','-Wno-deprecated-declarations']
command+=['-I'+str(p) for p in sorted({p.parent for p in (sdk/'illustratorapi').rglob('*.h')})]
command+=[str(ROOT/'windows/src/PluginMain.cpp'),str(sdk/'illustratorapi/illustrator/IAIUnicodeString.cpp'),str(build/'plugin-resource.o'),'-lbcrypt','-lshell32','-o',str(build/'字醒.aip')]
subprocess.run(command,check=True)
manifest={'version':'2.1.0-beta1','platform':'Windows x64','buildOnly':True,'windowsIllustratorTested':False,'sdk':'Adobe Illustrator 2020 SDK v3 Aug 2020','assets':{n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in sorted(assetFiles.items())},'aipSHA256':hashlib.sha256((build/'字醒.aip').read_bytes()).hexdigest()}
(build/'build-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(build/'字醒.aip')
