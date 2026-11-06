"""Own one non-login administrator identity for normal authorization in a disposable CI VM."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

required = os.environ
if not (sys.platform == "darwin" and required.get("GITHUB_ACTIONS") == "true" and required.get("RUNNER_ENVIRONMENT") == "github-hosted" and required.get("GITHUB_REPOSITORY") == "GoMatiQ-inc/matiq-companion" and os.getuid() == 0):
    raise SystemExit("Use this fixture only as root inside a disposable hosted Companion Mac job.")
import pty
import select
import signal
import termios
import time

base = Path(required["RUNNER_TEMP"]).resolve()
if base != Path("/Users/runner/work/_temp"):
    raise SystemExit("Refusing an unexpected CI temporary directory.")
owner = required["GITHUB_RUN_ID"] + ":" + required["GITHUB_RUN_ATTEMPT"]
name = "mqci" + required["GITHUB_RUN_ID"] + "a" + required["GITHUB_RUN_ATTEMPT"]
if not re.fullmatch(r"mqci[0-9]+a[0-9]+", name) or len(name) > 31:
    raise SystemExit("Use the exact generated CI fixture identity.")
home = base / ("companion-admin-" + name)
state = base / "companion-ci-authorization.json"
request = json.load(sys.stdin)

def command(args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError("CI directory operation failed: " + args[0] + "; inspect its fixture configuration.")
    return result.stdout.strip()

def users():
    return set(command(["/usr/bin/dscl", ".", "-list", "/Users"]).splitlines())

def attribute(key):
    return command(["/usr/bin/dscl", ".", "-read", "/Users/" + name, key]).split(":", 1)[1].strip()

def password_command(args, password, timeout=45):
    pid, fd = pty.fork()
    if pid == 0:
        os.execv(args[0], args)
    deadline, buffer, prompts, finished = time.monotonic() + timeout, b"", 0, False
    try:
        settings = termios.tcgetattr(fd)
        settings[3] &= ~termios.ECHO
        termios.tcsetattr(fd, termios.TCSANOW, settings)
        while time.monotonic() < deadline:
            if select.select([fd], [], [], 0.1)[0]:
                try:
                    chunk = os.read(fd, 4096)
                except OSError as error:
                    if error.errno != 5: raise
                    chunk = b""
                buffer = (buffer + chunk)[-4096:]
                if re.search(rb"password[^\r\n]{0,100}:\s*$", buffer, re.I):
                    if prompts >= 2: raise RuntimeError("Unexpected repeated CI password prompt.")
                    os.write(fd, password.encode() + b"\n")
                    prompts += 1
                    buffer = b""
            ended, status = os.waitpid(pid, os.WNOHANG)
            if ended:
                finished = True
                return os.waitstatus_to_exitcode(status)
        raise RuntimeError("The owned CI password operation timed out.")
    finally:
        if not finished:
            try: os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError: pass
            try: os.waitpid(pid, 0)
            except ChildProcessError: pass
        os.close(fd)

def verify_record(record):
    if record["owner"] != owner or record["name"] != name or record["home"] != str(home):
        raise RuntimeError("Refusing another job's local identity.")
    uid = int(attribute("UniqueID"))
    if not (500 < uid < 1000 and attribute("NFSHomeDirectory") == str(home) and attribute("RealName") == "Companion Upgrade CI"):
        raise RuntimeError("The CI identity no longer matches its ownership record.")
    if record.get("uid") is not None and record["uid"] != uid:
        raise RuntimeError("The CI identity UID changed; do not delete it.")
    return uid

if sys.argv[1:] == ["create"]:
    if state.exists() or name in users() or home.exists():
        raise RuntimeError("Refusing to adopt an existing identity or home directory.")
    password = request["password"]
    if not re.fullmatch(r"[a-zA-Z0-9!_-]{32,100}", password):
        raise RuntimeError("Generate a long random in-memory fixture password.")
    record = {"owner": owner, "name": name, "home": str(home)}
    with state.open("x") as file: json.dump(record, file)
    state.chmod(0o600)
    result = password_command(["/usr/sbin/sysadminctl", "-addUser", name, "-fullName", "Companion Upgrade CI", "-home", str(home), "-shell", "/usr/bin/false", "-password", "-", "-admin"], password)
    if result or name not in users(): raise RuntimeError("The disposable administrator identity was not created.")
    record["uid"] = verify_record(record)
    state.write_text(json.dumps(record))
    member = command(["/usr/sbin/dseditgroup", "-o", "checkmember", "-m", name, "admin"])
    if not member.startswith("yes"): raise RuntimeError("The fixture identity is not an administrator.")
    caller = required.get("SUDO_UID", "")
    if not caller.isdigit() or int(caller) < 500: raise RuntimeError("Identify the original non-root CI caller.")
    auth = ["/usr/bin/sudo", "-n", "-u", "#" + caller, "/usr/bin/dscl", ".", "-authonly", name]
    if password_command(auth, password, 15) != 0 or password_command(auth, password + "wrong", 15) == 0:
        raise RuntimeError("Directory authentication did not enforce the fixture password.")
    print(json.dumps({"name": name, "uid": record["uid"], "passwordVerified": True, "wrongPasswordRejected": True}))
elif sys.argv[1:] == ["delete"]:
    if state.exists():
        record = json.loads(state.read_text())
        if record["owner"] != owner or record["name"] != name or record["home"] != str(home):
            raise RuntimeError("Refusing another job's identity ownership record.")
        if name in users():
            verify_record(record)
            command(["/usr/sbin/dseditgroup", "-o", "edit", "-d", name, "-t", "user", "admin"])
            command(["/usr/bin/dscl", ".", "-delete", "/Users/" + name])
        if home.exists():
            if home.is_symlink(): raise RuntimeError("The owned fixture home became a symlink.")
            command(["/bin/rm", "-r", str(home)])
        if name in users() or home.exists(): raise RuntimeError("The owned CI identity or home remains.")
        state.unlink()
    elif name in users() or home.exists():
        raise RuntimeError("An identity or home exists without owned state; leave it untouched.")
    print(json.dumps({"accountAbsent": True, "homeAbsent": True}))
else:
    raise SystemExit("Choose create or delete.")
