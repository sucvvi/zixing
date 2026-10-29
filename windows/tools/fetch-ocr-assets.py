#!/usr/bin/env python3
"""Fetch pinned upstream OCR assets for source builds; release AIPs already embed them."""
from pathlib import Path
import gzip,hashlib,io,json,tarfile,urllib.request
root=Path(__file__).resolve().parents[2]
destination=root/'windows/resources/web/ocr'
records=json.loads(Path(__file__).with_name('ocr-assets.json').read_text(encoding='utf-8'))
downloads={}
for item in records:
    url=item['url']
    if url not in downloads:
        with urllib.request.urlopen(url,timeout=90) as response:
            downloads[url]=response.read()
    raw=downloads[url]
    if 'member' in item:
        with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
            member=archive.extractfile(item['member'])
            if member is None:raise ValueError('Missing upstream asset: '+item['member'])
            raw=member.read()
    if hashlib.sha256(raw).hexdigest()!=item['sha256']:
        raise ValueError('Upstream asset hash mismatch: '+item['path'])
    output=(destination/item['path']).resolve()
    if destination.resolve() not in output.parents:raise ValueError('Invalid asset path')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(gzip.compress(raw,mtime=0) if item.get('gzip') else raw)
    print('Verified '+item['path'])
