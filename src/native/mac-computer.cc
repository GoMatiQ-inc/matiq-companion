#include <node_api.h>
#include <ApplicationServices/ApplicationServices.h>
#include <cmath>
#include <vector>
#include <unistd.h>

static napi_value Fail(napi_env env, const char* message) { napi_throw_error(env, nullptr, message); return nullptr; }
static napi_value Done(napi_env env) { napi_value value; napi_get_undefined(env, &value); return value; }
static bool Allowed(napi_env env) { if (AXIsProcessTrusted()) return true; Fail(env, "Enable Accessibility for MatiQ Companion in System Settings before input."); return false; }
static bool PostKey(CGKeyCode code, const UniChar* text = nullptr, size_t length = 0) {
  CGEventRef down = CGEventCreateKeyboardEvent(nullptr, code, true);
  CGEventRef up = CGEventCreateKeyboardEvent(nullptr, code, false);
  if (!down || !up) { if (down) CFRelease(down); if (up) CFRelease(up); return false; }
  CGEventSetFlags(down, 0); CGEventSetFlags(up, 0);
  if (text) { CGEventKeyboardSetUnicodeString(down, length, text); CGEventKeyboardSetUnicodeString(up, length, text); }
  CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up);
  CFRelease(down); CFRelease(up); return true;
}
static napi_value Type(napi_env env, napi_callback_info info) {
  if (!Allowed(env)) return nullptr;
  size_t count=1, length=0; napi_value arg;
  napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  if (count!=1 || napi_get_value_string_utf16(env,arg,nullptr,0,&length)!=napi_ok || length==0 || length>16) return Fail(env,"Supply one bounded Unicode input chunk.");
  std::vector<char16_t> text(length+1);
  if (napi_get_value_string_utf16(env,arg,text.data(),text.size(),&length)!=napi_ok) return Fail(env,"Could not read Unicode input.");
  if (!PostKey(0,reinterpret_cast<const UniChar*>(text.data()),length)) return Fail(env,"macOS could not create keyboard events.");
  return Done(env);
}
static napi_value Key(napi_env env, napi_callback_info info) {
  if (!Allowed(env)) return nullptr;
  size_t count=1; napi_value arg; uint32_t key;
  napi_get_cb_info(env,info,&count,&arg,nullptr,nullptr);
  if (count!=1 || napi_get_value_uint32(env,arg,&key)!=napi_ok) return Fail(env,"Choose a supported key.");
  if (key!=36 && key!=53 && key!=48 && key!=51 && key!=123 && key!=124 && key!=125 && key!=126) return Fail(env,"Choose a supported key.");
  if (!PostKey(static_cast<CGKeyCode>(key))) return Fail(env,"macOS could not create keyboard events.");
  return Done(env);
}
static napi_value Click(napi_env env, napi_callback_info info) {
  if (!Allowed(env)) return nullptr;
  size_t count=2; napi_value args[2]; double x,y;
  napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  if (count!=2 || napi_get_value_double(env,args[0],&x)!=napi_ok || napi_get_value_double(env,args[1],&y)!=napi_ok || !std::isfinite(x) || !std::isfinite(y)) return Fail(env,"Supply finite screen coordinates.");
  CGPoint point=CGPointMake(x,y);
  CGEventRef move=CGEventCreateMouseEvent(nullptr,kCGEventMouseMoved,point,kCGMouseButtonLeft);
  CGEventRef down=CGEventCreateMouseEvent(nullptr,kCGEventLeftMouseDown,point,kCGMouseButtonLeft);
  CGEventRef up=CGEventCreateMouseEvent(nullptr,kCGEventLeftMouseUp,point,kCGMouseButtonLeft);
  if (!move || !down || !up) { if(move)CFRelease(move);if(down)CFRelease(down);if(up)CFRelease(up);return Fail(env,"macOS could not create pointer events."); }
  for (auto event : {move,down,up}) { CGEventSetFlags(event,0);CGEventPost(kCGHIDEventTap,event);CFRelease(event); }
  return Done(env);
}
static napi_value Foreground(napi_env env,napi_callback_info) {
  if(!Allowed(env))return nullptr;
  AXUIElementRef system=AXUIElementCreateSystemWide();CFTypeRef application=nullptr;
  AXError error=AXUIElementCopyAttributeValue(system,kAXFocusedApplicationAttribute,&application);CFRelease(system);
  pid_t pid=0;if(error==kAXErrorSuccess&&application){AXUIElementGetPid(static_cast<AXUIElementRef>(const_cast<void*>(application)),&pid);CFRelease(application);}
  napi_value value;napi_create_int32(env,pid,&value);return value;
}
static napi_value Focus(napi_env env,napi_callback_info info) {
  if(!Allowed(env))return nullptr;
  size_t count=1;napi_value arg;int32_t pid=0;napi_get_cb_info(env,info,&count,&arg,nullptr,nullptr);
  if(count!=1||napi_get_value_int32(env,arg,&pid)!=napi_ok||pid<=0||pid==getpid())return Fail(env,"Click the other application's target field, then observe again before keyboard input.");
  AXUIElementRef application=AXUIElementCreateApplication(pid);
  AXError error=AXUIElementSetAttributeValue(application,kAXFrontmostAttribute,kCFBooleanTrue);CFRelease(application);
  if(error!=kAXErrorSuccess)return Fail(env,"macOS could not restore the clicked application. Click its field and observe again.");return Done(env);
}
static napi_value Init(napi_env env,napi_value exports) {
  napi_property_descriptor methods[]={ {"foreground",nullptr,Foreground,nullptr,nullptr,nullptr,napi_default,nullptr}, {"focus",nullptr,Focus,nullptr,nullptr,nullptr,napi_default,nullptr}, {"type",nullptr,Type,nullptr,nullptr,nullptr,napi_default,nullptr}, {"key",nullptr,Key,nullptr,nullptr,nullptr,napi_default,nullptr}, {"click",nullptr,Click,nullptr,nullptr,nullptr,napi_default,nullptr} };
  napi_define_properties(env,exports,5,methods);return exports;
}
NAPI_MODULE(companion_input,Init)
