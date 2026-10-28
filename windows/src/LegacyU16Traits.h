#pragma once
#include <string>
#include <cwchar>
#include <cstdint>
// Illustrator 2020's public wrapper uses basic_string<unsigned short>.
// Current libc++ removed its generic traits; this build-only adapter restores that legacy specialization.
#if defined(_LIBCPP_VERSION)
namespace std { template<> struct char_traits<unsigned short> {
 using char_type=unsigned short;using int_type=uint_least32_t;using off_type=streamoff;using pos_type=streampos;using state_type=mbstate_t;
 static void assign(char_type& a,const char_type& b){a=b;}
 static constexpr bool eq(char_type a,char_type b){return a==b;}
 static constexpr bool lt(char_type a,char_type b){return a<b;}
 static int compare(const char_type*a,const char_type*b,size_t n){for(size_t i=0;i<n;i++)if(a[i]!=b[i])return a[i]<b[i]?-1:1;return 0;}
 static size_t length(const char_type*s){size_t n=0;while(s[n])n++;return n;}
 static const char_type* find(const char_type*s,size_t n,const char_type&c){for(size_t i=0;i<n;i++)if(s[i]==c)return s+i;return nullptr;}
 static char_type* move(char_type*a,const char_type*b,size_t n){return static_cast<char_type*>(__builtin_memmove(a,b,n*sizeof(char_type)));}
 static char_type* copy(char_type*a,const char_type*b,size_t n){return static_cast<char_type*>(__builtin_memcpy(a,b,n*sizeof(char_type)));}
 static char_type* assign(char_type*a,size_t n,char_type c){for(size_t i=0;i<n;i++)a[i]=c;return a;}
 static constexpr char_type to_char_type(int_type c){return static_cast<char_type>(c);}
 static constexpr int_type to_int_type(char_type c){return c;}
 static constexpr bool eq_int_type(int_type a,int_type b){return a==b;}
 static constexpr int_type eof(){return static_cast<int_type>(-1);}
 static constexpr int_type not_eof(int_type c){return c==eof()?0:c;}
};}
#endif
