'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../extension/js/core.js');
test('font selection stays independent of OCR review and rejects unreliable scores',()=>{
  assert.equal(core.chooseFont({reviewed:true},[{name:'wrong',similarity:.31}]),'');
  assert.equal(core.chooseFont({reviewed:false},[{name:'unverified',similarity:.99}]),'unverified');
  assert.equal(core.chooseFont({reviewed:true},[{name:'a',similarity:.9},{name:'b',similarity:.89}]),'a');
  assert.equal(core.chooseFont({reviewed:true},[{name:'FENG-SHAN-BEI-CUAN-TI',similarity:.684},{name:'other',similarity:.309}]),'FENG-SHAN-BEI-CUAN-TI');
  assert.equal(core.chooseFont({reviewed:true},[{name:'Helvetica-Bold',similarity:.8186},{name:'HelveticaNeue-Bold',similarity:.8104}]),'Helvetica-Bold');
  assert.equal(core.chooseFont({reviewed:true},[{name:'a',similarity:.93},{name:'b',similarity:.5}]),'a');
});

test('CEP browser receives ReviveCore even when Node module globals are present', () => {
  const ctx = vm.createContext({window:{},module:{exports:{}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/js/core.js'),'utf8'),ctx);
  assert.equal(typeof ctx.window.ReviveCore.validateLines, 'function');
  assert.equal(Object.keys(ctx.module.exports).length,0);
});

test('Vision bottom-left boxes map to Illustrator top-left points, including negative artboard coordinates', () => {
  assert.deepEqual(core.toRect({x:.25,y:.25,width:.5,height:.5}, [-200,300,200,-100]), [-100,200,200,200]);
  assert.deepEqual(core.toRect({x:0,y:0,width:1,height:1}, [10,20,110,-30]), [10,20,100,50]);
});
test('reject unsafe geometry, multiline input, unsupported rotation and empty selection', () => {
  const line = {text:'中文 Aa 123',x:.1,y:.1,width:.5,height:.1,angle:0};
  assert.equal(core.validateLines([line], [0,100,200,0])[0].text, line.text);
  for (const patch of [{x:NaN},{width:-1},{x:.9},{text:'a\nb'},{text:' '},{angle:90}]) {
    assert.throws(() => core.validateLines([Object.assign({},line,patch)], [0,100,200,0]));
  }
  assert.throws(() => core.validateLines([], [0,100,200,0]));
});
test('host parses data without evaluating code, rejects malformed JSON and prototype keys', () => {
  const context = vm.createContext({app:{version:'30.8.2',name:'Illustrator'}, flag:false});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/host/main.jsx'),'utf8'), context);
  const dispatch = (text) => JSON.parse(context.TextRevive.dispatch('ping', encodeURIComponent(text)));
  assert.equal(dispatch('{"text":"\\u4e2d文 \\" \\\\ / 😀"}').ok, true);
  for (const bad of ['{"x":(flag=true)}','{"x":1} trailing','{"__proto__":{}}','{"x":"\\q"}','{"x":01}']) {
    assert.equal(dispatch(bad).ok, false);
  }
  assert.equal(context.flag, false);
  assert.equal(JSON.parse(context.TextRevive.dispatch('rebuild','%7B%7D')).ok, false);
});
