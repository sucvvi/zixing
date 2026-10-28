(function () {
  'use strict';
  var $=function(id){return document.getElementById(id);};
  var runtime=window.ZiXingNative,connected=false,capture=null,fonts=[],lines=[],controls=[],busy=false;
  function status(message,kind,progress){$('status').textContent=message;$('status').className=kind||'';$('matchProgress').hidden=progress===undefined;if(progress!==undefined)$('matchProgress').value=progress;}
  function fontName(value){
    value=(value||'').trim();
    var exact=fonts.filter(function(f){return f.name===value;})[0];
    if(exact)return exact.name;
    var named=fonts.filter(function(f){return (f.family+' · '+f.style)===value;});
    return named.length===1?named[0].name:'';
  }
  function label(name){var f=fonts.filter(function(f){return f.name===name;})[0];return f?f.family+' · '+f.style:name;}
  function buttons(){
    var chosen=lines.filter(function(l){return l.selected;});
    var ready=chosen.length>0&&chosen.every(function(l){return l.reviewed&&l.font;});
    $('capture').disabled=busy||!connected;$('rebuild').disabled=busy||!capture||!ready;
    $('mergeText').disabled=busy||!connected;
    $('rebuild').textContent=ready?'恢复 '+chosen.length+' 行文字':'恢复为可编辑文字';
    $('matchFonts').disabled=busy||!capture||!lines.some(function(l){return l.selected&&l.text.trim();});
    $('reloadFonts').disabled=busy||!connected;$('language').disabled=busy;
    controls.forEach(function(c){[c.input,c.check,c.confirm,c.select,c.manual].forEach(function(e){e.disabled=busy;});});
  }
  function host(action,payload){return runtime.request('host',{action:action,payload:payload||{}});}
  function cleanup(){if(runtime)runtime.request('cleanup',{}).catch(function(){});}
  function runOCR(){return runtime.request('ocr',{language:$('language').value});}
  function updateRow(i){
    var l=lines[i],c=controls[i],best=l.match&&l.match.candidates.filter(function(v){return v.name===l.font;})[0];
    c.row.className='row'+(!l.reviewed||!l.font?' pending':'');c.input.value=l.text;c.check.checked=l.selected;
    c.confirm.hidden=l.reviewed;c.state.textContent=l.matching?'正在比较字体…':l.matchError?'字体比较未完成，请重试':!l.reviewed?'文字需校对':l.font?'字体：'+label(l.font):'没有可靠字体，请手选';
    c.select.textContent='';var empty=document.createElement('option');empty.value='';empty.textContent=l.matching?'正在比较字体…':'选择字体';c.select.appendChild(empty);
    if(l.font&&!(l.match&&l.match.candidates.some(function(v){return v.name===l.font;}))){var chosen=document.createElement('option');chosen.value=l.font;chosen.textContent=label(l.font);c.select.appendChild(chosen);}
    if(l.match)l.match.candidates.forEach(function(v){var o=document.createElement('option');o.value=v.name;o.textContent=label(v.name)+(v.similarity<.75?'（差异较大）':'');c.select.appendChild(o);});
    c.select.value=l.font||'';c.manual.value=l.font||'';
    var original=l.preview||(l.match&&l.match.original)||'';
    c.compare.hidden=!original;c.original.src=original?'data:image/png;base64,'+original:'';
    c.proposed.hidden=!best;if(best)c.proposed.src='data:image/png;base64,'+best.preview;
    c.caption.textContent=best?'上：原稿；下：候选字形':'原稿字形';
    c.note.textContent=l.matching?'正在比较本机字体，请稍候。':l.matchError?'比较未完成，可点击“匹配字体”重试。':!l.reviewed?'字体候选已独立比较；请核对文字内容。':l.fontManual?'字体由你指定。':!l.font?'没有足够接近的候选，不会自动套用。':'候选仍需对照原稿。';
  }
  function summary(){var pending=lines.filter(function(l){return l.selected&&(!l.reviewed||!l.font);}).length;status(pending?pending+' 行待校对或选择字体。':'已就绪，请核对后恢复。',pending?'':'success');buttons();}
  function render(){
    $('review').hidden=false;$('count').textContent=lines.length+' 行文字';$('lines').textContent='';controls=[];
    lines.forEach(function(l,i){
      var row=document.createElement('div'),head=document.createElement('div');head.className='row-head';
      var check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','恢复第 '+(i+1)+' 行');
      var input=document.createElement('input');input.type='text';input.maxLength=2000;input.setAttribute('aria-label','第 '+(i+1)+' 行文字');
      head.appendChild(check);head.appendChild(input);row.appendChild(head);
      var meta=document.createElement('div');meta.className='row-meta';var state=document.createElement('span');state.className='row-state';
      var confirm=document.createElement('button');confirm.className='confirm';confirm.textContent='确认文字';meta.appendChild(state);meta.appendChild(confirm);row.appendChild(meta);
      var detail=document.createElement('details');detail.className='row-details';
      var title=document.createElement('summary');title.textContent='对照 / 更换字体';detail.appendChild(title);
      var select=document.createElement('select');select.setAttribute('aria-label','第 '+(i+1)+' 行字体');detail.appendChild(select);
      var manual=document.createElement('input');manual.className='manual-font';manual.setAttribute('list','fontList');manual.placeholder='或搜索本机字体';detail.appendChild(manual);
      var compare=document.createElement('div');compare.className='compare';var original=document.createElement('img');original.alt='原稿';var proposed=document.createElement('img');proposed.alt='候选';compare.appendChild(original);compare.appendChild(proposed);detail.appendChild(compare);
      var caption=document.createElement('p');caption.className='compare-label';detail.appendChild(caption);var note=document.createElement('p');note.className='hint';detail.appendChild(note);row.appendChild(detail);
      controls.push({row:row,input:input,check:check,state:state,confirm:confirm,detail:detail,select:select,manual:manual,compare:compare,original:original,proposed:proposed,caption:caption,note:note});
      input.addEventListener('input',function(){l.text=input.value;l.reviewed=!!input.value.trim();l.font='';l.fontManual=false;l.match=null;updateRow(i);summary();});
      input.addEventListener('change',function(){if(!busy&&capture&&l.text.trim()){busy=true;buttons();matchFonts(i).catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});}});
      check.addEventListener('change',function(){l.selected=check.checked;summary();});
      confirm.addEventListener('click',function(){if(!l.text.trim())return;l.reviewed=true;updateRow(i);summary();});
      select.addEventListener('change',function(){l.font=select.value;l.fontManual=!!l.font;updateRow(i);summary();});
      manual.addEventListener('change',function(){var name=fontName(manual.value);if(!name){status('请从本机字体列表中选择。','error');return;}l.font=name;l.fontManual=true;updateRow(i);summary();});
      if(!l.reviewed)detail.open=true;updateRow(i);$('lines').appendChild(row);
    });summary();
  }
  function matchFonts(onlyIndex){
    var selected=[],indices=[];lines.forEach(function(l,i){if(l.selected&&l.text.trim()&&(onlyIndex===undefined||onlyIndex===i)){selected.push(l);indices.push(i);}});
    if(!selected.length)return Promise.resolve();if(selected.length>20)return Promise.reject(Error('请分批匹配，每次最多 20 行。'));
    indices.forEach(function(i){lines[i].matching=true;lines[i].matchError=false;updateRow(i);});
    status('正在比较 '+selected.length+' 行字体…','',0);
    return runtime.request('match',{fonts:fonts.map(function(f){return f.name;}),lines:selected},function(e){
      var progress=((Number(e.line)-1)+Number(e.done)/Number(e.total))/Number(e.lines)*100;
      status('比较第 '+e.line+'/'+e.lines+' 行字体…','',isFinite(progress)?Math.max(0,Math.min(100,progress)):0);
    }).then(function(r){indices.forEach(function(i){lines[i].matching=false;});r.rows.forEach(function(m){var i=indices[m.index],l=lines[i];l.match=m;
      if(!l.fontManual)l.font=ReviveCore.chooseFont(l,m.candidates);
      if(l.font&&m.candidates[0]&&m.candidates[0].similarity>=.90)l.reviewed=true;
    });indices.forEach(updateRow);summary();}).catch(function(e){indices.forEach(function(i){lines[i].matching=false;lines[i].matchError=true;updateRow(i);});throw e;});
  }
  $('capture').addEventListener('click',function(){
    busy=true;capture=null;lines=[];controls=[];cleanup();buttons();$('review').hidden=true;status('识别中…');
    host('capture').then(function(data){capture=data;return runOCR(data.path);})
      .then(function(data){if(!data.lines.length)throw Error('没有读到文字，请缩小选区后重试。');lines=data.lines.map(function(l){l.reviewed=l.stable===true||(l.ocrAgreed===true&&l.confidence>=.45);l.selected=true;l.font='';l.fontManual=false;return l;});render();return matchFonts();})
      .catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});
  });
  $('matchFonts').addEventListener('click',function(){busy=true;buttons();matchFonts().catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});});
  $('rebuild').addEventListener('click',function(){
    var selected=lines.filter(function(l){return l.selected;}),payload;
    try{if(!selected.length||selected.some(function(l){return !l.reviewed||!l.font;}))throw Error('请先确认文字并选择字体。');
      payload={token:capture.token,font:'',hideOriginals:$('hideOriginals').checked&&selected.length===lines.length,lines:ReviveCore.validateLines(selected,capture.bounds)};
    }catch(e){status(e.message,'error');return;}
    busy=true;buttons();status('恢复中…');host('rebuild',payload).then(function(r){capture=null;cleanup();status('已恢复 '+r.count+' 行可编辑文字，原稿已保留。','success');}).catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});
  });
  function loadFonts(){return host('fonts').then(function(data){fonts=data;$('fontList').textContent='';fonts.forEach(function(f){var o=document.createElement('option');o.value=f.name;o.textContent=f.family+' · '+f.style;$('fontList').appendChild(o);});});}
  $('mergeText').addEventListener('click',function(){
    if(busy)return;busy=true;buttons();status('正在合并选中文本…');
    host('mergeText').then(function(r){capture=null;lines=[];controls=[];cleanup();$('review').hidden=true;$('lines').textContent='';status('已将 '+r.count+' 个文本框合并为 1 个，原文本已隐藏保留。','success');})
      .catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});
  });
  $('reloadFonts').addEventListener('click',function(){busy=true;buttons();loadFonts().then(function(){status('本机字体已更新。');}).catch(function(e){status(e.message,'error');}).then(function(){busy=false;buttons();});});
  window.addEventListener('beforeunload',cleanup);
  if(!runtime){status('请从 Illustrator 的“窗口 → 字醒”打开原生插件。','error');return;}
  connected=true;busy=true;
  host('ping').then(function(data){$('version').textContent='v2.0.0 · 原生版 · Illustrator '+data.version;return loadFonts();})
    .then(function(){status('选中转曲文字后开始识别。');})
    .catch(function(e){connected=false;status(e.message,'error');}).then(function(){busy=false;buttons();});
}());
