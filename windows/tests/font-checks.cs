using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Drawing2D;using System.Drawing.Imaging;using System.IO;using System.Linq;using ZiXing;
class FontChecks {
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
 // Independent GDI+ reference: actual matching uses verified GDI glyph indices.
 static void Fixture(string file,string family,FontStyle style,string text,float tracking){
  using(var font=new Font(family,100,style,GraphicsUnit.Pixel))using(var path=new GraphicsPath(FillMode.Winding))using(var metrics=new Bitmap(1,1))using(var g=Graphics.FromImage(metrics))using(var format=(StringFormat)StringFormat.GenericTypographic.Clone()){
   format.FormatFlags|=StringFormatFlags.MeasureTrailingSpaces|StringFormatFlags.NoWrap;
   float x=0;foreach(char ch in text){path.AddString(ch.ToString(),font.FontFamily,(int)style,100,new PointF(x,0),format);x+=g.MeasureString(ch.ToString(),font,PointF.Empty,format).Width+tracking*100;}
   RectangleF bounds=path.GetBounds();int width=(int)Math.Ceiling(bounds.Width*64/bounds.Height)+4;
   using(var bitmap=new Bitmap(width,68))using(var output=Graphics.FromImage(bitmap))using(var matrix=new Matrix(64/bounds.Height,0,0,64/bounds.Height,2-bounds.X*64/bounds.Height,2-bounds.Y*64/bounds.Height)){
    path.Transform(matrix);output.Clear(Color.White);output.SmoothingMode=SmoothingMode.AntiAlias;output.FillPath(Brushes.Black,path);bitmap.Save(file,ImageFormat.Png);
   }
  }
 }
 static string Best(object result){var parsed=Json.Object(Json.Encode(result));var row=(Dictionary<string,object>)Json.Array(parsed,"rows")[0];var list=Json.Array(row,"candidates");Require(list.Length>0,"No candidates returned");return Json.String((Dictionary<string,object>)list[0],"name");}
 static void Main(){
  string directory=Path.Combine(Path.GetTempPath(),"zixing-font-checks-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
  try{
   var faces=new[]{Tuple.Create("Arial",FontStyle.Regular,"ArialMT"),Tuple.Create("Arial",FontStyle.Bold,"Arial-BoldMT"),Tuple.Create("Times New Roman",FontStyle.Regular,"TimesNewRomanPSMT"),Tuple.Create("Courier New",FontStyle.Regular,"CourierNewPSMT")};
   object[] fonts=faces.Select(f=>(object)f.Item3).Concat(new object[]{"Arial-ItalicMT","Arial-BoldItalicMT","TimesNewRomanPS-BoldMT","TimesNewRomanPS-ItalicMT","CourierNewPS-BoldMT","__Missing_ZiXing_Font__"}).ToArray();
   var request=new Dictionary<string,object>{{"fonts",fonts},{"lines",new object[]{new Dictionary<string,object>{{"text","Editable Type 2026"},{"x",0},{"y",0},{"width",1},{"height",1}}}}};
   var matcher=new FontMatcher();var legacy=new LegacyFontMatcher();int correct=0,baseline=0,total=0;
   foreach(var face in faces)foreach(float tracking in new[]{0f,.04f,.08f,.12f,.16f}){
    string file=Path.Combine(directory,"sample.png");Fixture(file,face.Item1,face.Item2,"Editable Type 2026",tracking);
    string actual=Best(matcher.Match(file,request,p=>{})),previous=Best(legacy.Match(file,request,p=>{}));
    if(actual==face.Item3)correct++;if(previous==face.Item3)baseline++;total++;
    Console.WriteLine("FONT case="+face.Item3+" spacing="+tracking+" expected="+face.Item3+" beta2="+previous+" beta3="+actual);
   }
   Require(correct>=baseline,"Font ranking regressed against beta2 baseline");Require(correct>=18,"Too many independent font reference failures");
   Console.WriteLine("PASS independent Windows font references: beta3 "+correct+"/"+total+", beta2 "+baseline+"/"+total+". This is a small system-font regression set, not a general accuracy estimate.");
  }finally{Directory.Delete(directory,true);}
 }
}
