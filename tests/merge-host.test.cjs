'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../extension/host/main.jsx'),'utf8');
function setup(samples,options={}){
 const doc={frames:[],layers:[],typename:'Document'},sources=[];let selected=[],copies=0;
 Object.defineProperty(doc,'selection',{get:()=>selected,set:v=>{selected=v||[];}});
 function makeFrame(sample,layer){
  const f={typename:'TextFrame',parent:layer,editable:true,kind:sample.kind||1,orientation:sample.orientation||1,
   opacity:100,blendingMode:'normal',matrix:{mValueA:1,mValueB:0,mValueC:0,mValueD:1},
   geometricBounds:sample.bounds||[50,300,150,280],anchor:sample.anchor||[50,280],locked:false};
  let hidden=false;
  Object.defineProperty(f,'hidden',{get:()=>hidden,set:v=>{if(v&&sample.failHide)throw Error('cannot hide');hidden=v;}});
  Object.defineProperty(f,'selected',{set:v=>{if(v&&selected.indexOf(f)<0)selected.push(f);}});
  for(const p of ['nextFrame','previousFrame'])Object.defineProperty(f,p,{get:()=>{if(f.kind===1)throw Error('property unavailable for point text');return sample.linked?{}:null;}});
  const anchor=f.anchor.slice();Object.defineProperty(f,'anchor',{get:()=>anchor,set:()=>{throw Error('Not implemented');}});
  f.translate=(x,y)=>{anchor[0]+=x;anchor[1]+=y;};
  f.characters=[];
  Object.defineProperty(f,'contents',{get:()=>f.characters.map(c=>c.contents).join(''),set:text=>{
   f.characters.length=0;for(const ch of text)f.characters.push({contents:ch,characterAttributes:{textFont:sample.font||'A',size:sample.size||20,fillColor:sample.color||'black'}});
  }});
  f.contents=sample.text||'';
  f.lines=[{characterAttributes:{},characters:f.characters}];
  f.characters.add=text=>{for(const ch of text)f.characters.push({contents:ch,characterAttributes:{size:20}});};
  const paras=[];
  Object.defineProperty(f,'paragraphs',{get:()=>{const n=f.contents.split('\r').length;while(paras.length<n)paras.push({characterAttributes:{},paragraphAttributes:{}});return paras.slice(0,n);}});
  f.textRange={frame:f,duplicate:target=>{
   if(options.failCopy&&++copies===2)throw Error('copy failed');
   for(const c of f.characters)target.frame.characters.push({contents:c.contents,characterAttributes:{...c.characterAttributes}});
  }};
  doc.frames.push(f);return f;
 }
 doc.layers.add=()=>{
  const layer={typename:'Layer',parent:doc,visible:true,locked:false,textFrames:{}};
  layer.textFrames.add=()=>makeFrame({},layer);
  layer.remove=()=>{doc.frames=doc.frames.filter(f=>f.parent!==layer);doc.layers.splice(doc.layers.indexOf(layer),1);};
  doc.layers.push(layer);return layer;
 };
 const originalLayer=doc.layers.add();
 for(const sample of samples){if(sample.shape){sources.push({typename:'PathItem',parent:originalLayer});continue;}sources.push(makeFrame(sample,originalLayer));}
 selected=sources.slice();
 const ctx=vm.createContext({app:{documents:[doc],activeDocument:doc,redraw:()=>{if(options.failRedraw)throw Error('redraw failed');}},
  TextType:{POINTTEXT:1,AREATEXT:2,PATHTEXT:3},TextOrientation:{HORIZONTAL:1},ElementPlacement:{PLACEATEND:1}});
 vm.runInContext(source,ctx);
 return {doc,sources,run:()=>JSON.parse(ctx.TextRevive.dispatch('mergeText','%7B%7D'))};
}
test('merge follows geometry instead of selection order and preserves rich character styling',()=>{
 const q=setup([{text:'第二行',font:'B',size:30,color:'red',anchor:[50,220],bounds:[50,245,170,215]},
  {text:'第一行',font:'A',size:20,anchor:[50,280],bounds:[50,300,150,280]}]);
 q.sources[0].characters[1].characterAttributes.textFont='Mixed';
 const r=q.run();assert.equal(r.ok,true);assert.equal(r.data.count,2);
 const out=q.doc.selection[0];assert.equal(q.doc.selection.length,1);assert.equal(out.contents,'第一行\r第二行');
 assert.equal(out.characters[0].characterAttributes.textFont,'A');
 assert.equal(out.characters[4].characterAttributes.textFont,'B');assert.equal(out.characters[5].characterAttributes.textFont,'Mixed');
 assert.equal(out.characters[4].characterAttributes.size,30);assert.equal(out.characters[4].characterAttributes.fillColor,'red');
 assert.ok(q.sources.every(f=>f.hidden));assert.equal(out.paragraphs[1].characterAttributes.leading,60);
});
test('same-line English gets a word space, Chinese fragments stay together, separate rows keep breaks',()=>{
 const q=setup([{text:'world',anchor:[120,280],bounds:[120,300,170,280]},
  {text:'第二',anchor:[50,220],bounds:[50,240,90,220]}, {text:'Hello',anchor:[50,280],bounds:[50,300,100,280]},
  {text:'行',anchor:[100,220],bounds:[100,240,120,220]}]);
 assert.equal(q.run().ok,true);assert.equal(q.doc.selection[0].contents,'Hello world\r第二行');
});
test('internal paragraph breaks and trailing breaks are preserved without adding empty paragraphs',()=>{
 const q=setup([{text:'甲\r乙\r',anchor:[50,280]}, {text:'丙',anchor:[50,180]}]);
 assert.equal(q.run().ok,true);assert.equal(q.doc.selection[0].contents,'甲\r乙\r丙');
});
test('text-only nested groups and independent area text are accepted',()=>{
 const q=setup([{text:'上行',kind:2,anchor:[50,280],bounds:[50,300,150,270]}, {text:'下行',anchor:[50,220]}]);
 const group={typename:'GroupItem',parent:q.sources[0].parent,pageItems:[]};
 const child={typename:'GroupItem',parent:group,pageItems:[q.sources[1]]};
 q.sources[0].parent=group;q.sources[1].parent=child;group.pageItems=[q.sources[0],child];q.doc.selection=[group];
 assert.equal(q.run().ok,true);assert.equal(q.doc.selection[0].contents,'上行\r下行');
});
test('invalid selections fail before modifying any text',()=>{
 for(const samples of [[{text:'only'}],[{text:'a'},{shape:true}],[{text:'a'},{text:'b',orientation:2}],
  [{text:'a'},{text:'b',kind:3}],[{text:'a'},{text:'b',kind:2,linked:true}],[{text:'a'},{text:''}]]){
  const q=setup(samples),before=q.doc.frames.length;
  assert.equal(q.run().ok,false);assert.equal(q.doc.frames.length,before);assert.equal(q.doc.layers.length,1);
  assert.ok(q.sources.every(f=>!f.hidden));
 }
});
test('copy or commit errors remove partial output and restore originals and selection',()=>{
 for(const options of [{failCopy:true},{failRedraw:true}]){
  const q=setup([{text:'a'},{text:'b',anchor:[50,220]}],options);assert.equal(q.run().ok,false);
  assert.equal(q.doc.frames.length,2);assert.equal(q.doc.layers.length,1);assert.ok(q.sources.every(f=>!f.hidden));
  assert.deepEqual(q.doc.selection,q.sources);
 }
 const q=setup([{text:'a'},{text:'b',anchor:[50,220],failHide:true}]);assert.equal(q.run().ok,false);
 assert.ok(q.sources.every(f=>!f.hidden));assert.equal(q.doc.frames.length,2);
});
