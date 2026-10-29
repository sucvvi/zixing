#!/usr/bin/env python3
"""Build using MSVC on Windows, after running VS DevCmd for x64."""
from pathlib import Path
import hashlib,os,shutil,subprocess,urllib.request,zipfile
from build_support import ROOT,BUILD,payload,csharp_arguments,resources,manifest
assert os.name=='nt','This build must run on Windows'
tools=ROOT/'windows/deps';web=tools/'webview2';tools.mkdir(parents=True,exist_ok=True)
package=tools/'webview2.nupkg'
if not package.exists():
 with urllib.request.urlopen('https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg',timeout=90) as r:package.write_bytes(r.read())
assert hashlib.sha256(package.read_bytes()).hexdigest()=='90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4','WebView2 package hash mismatch'
with zipfile.ZipFile(package) as z:z.extractall(web)
subprocess.run(['python',str(ROOT/'windows/tools/fetch-ocr-assets.py')],check=True)
files=payload(web)
refs=Path(os.environ['ProgramFiles(x86)'])/'Reference Assemblies/Microsoft/Framework/.NETFramework/v4.8'
csc=Path(os.environ['VSINSTALLDIR'])/'MSBuild/Current/Bin/Roslyn/csc.exe'
assert csc.is_file() and (refs/'mscorlib.dll').is_file(),'VS compiler or .NET 4.8 reference assemblies missing'
subprocess.run([str(csc)]+csharp_arguments(refs,web),check=True)
resources()
subprocess.run(['rc.exe','/nologo','/fo','plugin.res','plugin.rc'],cwd=BUILD,check=True)
subprocess.run(['cl.exe','/nologo','/utf-8','/O2','/MT','/EHsc','/LD',str(ROOT/'windows/src/PluginMain.cpp'),'plugin.res','/link','bcrypt.lib','shell32.lib','user32.lib','kernel32.lib','/OUT:字醒.aip'],cwd=BUILD,check=True)
subprocess.run(['cl.exe','/nologo','/utf-8','/O2','/MT','/EHsc',str(ROOT/'windows/tests/loader-smoke.cpp'),'/Fe:loader-smoke.exe'],cwd=BUILD,check=True)
manifest(files,'Microsoft Visual C++ (MSVC), static /MT runtime',False)
subprocess.run([str(BUILD/'loader-smoke.exe'),str(BUILD/'字醒.aip')],check=True)
subprocess.run(['python',str(ROOT/'windows/tests/verify-package.py')],check=True)
print(BUILD/'字醒.aip')
