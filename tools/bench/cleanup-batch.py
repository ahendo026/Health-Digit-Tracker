#!/usr/bin/env python3
"""Delete the harness's batch-tagged test uploads from the HealthDigits API.

Reads upload IDs from one or more harness internal-data.json files and issues
DELETE /api/uploads/:id for each. Only ever touches IDs the harness created.

Usage:
  python3 cleanup-batch.py <internal-data.json> [more.json ...]
"""
import json, sys, urllib.request

API = "https://healthdigits-api.onrender.com"

ids = []
for path in sys.argv[1:]:
    d = json.load(open(path))
    ids += [(r["uploadId"], r["filename"]) for r in d["records"] if r.get("uploadId")]

if not ids:
    sys.exit("no upload IDs found — pass the *-internal-data.json files from the runs")

print(f"deleting {len(ids)} uploads from {API}")
ok = fail = 0
for uid, name in ids:
    req = urllib.request.Request(f"{API}/api/uploads/{uid}", method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            ok += 1
    except Exception as e:
        fail += 1
        print(f"  FAILED {uid} ({name}): {e}")
print(f"done: {ok} deleted, {fail} failed")
