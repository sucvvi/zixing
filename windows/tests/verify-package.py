from pathlib import Path
import struct,io,zipfile,hashlib,json
root=Path(__file__).resolve().parents[2];build=root/'windows/build'
class PE:
 def __init__(self,data):
  self.data=data;assert data[:2]==b'MZ';self.pe=struct.unpack_from('<I',data,0x3c)[0];assert data[self.pe:self.pe+4]==b'PE\0\0'
  self.machine,self.sections=struct.unpack_from('<HH',data,self.pe+4);self.opt=self.pe+24;assert struct.unpack_from('<H',data,self.opt)[0]==0x20b
  size=struct.unpack_from('<H',data,self.pe+20)[0];self.table=self.opt+size
 def rva(self,r):
  for i in range(self.sections):
   p=self.table+i*40;vs,va,rs,raw=struct.unpack_from('<IIII',self.data,p+8)
   if va<=r<va+max(vs,rs):return raw+r-va
  raise ValueError('RVA outside PE sections')
 def directory(self,n):return struct.unpack_from('<II',self.data,self.opt+112+8*n)
 def string(self,p):return self.data[p:self.data.index(0,p)].decode('ascii')
 def exports(self):
  r,size=self.directory(0);p=self.rva(r);n=struct.unpack_from('<I',self.data,p+24)[0];names=self.rva(struct.unpack_from('<I',self.data,p+32)[0]);return [self.string(self.rva(struct.unpack_from('<I',self.data,names+4*i)[0])) for i in range(n)]
 def imports(self):
  r,size=self.directory(1);p=self.rva(r);out=[]
  while any(self.data[p:p+20]):out.append(self.string(self.rva(struct.unpack_from('<I',self.data,p+12)[0])));p+=20
  return out
 def resources(self):
  r,size=self.directory(2);base=self.rva(r);out={}
  def visit(offset,keys):
   pos=base+offset;n1,n2=struct.unpack_from('<HH',self.data,pos+12)
   for i in range(n1+n2):
    name,target=struct.unpack_from('<II',self.data,pos+16+i*8)
    if name&0x80000000:
     p=base+(name&0x7fffffff);n=struct.unpack_from('<H',self.data,p)[0];name=self.data[p+2:p+2+2*n].decode('utf-16le')
    if target&0x80000000:visit(target&0x7fffffff,keys+[name])
    else:
     addr,length=struct.unpack_from('<II',self.data,base+target);start=self.rva(addr);out[tuple(keys+[name])]=self.data[start:start+length]
  visit(0,[]);return out
plugin=PE((build/'字醒.aip').read_bytes());assert plugin.machine==0x8664;assert 'PluginMain' in plugin.exports()
resources=plugin.resources();exe=next(v for k,v in resources.items() if k[0]==10 and k[1]==101);assert exe==(build/'ZiXingPanel.exe').read_bytes();panel=PE(exe);assert panel.machine==0x8664 and panel.directory(14)[0]
pipl=next(v for k,v in resources.items() if str(k[0]).upper()=='PIPL');assert pipl==(build/'plugin.pipl').read_bytes();assert b'wx86' in pipl and b'PluginMain' in pipl and b'mi32' not in pipl
imports=plugin.imports();assert not any(x.lower() in ['libc++.dll','libc++-1.dll','libwinpthread-1.dll','msvcp140.dll','vcruntime140.dll'] for x in imports),imports
payload=(build/'payload.zip').read_bytes();assert payload in exe
manifest=json.loads((build/'build-manifest.json').read_text())
assert hashlib.sha256(plugin.data).hexdigest()==manifest['aipSHA256']
with zipfile.ZipFile(io.BytesIO(payload)) as z:
 assert z.testzip() is None
 for n,digest in manifest['assets'].items():assert hashlib.sha256(z.read(n)).hexdigest()==digest,n
 for lang in ['eng','chi_sim','chi_tra']:assert 'web/ocr/lang/'+lang+'.traineddata.gz' in z.namelist()
 assert not any('illustratorapi/' in n or '.DS_Store' in n or n.endswith('.swift') for n in z.namelist())
result={'ok':True,'format':'PE32+ x64 DLL','exports':plugin.exports(),'imports':imports,'embeddedPanel':len(exe),'embeddedAssets':len(manifest['assets']),'windowsIllustratorTested':False}
(build/'package-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
