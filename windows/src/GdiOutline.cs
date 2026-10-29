using System;using System.Drawing;using System.Drawing.Drawing2D;using System.Runtime.InteropServices;
namespace ZiXing {
 internal static class GdiOutline {
  [StructLayout(LayoutKind.Sequential)]struct Point {public int X,Y;}
  [DllImport("gdi32.dll")]static extern bool BeginPath(IntPtr hdc);
  [DllImport("gdi32.dll")]static extern bool EndPath(IntPtr hdc);
  [DllImport("gdi32.dll")]static extern bool AbortPath(IntPtr hdc);
  [DllImport("gdi32.dll")]static extern uint SetTextAlign(IntPtr hdc,uint align);
  [DllImport("gdi32.dll")]static extern int SetBkMode(IntPtr hdc,int mode);
  [DllImport("gdi32.dll")]static extern int GetPath(IntPtr hdc,[Out]Point[] points,[Out]byte[] types,int count);
  [DllImport("gdi32.dll",ExactSpelling=true)]static extern bool GetCharWidthI(IntPtr hdc,uint first,uint count,[In]ushort[] glyphs,[Out]int[] widths);
  [DllImport("gdi32.dll",ExactSpelling=true)]static extern bool ExtTextOutW(IntPtr hdc,int x,int y,uint options,IntPtr rect,[In]ushort[] glyphs,uint count,[In]int[] advances);
  internal static GraphicsPath Read(IntPtr hdc,ushort[] glyphs,float tracking,float em){
   int[] advance=null;if(Math.Abs(tracking)>.00001f){advance=new int[glyphs.Length];if(!GetCharWidthI(hdc,0,(uint)glyphs.Length,glyphs,advance))return null;for(int i=0;i<advance.Length-1;i++)advance[i]+=(int)Math.Round(tracking*em);}
   SetTextAlign(hdc,24);SetBkMode(hdc,1);if(!BeginPath(hdc))return null;
   if(!ExtTextOutW(hdc,0,0,0x10,IntPtr.Zero,glyphs,(uint)glyphs.Length,advance)||!EndPath(hdc)){AbortPath(hdc);return null;}
   int count=GetPath(hdc,null,null,0);if(count<1||count>500000){AbortPath(hdc);return null;}
   var points=new Point[count];var types=new byte[count];if(GetPath(hdc,points,types,count)!=count){AbortPath(hdc);return null;}AbortPath(hdc);
   var path=new GraphicsPath(FillMode.Winding);PointF last=PointF.Empty;
   for(int i=0;i<count;i++){
    var point=new PointF(points[i].X,points[i].Y);int kind=types[i]&6;
    if(kind==6){path.StartFigure();last=point;}
    else if(kind==2){path.AddLine(last,point);last=point;}
    else if(kind==4&&i+2<count&&(types[i+1]&6)==4&&(types[i+2]&6)==4){var second=new PointF(points[i+1].X,points[i+1].Y);var third=new PointF(points[i+2].X,points[i+2].Y);path.AddBezier(last,point,second,third);i+=2;last=third;}
    else{path.Dispose();return null;}
    if((types[i]&1)!=0)path.CloseFigure();
   }
   if(path.PointCount==0){path.Dispose();return null;}return path;
  }
 }
}
