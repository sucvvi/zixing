'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),EventEmitter=require('node:events');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.events={};this.style={};this.className='';this._text='';this._value='';this.disabled=false;this.checked=false;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text;}
 set value(v){this._value=v;}get value(){return this._value;}
 appendChild(v){this.children.push(v);return v;}setAttribute(k,v){this[k]=v;}
 addEventListener(k,f){(this.events[k]||(this.events[k]=[])).push(f);}fire(k){for(const f of this.events[k]||[])f({target:this});}
}
async function settle(){for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));}
async function setup(options={}){
 const ids=['capture','rebuild','mergeText','status','matchProgress','fontList','review','count','lines','matchFonts','reloadFonts','language','hideOriginals','version'];
 const els=Object.fromEntries(ids.map(id=>[id,new Element('div')]));els.language.value='zh';els.hideOriginals.checked=true;
 const document={getElementById:id=>els[id],createElement:tag=>new Element(tag)};
 const capture=JSON.parse(fs.readFileSync(path.join(__dirname,'capture-result.json'),'utf8')).data;
 const fonts=[{name:'PingFangSC-Regular',family:'苹方',style:'常规'},{name:'Helvetica',family:'Helvetica',style:'Regular'},{name:'FENG-SHAN-BEI-CUAN-TI',family:'峰山碑爨体',style:'Regular'}];
 const source=options.ocr||[{text:'中文测试',x:.1,y:.5,width:.5,height:.2,confidence:.9,stable:true,angle:0,preview:''}];
 const calls=[],matchRequests=[],processes=[];
 const bridge={getSystemPath:()=>'/extension',evalScript:(code,cb)=>{
  const args=JSON.parse('['+code.slice(code.indexOf('(')+1,-1)+']'),action=args[0],payload=JSON.parse(decodeURIComponent(args[1]));calls.push({action,payload});
  if(action==='mergeText'&&options.mergeError){cb(JSON.stringify({ok:false,error:options.mergeError}));return;}
  cb(JSON.stringify({ok:true,data:{ping:{version:'30.8.2'},fonts,capture,mergeText:{count:3},rebuild:{count:payload.lines?payload.lines.length:0}}[action]}));
 }};
 let request;
 const modules={fs:{mkdtempSync:()=>'/tmp/test',readdirSync:()=>[],rmdirSync:()=>{},readFileSync:()=>({toString:()=>''}),writeFileSync:(p,data)=>{request=JSON.parse(data);}},path,os:{platform:()=>'darwin',tmpdir:()=>'/tmp'},child_process:{
  execFile:(bin,args,opts,cb)=>cb(null,JSON.stringify({ok:true,lines:args[0]==='--glyph'?(options.glyph||source):source}),''),
  spawn:()=>{matchRequests.push(request);const proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stderr=new EventEmitter();proc.kill=()=>{};processes.push(proc);proc.complete=()=>{
   proc.stdout.emit('data',Buffer.from(JSON.stringify({type:'result',ok:true,rows:request.lines.map((l,index)=>({index,original:'',candidates:options.candidates||[{name:'PingFangSC-Regular',similarity:.93,preview:''},{name:'Helvetica',similarity:.4,preview:''}]}))})+'\n'));proc.emit('close',0);
  };if(!options.deferMatch)queueMicrotask(proc.complete);return proc;}
 }};
 const ctx=vm.createContext({window:{__adobe_cep__:bridge,cep_node:{require:n=>modules[n]},addEventListener:()=>{}},document,ReviveCore:require('../extension/js/core.js'),Promise,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/js/panel.js'),'utf8'),ctx);await settle();
 return {els,calls,matchRequests,processes,async capture(){els.capture.fire('click');await settle();},row(i=0){const r=els.lines.children[i];return {state:r.children[1].children[0],note:r.children[2].children[5],input:r.children[0].children[1],confirm:r.children[1].children[1],check:r.children[0].children[0],select:r.children[2].children[1],manual:r.children[2].children[2]};}};
}
test('31-point font and unreviewed content are never applied automatically',async()=>{
 const q=await setup({ocr:[{text:'我官代羲紅勇新',x:.1,y:.5,width:.5,height:.2,confidence:.3,stable:false}],candidates:[{name:'Helvetica',similarity:.31,preview:''}]});
 await q.capture();assert.equal(q.matchRequests.length,1);assert.equal(q.els.rebuild.disabled,true);
 q.row().input.value='滚滚长江东逝水';q.row().input.fire('input');q.row().confirm.fire('click');q.els.matchFonts.fire('click');await settle();
 assert.equal(q.row().select.value,'');assert.equal(q.els.rebuild.disabled,true);
 q.els.rebuild.fire('click');await settle();assert.equal(q.calls.filter(c=>c.action==='rebuild').length,0);
 q.row().manual.value='FENG-SHAN-BEI-CUAN-TI';q.row().manual.fire('change');assert.equal(q.els.rebuild.disabled,false);
});
test('artistic font is found automatically after text correction with no known-font field',async()=>{
 const wrong={text:'我官代羲紅勇新',x:.1,y:.5,width:.5,height:.2,confidence:.3,stable:false};
 const q=await setup({ocr:[wrong],candidates:[{name:'FENG-SHAN-BEI-CUAN-TI',similarity:.684,preview:''},{name:'Helvetica',similarity:.309,preview:''}]});
 await q.capture();assert.equal(q.els.fontHint,undefined);assert.equal(q.matchRequests.length,1);
 q.row().input.value='滚滚长江东逝水';q.row().input.fire('input');q.row().input.fire('change');await settle();
 assert.equal(q.matchRequests.at(-1).lines[0].text,'滚滚长江东逝水');assert.equal(q.row().select.value,'FENG-SHAN-BEI-CUAN-TI');
 assert.equal(q.els.rebuild.disabled,false);q.els.rebuild.fire('click');await settle();
 const payload=q.calls.find(c=>c.action==='rebuild').payload;assert.equal(payload.lines[0].font,'FENG-SHAN-BEI-CUAN-TI');assert.equal(payload.lines[0].text,'滚滚长江东逝水');
});
test('ordinary font candidates are available and applied even when OCR asks for review',async()=>{
 const q=await setup({ocr:[{text:'自动字体测试',x:.1,y:.5,width:.5,height:.2,confidence:.5,stable:false}]});
 await q.capture();assert.equal(q.matchRequests.length,1);assert.equal(q.row().select.value,'PingFangSC-Regular');assert.equal(q.els.rebuild.disabled,false);
});
test('conservative OCR scores do not block matching when the two OCR passes agree',async()=>{
 const q=await setup({ocr:[{text:'普通字体测试',x:.1,y:.5,width:.5,height:.2,confidence:.5,stable:false,ocrAgreed:true}],candidates:[{name:'PingFangSC-Regular',similarity:.85,preview:''},{name:'Helvetica',similarity:.6,preview:''}]});
 await q.capture();assert.equal(q.row().select.value,'PingFangSC-Regular');assert.equal(q.els.rebuild.disabled,false);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../extension/index.html'),'utf8'),/id=["']fontHint/);
});
test('confident rows preserve per-line fonts, and partial recovery never hides all originals',async()=>{
 const row={text:'中文测试',x:.1,y:.5,width:.5,height:.2,confidence:.95,stable:true};const q=await setup({ocr:[row,Object.assign({},row,{text:'第二行',y:.2})]});await q.capture();assert.equal(q.els.rebuild.disabled,false);
 q.row(1).check.checked=false;q.row(1).check.fire('change');q.els.rebuild.fire('click');await settle();const request=q.calls.find(c=>c.action==='rebuild').payload;
 assert.equal(request.lines.length,1);assert.equal(request.lines[0].font,'PingFangSC-Regular');assert.equal(request.hideOriginals,false);assert.equal(q.els.rebuild.disabled,true);
});

