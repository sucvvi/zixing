#!/usr/bin/env python3
"""Cross-build a CRT-free Windows x64 registration DLL; validate ABI against an official SDK."""
from pathlib import Path
import argparse,os,subprocess
from build_support import ROOT,BUILD,payload,csharp_arguments,resources,manifest
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,default=Path('/private/tmp/zixing-win-tools'));p.add_argument('--sdk',type=Path,default=Path('/private/tmp/zixing-win-tools/sdk2020/Adobe Illustrator 2020 SDK'));a=p.parse_args()
tools=a.tools;sdk=a.sdk;web=tools/'webview2';files=payload(web)
refs=tools/'net48/build/.NETFramework/v4.8';compiler=next((tools/'dotnet/sdk').glob('*/Roslyn/bincore/csc.dll'))
env=dict(os.environ,DOTNET_CLI_HOME=str(tools/'dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',DOTNET_CLI_TELEMETRY_OPTOUT='1',DOTNET_NOLOGO='1',DOTNET_GENERATE_ASPNET_CERTIFICATE='false')
subprocess.run([str(tools/'dotnet/dotnet'),str(compiler)]+csharp_arguments(refs,web),env=env,check=True)
resources();bin=next(tools.glob('llvm-mingw-*/bin'));clang=str(bin/'x86_64-w64-mingw32-clang++')
includes=['-I'+str(p) for p in sorted({p.parent for p in (sdk/'illustratorapi').rglob('*.h')})]
assert includes,'Official SDK missing'
subprocess.run([clang,'-std=c++17','-DWIN_ENV=1','-DAI_HAS_NOEXCEPT=1','-DAI_AUTO_SUITE_AVAILABLE=0','-Wno-multichar','-Wno-pragma-pack','-fsyntax-only']+includes+[str(ROOT/'windows/tests/sdk-abi-check.cpp')],check=True)
subprocess.run([str(bin/'x86_64-w64-mingw32-windres'),'-i','plugin.rc','-o','plugin-resource.o'],cwd=BUILD,check=True)
builtins=list(bin.parent.glob('lib/clang/*/lib/windows/libclang_rt.builtins-x86_64.a'))
subprocess.run([clang,'-std=c++17','-O2','-DZX_NO_CRT','-fno-builtin','-fno-exceptions','-fno-rtti','-shared','-nostdlib','-Wl,--entry,DllMain',str(ROOT/'windows/src/PluginMain.cpp'),str(BUILD/'plugin-resource.o')]+[str(p) for p in builtins]+['-lbcrypt','-lshell32','-luser32','-lkernel32','-o',str(BUILD/'字醒.aip')],check=True)
manifest(files,'LLVM-MinGW; no CRT for native bootstrap',True)
print(BUILD/'字醒.aip')
