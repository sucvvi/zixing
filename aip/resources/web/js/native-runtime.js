(function(){
  'use strict';
  var channel=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.zixing;
  if(!channel)return;
  var next=0,pending=Object.create(null);
  window.__zixingDeliver=function(encoded){
    var bytes=Uint8Array.from(atob(encoded),function(c){return c.charCodeAt(0);});
    var message=JSON.parse(new TextDecoder().decode(bytes)),entry=pending[message.id];
    if(!entry)return;
    if(message.event==='progress'){if(entry.progress)entry.progress(message.data);return;}
    delete pending[message.id];
    if(message.ok)entry.resolve(message.data);else entry.reject(Error(message.error||'原生插件操作未完成。'));
  };
  window.ZiXingNative={request:function(method,payload,progress){
    return new Promise(function(resolve,reject){
      var id='r'+(++next);pending[id]={resolve:resolve,reject:reject,progress:progress};
      try{channel.postMessage({id:id,method:method,payload:payload||{}});}catch(e){delete pending[id];reject(e);}
    });
  }};
}());
