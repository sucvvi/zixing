(function(){
 'use strict';
 var channel=window.chrome&&window.chrome.webview;
 if(!channel)return;
 var next=0,pending=Object.create(null),worker=null,workerLanguage=null;
 window.__zixingDeliver=function(encoded){
  var bytes=Uint8Array.from(atob(encoded),function(c){return c.charCodeAt(0);});
  var message=JSON.parse(new TextDecoder().decode(bytes)),entry=pending[message.id];if(!entry)return;
  if(message.eventType==='progress'){if(entry.progress)entry.progress(message.data);return;}
  delete pending[message.id];if(message.ok)entry.resolve(message.data);else entry.reject(Error(message.error||'文档操作未完成。'));
 };
 function managed(method,payload,progress){return new Promise(function(resolve,reject){var id='r'+(++next);pending[id]={resolve:resolve,reject:reject,progress:progress};try{channel.postMessage({id:id,method:method,payload:payload||{}});}catch(e){delete pending[id];reject(e);}});}
 async function recognize(language){
  var result=await managed('image',{}),languages=language==='en'?'eng':'chi_sim+chi_tra+eng';
  if(worker&&workerLanguage!==languages){await worker.terminate();worker=null;}
  if(!worker){worker=await Tesseract.createWorker(languages,1,{workerPath:location.origin+'/ocr/worker.min.js',corePath:location.origin+'/ocr/core',langPath:location.origin+'/ocr/lang',workerBlobURL:false,cacheMethod:'none',legacyCore:false,legacyLang:false});workerLanguage=languages;await worker.setParameters({preserve_interword_spaces:'1'});}
  var data=(await worker.recognize(result.image)).data;
  var image=new Image();image.src=result.image;await image.decode();
  var width=image.naturalWidth,height=image.naturalHeight;
  var lines=(data.lines||[]).filter(function(line){return line.text.trim()&&line.confidence>=10;}).map(function(line){
   var b=line.bbox,x=Math.max(0,b.x0),top=Math.max(0,b.y0),w=Math.min(width,b.x1)-x,h=Math.min(height,b.y1)-top;
   var scale=Math.min(1,800/w,96/h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(image,x,top,w,h,0,0,canvas.width,canvas.height);
   return {text:line.text.trim(),confidence:line.confidence/100,x:x/width,y:1-(top+h)/height,width:w/width,height:h/height,angle:0,alternatives:[],preview:canvas.toDataURL('image/png').split(',')[1],method:'tesseract-lstm',stable:line.confidence>=90,ocrAgreed:false};
  });
  lines.sort(function(a,b){return Math.abs(a.y-b.y)>Math.min(a.height,b.height)*.5?b.y-a.y:a.x-b.x;});
  return {ok:true,width:width,height:height,languages:languages.split('+'),lines:lines};
 }
 window.ZiXingNative={request:function(method,payload,progress){return method==='ocr'?recognize((payload||{}).language):managed(method,payload,progress);}};
}());
