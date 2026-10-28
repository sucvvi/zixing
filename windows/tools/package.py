#!/usr/bin/env python3
"""Package only the already built, verified Windows experimental release."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(root/'windows/tests/verify-package.py')],check=True)
name='字醒-v2.1.0-beta1-Windows-x64'
release=root/'发布'/name
release.mkdir(parents=True,exist_ok=True)
files={
 '字醒.aip':root/'windows/build/字醒.aip',
 '使用说明.txt':root/'windows/使用说明.txt',
 'Windows测试清单.txt':root/'windows/Windows测试清单.txt',
 '创建测试样稿.jsx':root/'windows/创建测试样稿.jsx',
 '验证报告.md':root/'windows/验证报告.md',
 'build-manifest.json':root/'windows/build/build-manifest.json',
 'package-verification.json':root/'windows/build/package-verification.json',
 'offline-ocr-observed.json':root/'windows/tests/offline-ocr-observed.json',
 'OCR-MODELS.txt':root/'windows/resources/OCR-MODELS.txt',
}
for path in (root/'windows/resources/licenses').iterdir():
 if path.is_file():files['第三方许可/'+path.name]=path
for name_,source in files.items():
 dest=release/name_;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
digest=hashlib.sha256((release/'字醒.aip').read_bytes()).hexdigest()
(release/'SHA256.txt').write_text(digest+'  字醒.aip\n',encoding='utf-8')
archive=root/'发布'/(name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for path in sorted(release.rglob('*')):
  if path.is_file():z.write(path,path.relative_to(release.parent).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert hashlib.sha256(z.read(name+'/字醒.aip')).hexdigest()==digest
 assert not any('.DS_Store' in n or '/illustratorapi/' in n for n in z.namelist())
print(json.dumps({'archive':str(archive),'size':archive.stat().st_size,'aipSHA256':digest,'windowsIllustratorTested':False},ensure_ascii=False,indent=2))
