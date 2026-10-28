const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const sent=[],window={webkit:{messageHandlers:{zixing:{postMessage:m=>sent.push(m)}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../resources/web/js/native-runtime.js'),'utf8'),{window,Promise,Uint8Array,TextDecoder,atob});
 return {window,sent,deliver:value=>window.__zixingDeliver(Buffer.from(JSON.stringify(value)).toString('base64'))};
}
test('native transport preserves Chinese payloads, progress, completion and concurrent request identity',async()=>{
 const q=setup(),progress=[];
 const one=q.window.ZiXingNative.request('match',{lines:[{text:'滚滚长江东逝水'}]},v=>progress.push(v));
 const two=q.window.ZiXingNative.request('host',{action:'ping'});
 const a=q.sent[0].id,b=q.sent[1].id;assert.notEqual(a,b);
 assert.equal(q.sent[0].payload.lines[0].text,'滚滚长江东逝水');
 q.deliver({id:a,event:'progress',data:{line:1,done:50,total:100}});
 q.deliver({id:b,ok:true,data:{version:'30.8.2'}});q.deliver({id:a,ok:true,data:{font:'峰山碑爨体'}});
 assert.equal((await two).version,'30.8.2');assert.equal((await one).font,'峰山碑爨体');assert.equal(progress.length,1);
 q.deliver({id:a,event:'progress',data:{done:100}});assert.equal(progress.length,1);
});
test('native host errors reject the matching request and unrelated replies are ignored',async()=>{
 const q=setup(),pending=q.window.ZiXingNative.request('host',{action:'mergeText'});
 q.deliver({id:'not-a-request',ok:true,data:{}});
 q.deliver({id:q.sent[0].id,ok:false,error:'请先选中两个文本框。'});
 await assert.rejects(pending,/请先选中两个文本框/);
});
test('native panel has no dependency on CEP, Node.js, external network or external helper locations',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../resources/web/js/panel.js'),'utf8');
 assert.doesNotMatch(js,/__adobe_cep__|cep_node|child_process|mkdtempSync|execFile|fs\./);
 const html=fs.readFileSync(path.join(__dirname,'../resources/web/index.html'),'utf8');
 assert.match(html,/connect-src 'none'/);assert.match(html,/native-runtime\.js/);assert.match(html,/mergeText/);
});
