from pathlib import Path
import hashlib,json,struct,zipfile
VERSION='2.1.0-beta3'
ROOT=Path(__file__).resolve().parents[2]
BUILD=ROOT/'windows/build'
def payload(web):
 BUILD.mkdir(parents=True,exist_ok=True)
 files={p.relative_to(ROOT/'windows/resources').as_posix():p for p in (ROOT/'windows/resources').rglob('*') if p.is_file() and p.name!='.DS_Store'}
 for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']:files[name]=web/'lib/net462'/name
 files['WebView2Loader.dll']=web/'runtimes/win-x64/native/WebView2Loader.dll'
 with zipfile.ZipFile(BUILD/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
  for name,path in sorted(files.items()):z.write(path,name)
 return files
def csharp_arguments(refs,web):
 references=['mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','System.IO.Compression','System.IO.Compression.FileSystem','System.Web.Extensions','Microsoft.CSharp']
 args=['-nologo','-noconfig','-nostdlib+','-target:winexe','-platform:x64','-langversion:latest','-optimize+','-out:'+str(BUILD/'ZiXingPanel.exe'),'-resource:'+str(BUILD/'payload.zip')+',ZiXing.Payload']
 args+=['-r:'+str(refs/(name+'.dll')) for name in references]
 args+=['-r:'+str(web/'lib/net462'/name) for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll']]
 return args+[str(p) for p in sorted((ROOT/'windows/src').glob('*.cs'))]
def resources():
 props=[(b'kind',b'SPEA'),(b'ivrs',struct.pack('>I',2)),(b'wx86',b'PluginMain'+bytes(4)),(b'pinm',b'ZiXing')]
 data=struct.pack('>III',1,0,len(props))
 for key,value in props:
  value+=bytes((-len(value))%4);data+=b'ADBE'+key+struct.pack('>II',0,len(value))+value
 (BUILD/'plugin.pipl').write_bytes(data)
 (BUILD/'plugin.rc').write_text('#include <windows.h>\nplugin pipl "plugin.pipl"\n101 RCDATA "ZiXingPanel.exe"\n1 VERSIONINFO\nFILEVERSION 2,1,0,3\nPRODUCTVERSION 2,1,0,3\nFILEOS VOS_NT_WINDOWS32\nFILETYPE VFT_DLL\nBEGIN\n BLOCK "StringFileInfo"\n BEGIN\n  BLOCK "040904b0"\n  BEGIN\n   VALUE "FileDescription", "ZiXing Windows native test plug-in\\0"\n   VALUE "FileVersion", "'+VERSION+'\\0"\n  END\n END\nEND\n')
def manifest(files,compiler,abi_checked):
 data={'version':VERSION,'platform':'Windows x64','compiler':compiler,'sdkAbiChecked':abi_checked,'buildOnly':True,'windowsIllustratorTested':False,'bootstrap':'C-facing menu/access suites; no Unicode suite dependency','assets':{n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in sorted(files.items())},'aipSHA256':hashlib.sha256((BUILD/'字醒.aip').read_bytes()).hexdigest()}
 (BUILD/'build-manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