test('font comparison stays visible at the top and rows show pending until completion',async()=>{
 const row={text:'中文测试',x:.1,y:.5,width:.5,height:.2,confidence:.95,stable:true};
 const q=await setup({deferMatch:true,ocr:[row,Object.assign({},row,{text:'第二行',y:.2})]});
 await q.capture();
 assert.equal(q.els.matchProgress.hidden,false);assert.equal(q.els.matchProgress.value,0);
 for(let i=0;i<2;i++){
  assert.equal(q.row(i).state.textContent,'正在比较字体…');
  assert.equal(q.row(i).select.children[0].textContent,'正在比较字体…');
  assert.equal(q.row(i).note.textContent,'正在比较本机字体，请稍候。');
 }
 q.processes[0].stdout.emit('data',Buffer.from(JSON.stringify({type:'progress',line:'2',lines:'2',done:'50',total:'100'})+'\n'));
 assert.equal(q.els.status.textContent,'比较第 2/2 行字体…');assert.equal(q.els.matchProgress.value,75);
 q.processes[0].complete();await settle();
 assert.equal(q.els.matchProgress.hidden,true);assert.equal(q.row().select.value,'PingFangSC-Regular');
 assert.equal(q.els.rebuild.disabled,false);
 const html=fs.readFileSync(path.join(__dirname,'../extension/index.html'),'utf8');
 assert.ok(html.indexOf('id="status"')<html.indexOf('id="review"'));
 assert.match(fs.readFileSync(path.join(__dirname,'../extension/style.css'),'utf8'),/\.activity\{position:sticky;top:0/);
});
test('interrupted comparison clears the progress and offers retry instead of no-match',async()=>{
 const q=await setup({deferMatch:true});await q.capture();q.processes[0].emit('close',1);await settle();
 assert.equal(q.els.matchProgress.hidden,true);assert.equal(q.els.status.className,'error');
 assert.equal(q.row().state.textContent,'字体比较未完成，请重试');assert.match(q.row().note.textContent,/重试/);
 assert.equal(q.els.matchFonts.disabled,false);
});

test('merge works without OCR and resets stale recovery results after success',async()=>{
 const q=await setup();assert.equal(q.els.mergeText.disabled,false);
 q.els.mergeText.fire('click');assert.equal(q.els.capture.disabled,true);assert.equal(q.els.mergeText.disabled,true);await settle();
 assert.equal(q.calls.filter(c=>c.action==='mergeText').length,1);assert.equal(q.matchRequests.length,0);
 assert.equal(q.els.status.className,'success');assert.match(q.els.status.textContent,/3 个文本框合并为 1 个/);
 await q.capture();assert.equal(q.els.rebuild.disabled,false);q.els.mergeText.fire('click');await settle();
 assert.equal(q.els.review.hidden,true);assert.equal(q.els.rebuild.disabled,true);assert.equal(q.els.mergeText.disabled,false);
});
test('failed merge keeps the existing recovery session and displays the host error',async()=>{
 const q=await setup({mergeError:'请用选择工具选中至少两个可编辑文本框。'});await q.capture();
 q.els.mergeText.fire('click');await settle();
 assert.equal(q.els.status.className,'error');assert.match(q.els.status.textContent,/至少两个/);
 assert.equal(q.els.review.hidden,false);assert.equal(q.els.rebuild.disabled,false);
});
