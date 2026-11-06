"""Keep Apple ticket requests on TLS/TCP in a disposable Intel Actions VM."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

if not (os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and sys.platform == "darwin" and os.uname().machine == "x86_64"):
    raise SystemExit("Run this transport workaround only on a disposable GitHub-hosted Intel Mac.")
state = Path(os.environ["RUNNER_TEMP"]) / "companion-notary-transport.json"
owner = os.environ["GITHUB_RUN_ID"] + ":" + os.environ["GITHUB_RUN_ATTEMPT"]
anchor = "com.apple/matiq-companion-notary"

def pf(*args, data=None):
    result = subprocess.run(["/usr/bin/sudo", "-n", "/sbin/pfctl", *args], input=data, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError("Inspect the CI packet-filter operation: " + result.stderr)
    return result.stdout, result.stderr

def rules_hash():
    return hashlib.sha256(pf("-sr")[0].encode()).hexdigest()

def enabled():
    return "Status: Enabled" in pf("-s", "info")[0]

def remove(record):
    if record["owner"] != owner or record["anchor"] != anchor:
        raise RuntimeError("Refusing to remove another job's transport rule.")
    pf("-a", anchor, "-F", "rules")
    if pf("-a", anchor, "-sr")[0].strip():
        raise RuntimeError("The owned CI transport anchor is not empty.")
    if record.get("enable_attempted") and not record.get("token"):
        raise RuntimeError("The PF enablement token is unknown; do not disable another owner's filter. Let the disposable job expire.")
    if record.get("token"):
        pf("-X", record["token"])
    if rules_hash() != record["root_rules"] or enabled() != record["enabled"]:
        raise RuntimeError("Packet-filter state changed outside the owned anchor; inspect the disposable runner.")
    print("PASS: owned UDP rule and enablement token removed; original root rules/state preserved.")

if sys.argv[1:] == ["setup"]:
    if state.exists() or pf("-a", anchor, "-sr")[0].strip():
        raise RuntimeError("Refusing to adopt an existing transport state or rule.")
    root_rules = pf("-sr")[0]
    if 'anchor "com.apple/*"' not in root_rules:
        raise RuntimeError("The runner lacks its standard Apple anchor; do not replace global firewall rules.")
    record = {"owner": owner, "anchor": anchor, "root_rules": rules_hash(), "enabled": enabled()}
    state.write_text(json.dumps(record))
    pf("-a", anchor, "-f", "-", data="block return out quick proto udp from any to any port 443\n")
    if not record["enabled"]:
        record["enable_attempted"] = True
        state.write_text(json.dumps(record))
        token_output = "".join(pf("-E"))
        token = re.search(r"Token\s*:\s*(\d+)", token_output)
        if not token:
            raise RuntimeError("Cannot identify the owned PF enablement token; inspect the disposable runner.")
        record["token"] = token.group(1)
        state.write_text(json.dumps(record))
    rules = pf("-a", anchor, "-sr")[0]
    if "proto udp" not in rules or not enabled() or rules_hash() != record["root_rules"]:
        raise RuntimeError("The scoped CI transport rule was not installed without changing root rules.")
    print("PASS: disposable Intel CI uses HTTPS/TCP for Apple tickets; TLS and all signing checks remain enabled.")
elif sys.argv[1:] == ["cleanup"]:
    if state.exists():
        remove(json.loads(state.read_text()))
        state.unlink()
    else:
        print("No owned CI transport token was created.")
else:
    raise SystemExit("Choose setup or cleanup.")
