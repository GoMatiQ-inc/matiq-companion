"""Exercise Apple's credential-backed authorization API only in a disposable Companion CI session."""
import ctypes as c
import json
import os
import sys

if not (sys.platform == "darwin" and os.getuid() == 501 and os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("GITHUB_REPOSITORY") == "GoMatiQ-inc/matiq-companion"):
    raise SystemExit("Use only the normal user in a disposable hosted Companion Mac job.")
request = json.load(sys.stdin)
name = "mqci" + os.environ["GITHUB_RUN_ID"] + "a" + os.environ["GITHUB_RUN_ATTEMPT"]
if request["name"] != name:
    raise SystemExit("Use only the exact owned CI identity.")
class Item(c.Structure):
    _fields_ = [("name", c.c_char_p), ("length", c.c_size_t), ("value", c.c_void_p), ("flags", c.c_uint32)]
class Items(c.Structure):
    _fields_ = [("count", c.c_uint32), ("items", c.POINTER(Item))]
security = c.CDLL("/System/Library/Frameworks/Security.framework/Security")
security.AuthorizationCreate.argtypes = [c.POINTER(Items), c.POINTER(Items), c.c_uint32, c.POINTER(c.c_void_p)]
security.AuthorizationCreate.restype = c.c_int32
security.AuthorizationFree.argtypes = [c.c_void_p, c.c_uint32]
security.AuthorizationFree.restype = c.c_int32
# kSMRightModifySystemDaemons from Apple ServiceManagement.h; also used by Squirrel.
right_item = Item(b"com.apple.ServiceManagement.daemons.modify", 0, None, 0)
rights = Items(1, c.pointer(right_item))
def authorize(password=None):
    ref = c.c_void_p()
    environment = None
    if password is not None:
        user_buffer, password_buffer = c.create_string_buffer(name.encode()), c.create_string_buffer(password.encode())
        values = (Item * 3)(Item(b"username", len(name), c.cast(user_buffer, c.c_void_p), 0), Item(b"password", len(password), c.cast(password_buffer, c.c_void_p), 0), Item(b"shared", 0, None, 0))
        environment = Items(3, values)
    status = security.AuthorizationCreate(c.byref(rights), c.byref(environment) if environment else None, 2, c.byref(ref))
    return status, ref

def release(ref, destroy=False):
    if ref.value:
        status = security.AuthorizationFree(ref, 8 if destroy else 0)
        if status: raise RuntimeError("AuthorizationFree failed with status " + str(status))

if request["operation"] == "grant":
    status, ref = authorize(request["password"] + "wrong")
    release(ref, True)
    if status == 0: raise RuntimeError("The native authorization right accepted the wrong password.")
    status, ref = authorize(request["password"])
    if status: raise RuntimeError("Credential-backed authorization failed with status " + str(status))
    try:
        cached, probe = authorize()
        release(probe)
        if cached: raise RuntimeError("The OS did not share the authenticated authorization with this CI session: " + str(cached))
    finally:
        release(ref)
    print(json.dumps({"authorized": True, "wrongPasswordRejected": True, "sessionCredentialVerified": True}))
elif request["operation"] == "revoke":
    status, ref = authorize()
    release(ref, True)
    status, probe = authorize()
    release(probe, True)
    if status == 0: raise RuntimeError("The CI session still has the authenticated right after release.")
    print(json.dumps({"authorizationAbsent": True}))
else:
    raise SystemExit("Choose grant or revoke.")
