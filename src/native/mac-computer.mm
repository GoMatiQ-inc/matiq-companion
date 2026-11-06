#include <node_api.h>
#include <ApplicationServices/ApplicationServices.h>
#include <cmath>
#include <vector>
#include <unistd.h>
#import <AppKit/AppKit.h>

static napi_value Fail(napi_env env, const char* message) { napi_throw_error(env, nullptr, message); return nullptr; }
static napi_value Done(napi_env env) { napi_value value; napi_get_undefined(env, &value); return value; }
static bool Allowed(napi_env env) { if (AXIsProcessTrusted() && CGPreflightPostEventAccess()) return true; Fail(env, "Enable Accessibility for MatiQ Companion in System Settings before input."); return false; }
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
  pid_t target=0;CFArrayRef windows=CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID);
  if(windows){
    for(CFIndex i=0;i<CFArrayGetCount(windows);i++){
      CFDictionaryRef item=static_cast<CFDictionaryRef>(CFArrayGetValueAtIndex(windows,i));CGRect bounds{};pid_t owner=0;double alpha=1;
      auto rectangle=static_cast<CFDictionaryRef>(CFDictionaryGetValue(item,kCGWindowBounds));
      auto pid=static_cast<CFNumberRef>(CFDictionaryGetValue(item,kCGWindowOwnerPID));
      auto opacity=static_cast<CFNumberRef>(CFDictionaryGetValue(item,kCGWindowAlpha));
      if(opacity)CFNumberGetValue(opacity,kCFNumberDoubleType,&alpha);
      if(rectangle&&pid&&alpha>0&&CGRectMakeWithDictionaryRepresentation(rectangle,&bounds)&&CGRectContainsPoint(bounds,point)&&CFNumberGetValue(pid,kCFNumberIntType,&owner)&&owner>0&&owner!=getpid()){target=owner;break;}
    }
    CFRelease(windows);
  }
  if(!target)return Fail(env,"Click a visible target application's field before keyboard input.");
  CGEventRef move=CGEventCreateMouseEvent(nullptr,kCGEventMouseMoved,point,kCGMouseButtonLeft);
  CGEventRef down=CGEventCreateMouseEvent(nullptr,kCGEventLeftMouseDown,point,kCGMouseButtonLeft);
  CGEventRef up=CGEventCreateMouseEvent(nullptr,kCGEventLeftMouseUp,point,kCGMouseButtonLeft);
  if (!move || !down || !up) { if(move)CFRelease(move);if(down)CFRelease(down);if(up)CFRelease(up);return Fail(env,"macOS could not create pointer events."); }
  for (auto event : {move,down,up}) { CGEventSetFlags(event,0);CGEventSetIntegerValueField(event,kCGMouseEventClickState,1);CGEventPost(kCGHIDEventTap,event);CFRelease(event); }
  napi_value value;napi_create_int32(env,target,&value);return value;
}
static napi_value Foreground(napi_env env,napi_callback_info) {
  if(!Allowed(env))return nullptr;
  @autoreleasepool {
    napi_value value;napi_create_int32(env,NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier,&value);return value;
  }
}
static napi_value Focus(napi_env env,napi_callback_info info) {
  if(!Allowed(env))return nullptr;
  size_t count=1;napi_value arg;int32_t pid=0;napi_get_cb_info(env,info,&count,&arg,nullptr,nullptr);
  if(count!=1||napi_get_value_int32(env,arg,&pid)!=napi_ok||pid<=0||pid==getpid())return Fail(env,"Click the other application's target field, then observe again before keyboard input.");
  @autoreleasepool {
    if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==pid)return Done(env);
    NSRunningApplication* application=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if(!application || application.terminated)return Fail(env,"The clicked application closed. Click its field and observe again.");
    [NSApp yieldActivationToApplication:application];
    if(![application activateFromApplication:NSRunningApplication.currentApplication options:0])return Fail(env,[[NSString stringWithFormat:@"macOS rejected the target activation (PID %d, policy %ld). Click a regular application field and observe again.",pid,(long)application.activationPolicy] UTF8String]);
  }
  return Done(env);
}
static napi_value Access(napi_env env,napi_callback_info){
  napi_value result,ax,post;napi_create_object(env,&result);napi_get_boolean(env,AXIsProcessTrusted(),&ax);napi_get_boolean(env,CGPreflightPostEventAccess(),&post);napi_set_named_property(env,result,"accessibility",ax);napi_set_named_property(env,result,"postEvents",post);return result;
}
static napi_value RequestEvents(napi_env env,napi_callback_info){napi_value value;napi_get_boolean(env,CGRequestPostEventAccess(),&value);return value;}
static napi_value Init(napi_env env,napi_value exports) {
  napi_property_descriptor methods[]={ {"access",nullptr,Access,nullptr,nullptr,nullptr,napi_default,nullptr}, {"requestEvents",nullptr,RequestEvents,nullptr,nullptr,nullptr,napi_default,nullptr}, {"foreground",nullptr,Foreground,nullptr,nullptr,nullptr,napi_default,nullptr}, {"focus",nullptr,Focus,nullptr,nullptr,nullptr,napi_default,nullptr}, {"type",nullptr,Type,nullptr,nullptr,nullptr,napi_default,nullptr}, {"key",nullptr,Key,nullptr,nullptr,nullptr,napi_default,nullptr}, {"click",nullptr,Click,nullptr,nullptr,nullptr,napi_default,nullptr} };
  napi_define_properties(env,exports,7,methods);return exports;
}
NAPI_MODULE(companion_input,Init)
