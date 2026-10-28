using System;
namespace ZiXing {
 public sealed class Mask {
  public readonly int Width,Height;public readonly byte[] Pixels;
  public Mask(int w,int h,byte[] pixels){if(w<1||h<1||pixels.Length!=checked(w*h))throw new ArgumentException("Invalid mask");Width=w;Height=h;Pixels=pixels;}
  public int[] Tight(){int l=Width,r=-1,t=Height,b=-1;for(int y=0;y<Height;y++)for(int x=0;x<Width;x++)if(Pixels[y*Width+x]<170){l=Math.Min(l,x);r=Math.Max(r,x);t=Math.Min(t,y);b=Math.Max(b,y);}return r<l?null:new[]{l,t,r-l+1,b-t+1};}
  public Mask Normalize(int[] rect,int w,int h){var dst=new byte[checked(w*h)];for(int y=0;y<h;y++)for(int x=0;x<w;x++){int sum=0;foreach(double oy in new[]{.25,.75})foreach(double ox in new[]{.25,.75}){int sx=Math.Max(0,Math.Min(Width-1,(int)(rect[0]+(x+ox)*rect[2]/w))),sy=Math.Max(0,Math.Min(Height-1,(int)(rect[1]+(y+oy)*rect[3]/h)));sum+=Pixels[sy*Width+sx];}dst[y*w+x]=(byte)(sum/4);}return new Mask(w,h,dst);}
  public static double Similarity(Mask a,Mask b){if(a.Width!=b.Width||a.Height!=b.Height)throw new ArgumentException("Mask dimensions differ");double best=0;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){long intersection=0,union=0;for(int y=0;y<a.Height;y++)for(int x=0;x<a.Width;x++){int av=255-a.Pixels[y*a.Width+x],bx=x+dx,by=y+dy,bv=bx>=0&&by>=0&&bx<b.Width&&by<b.Height?255-b.Pixels[by*b.Width+bx]:0;intersection+=Math.Min(av,bv);union+=Math.Max(av,bv);}if(union>0)best=Math.Max(best,(double)intersection/union);}return best;}
 }
}
