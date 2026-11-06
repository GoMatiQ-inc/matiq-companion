#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <node_api.h>
#include <vector>
#include <cmath>
#include <cstdint>
static napi_value Fail(napi_env e,const char* m){napi_throw_error(e,nullptr,m);return nullptr;}
static napi_value Done(napi_env e){napi_value v;napi_get_undefined(e,&v);return v;}
static bool Send(std::vector<INPUT>& inputs){return SendInput(static_cast<UINT>(inputs.size()),inputs.data(),sizeof(INPUT))==inputs.size();}
static INPUT Keyboard(WORD code,DWORD flags,bool unicode){INPUT v{};v.type=INPUT_KEYBOARD;v.ki.wVk=unicode?0:code;v.ki.wScan=unicode?code:0;v.ki.dwFlags=flags;return v;}
static napi_value Type(napi_env e,napi_callback_info info){
 size_t count=1,length=0;napi_value arg;napi_get_cb_info(e,info,&count,&arg,nullptr,nullptr);
 if(count!=1||napi_get_value_string_utf16(e,arg,nullptr,0,&length)!=napi_ok||length==0||length>16)return Fail(e,"Supply a bounded Unicode input chunk.");
 std::vector<char16_t> text(length+1);napi_get_value_string_utf16(e,arg,text.data(),text.size(),&length);
 std::vector<INPUT> inputs;for(size_t i=0;i<length;i++){inputs.push_back(Keyboard(text[i],KEYEVENTF_UNICODE,true));inputs.push_back(Keyboard(text[i],KEYEVENTF_UNICODE|KEYEVENTF_KEYUP,true));}
 if(!Send(inputs))return Fail(e,"Windows blocked input. Secure or elevated windows are not supported.");return Done(e);
}
static napi_value Key(napi_env e,napi_callback_info info){
 size_t count=1;napi_value arg;uint32_t code;napi_get_cb_info(e,info,&count,&arg,nullptr,nullptr);
 if(count!=1||napi_get_value_uint32(e,arg,&code)!=napi_ok)return Fail(e,"Choose a supported key.");
 if(code!=13&&code!=27&&code!=9&&code!=8&&code!=37&&code!=38&&code!=39&&code!=40)return Fail(e,"Choose a supported key.");
 std::vector<INPUT> inputs={Keyboard(code,0,false),Keyboard(code,KEYEVENTF_KEYUP,false)};if(!Send(inputs))return Fail(e,"Windows blocked keyboard input.");return Done(e);
}
static napi_value Click(napi_env e,napi_callback_info info){
 size_t count=2;napi_value args[2];double x,y;napi_get_cb_info(e,info,&count,args,nullptr,nullptr);
 if(count!=2||napi_get_value_double(e,args[0],&x)!=napi_ok||napi_get_value_double(e,args[1],&y)!=napi_ok||!std::isfinite(x)||!std::isfinite(y))return Fail(e,"Supply finite pointer coordinates.");
 auto previous=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 BOOL positioned=SetCursorPos(static_cast<int>(std::round(x)),static_cast<int>(std::round(y)));if(previous)SetThreadDpiAwarenessContext(previous);
 if(!positioned)return Fail(e,"Windows could not position the pointer.");
 INPUT down{},up{};down.type=up.type=INPUT_MOUSE;down.mi.dwFlags=MOUSEEVENTF_LEFTDOWN;up.mi.dwFlags=MOUSEEVENTF_LEFTUP;std::vector<INPUT> inputs={down,up};
 if(!Send(inputs))return Fail(e,"Windows blocked pointer input.");return Done(e);
}
static napi_value Foreground(napi_env e,napi_callback_info){
 HWND window=GetForegroundWindow();
 if(!window||!IsWindowVisible(window)){POINT point{};if(GetCursorPos(&point))window=GetAncestor(WindowFromPoint(point),GA_ROOT);}
 napi_value value;napi_create_bigint_uint64(e,reinterpret_cast<uintptr_t>(window),&value);return value;
}
static napi_value Focus(napi_env e,napi_callback_info info){
 size_t count=1;napi_value arg;uint64_t value;bool lossless=false;napi_get_cb_info(e,info,&count,&arg,nullptr,nullptr);
 if(count!=1||napi_get_value_bigint_uint64(e,arg,&value,&lossless)!=napi_ok||!lossless)return Fail(e,"Observe a normal desktop window before keyboard input.");
 HWND window=reinterpret_cast<HWND>(static_cast<uintptr_t>(value));
 if(!window||!IsWindow(window)||!IsWindowVisible(window))return Fail(e,"The observed window is no longer available. Observe and click the field again.");
 if(!SetForegroundWindow(window)&&GetForegroundWindow()!=window)return Fail(e,"Windows could not restore the observed window. Click its field and observe again.");
 return Done(e);
}
static napi_value Init(napi_env e,napi_value exports){napi_property_descriptor methods[]={
 {"type",nullptr,Type,nullptr,nullptr,nullptr,napi_default,nullptr},{"key",nullptr,Key,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"click",nullptr,Click,nullptr,nullptr,nullptr,napi_default,nullptr},{"foreground",nullptr,Foreground,nullptr,nullptr,nullptr,napi_default,nullptr},{"focus",nullptr,Focus,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(e,exports,5,methods);return exports;}
NAPI_MODULE(companion_windows,Init)
