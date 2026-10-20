#!/usr/bin/env python3
"""Check this handoff archive after extraction; does not install or execute project code."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent
manifest=json.loads((root/"PACKAGE_MANIFEST.json").read_text(encoding="utf-8"))
errors=[]
for item in manifest["files"]:
    rel=Path(item["path"])
    target=(root/rel).resolve()
    if rel.is_absolute() or not target.is_relative_to(root):
        errors.append("Invalid path: "+str(rel));continue
    if not target.is_file():errors.append("Missing: "+str(rel));continue
    raw=target.read_bytes()
    if len(raw)!=item["bytes"] or hashlib.sha256(raw).hexdigest()!=item["sha256"]:
        errors.append("Mismatch: "+str(rel))
if errors:
    print("HANDOFF INTEGRITY FAILED")
    print("\n".join(errors));sys.exit(1)
print("PASS: "+str(len(manifest["files"]))+" handoff files match the included hash manifest.")
print("This verifies package consistency, not author identity, release signatures, source safety, or application functionality.")
