using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Reflection;using System.Runtime.InteropServices;using System.Threading;using System.Threading.Tasks;using System.Web.Script.Serialization;
namespace ZiXing {
 public static class Json {
  static readonly object Gate=new object();
  static readonly JavaScriptSerializer Serializer=new JavaScriptSerializer{MaxJsonLength=48*1024*1024,RecursionLimit=80};
  public static string Encode(object value){lock(Gate)return Serializer.Serialize(value);}
  public static Dictionary<string,object> Object(string s){lock(Gate)return Serializer.Deserialize<Dictionary<string,object>>(s);}
  public static string String(Dictionary<string,object> o,string key){object v;return o.TryGetValue(key,out v)?v as string:null;}
  public static object[] Array(Dictionary<string,object> o,string key){object v;if(!o.TryGetValue(key,out v)||v is string||!(v is System.Collections.IEnumerable))throw new Exception("参数无效："+key);var items=new List<object>();foreach(object item in (System.Collections.IEnumerable)v)items.Add(item);return items.ToArray();}
  public static double Number(Dictionary<string,object> o,string key){object v;if(!o.TryGetValue(key,out v)||v is string||v is bool||v==null)throw new Exception("坐标格式无效。");double n=Convert.ToDouble(v,System.Globalization.CultureInfo.InvariantCulture);if(double.IsInfinity(n)||double.IsNaN(n))throw new Exception("坐标无效。");return n;}
 }
 public sealed class HostBridge {
  readonly string source,guard,hostExecutable;readonly int major,parent;
  public HostBridge(string resources,string host,int parentPid){source=File.ReadAllText(Path.Combine(resources,"host","main.jsx"));guard=File.ReadAllText(Path.Combine(resources,"host","guard.jsx"));hostExecutable=Path.GetFullPath(host);major=FileVersionInfo.GetVersionInfo(host).FileMajorPart;parent=parentPid;if(major<24)throw new Exception("本测试版以 Illustrator 2020（24）及以上为兼容目标。");}
  public Task<object> Execute(string action,Dictionary<string,object> payload){var completion=new TaskCompletionSource<object>();var thread=new Thread(()=>{
   object app=null;try{
    if(Process.GetProcessById(parent).HasExited)throw new Exception("Illustrator 已退出。");
    try{app=Marshal.GetActiveObject("Illustrator.Application."+major);}catch(COMException){app=Marshal.GetActiveObject("Illustrator.Application");}
    string quoteAction=Json.Encode(action),quotePayload=Json.Encode(Uri.EscapeDataString(Json.Encode(payload)));
    string expected=Json.Encode(hostExecutable);
    string script="#targetengine \"zixing-windows\"\n"+
      guard+"\nZiXingCheckHost("+major+","+expected+");\n"+
      "if(typeof TextReviveWindowsBuild==='undefined'||TextReviveWindowsBuild!=='2.1.0-beta3'){\n"+source+"\nvar TextReviveWindowsBuild='2.1.0-beta3';}\nTextRevive.dispatch("+quoteAction+","+quotePayload+");";
    script=script.Replace("\u2028","\\u2028").Replace("\u2029","\\u2029");
    string raw=null;for(int attempt=0;;attempt++){try{raw=(string)app.GetType().InvokeMember("DoJavaScript",BindingFlags.InvokeMethod|BindingFlags.OptionalParamBinding,null,app,new object[]{script,Type.Missing,Type.Missing});break;}catch(TargetInvocationException ex){var com=ex.InnerException as COMException;if(com!=null&&(com.ErrorCode==unchecked((int)0x80010001)||com.ErrorCode==unchecked((int)0x8001010A))&&attempt<5){Thread.Sleep(300);continue;}throw ex.InnerException??ex;}}
    var result=Json.Object(raw);if(!result.ContainsKey("ok")||!(result["ok"] is bool)||!(bool)result["ok"])throw new Exception(Json.String(result,"error")??"Illustrator 文档操作未完成。");completion.SetResult(result.ContainsKey("data")?result["data"]:new object());
   }catch(Exception ex){completion.SetException(ex);}finally{if(app!=null&&Marshal.IsComObject(app))Marshal.ReleaseComObject(app);}
  });thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();return completion.Task;}
 }
}
