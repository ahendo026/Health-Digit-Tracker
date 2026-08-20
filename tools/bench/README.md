# Bench tools — ground-truth labeling & accuracy harness

Standalone tools for measuring HealthDigits' screenshot-extraction accuracy
against a hand-labeled answer key. Built for the ACL Caregiver AI Challenge
Phase 1 (TRL-3 evidence); useful any time the model, prompt, or extraction
schema changes.

**These are dev tools, not app features.** They run on localhost against
local image folders. They are deliberately *not* integrated into the
HealthDigits UI — see [Why the labeler is standalone](#why-the-labeler-is-standalone).

Zero dependencies: plain Node (>=18) and Python 3 stdlib.

## The three tools

| Tool | Purpose |
|---|---|
| `labeler.js` | Local web page for hand-labeling a folder of screenshots into a ground-truth CSV |
| `harness.js` | Runs a labeled corpus through the HealthDigits API, scores results, emits a submission-ready HTML report |
| `cleanup-batch.py` | Deletes the harness's batch-tagged test uploads from the API afterward |

## Quickstart

```bash
# 1. Label a corpus (opens a browser page; writes <name>-labels.csv next to the folder)
node tools/bench/labeler.js ~/acl-trl3/bench-corpus

# 2. Run the harness against a live API (uploads + analyzes every labeled image)
node tools/bench/harness.js ~/acl-trl3/bench-labels.csv --api https://healthdigits-api.onrender.com

# 3. Remove the test uploads from the API
python3 tools/bench/cleanup-batch.py ~/acl-trl3/reports/<batch>-internal-data.json
```

Harness outputs land in `reports/` next to the labels file:

- `<batch>-report.html` — **the deliverable.** Open in Word (Save As .docx) or
  print to PDF. Per the ACL guide, raw .csv/.json files are never submitted.
- `<batch>-internal-data.json` — full raw record of the run (verbatim model
  outputs, upload IDs, timings). For reproducibility and cleanup. Do not submit.

## Modes

Mode is inferred from the labels CSV header:

- **bench** (`filename,expected_class,expected_values,source_app_or_device,notes`)
  → Bench Test Performance Metrics: overall accuracy, per-class precision/recall/F1
  (macro-averaged headline), confusion matrix, per-source breakdown, latency,
  failure analysis with verbatim model output.
- **smart40** (`cycle,filename,expected_class,expected_values,expected_behavior,notes`)
  → "Smart 40" Option A validation log: per-cycle PASS/FAIL, HITL uncertainty
  instances highlighted, Safety Exhibit ("Protocol 9-Delta") section.

Labeling conventions for smart40:

- Tag cycle type in notes: `[stress]` or `[boundary]` (untagged = standard).
- The Safety Exhibit image must contain `9-delta` in its filename or notes.
- Cycles that should *flag uncertainty*: class `unknown`, `expected_behavior`
  containing e.g. "flags for human review" (pass = model returns `unknown` or
  confidence below threshold).

## Harness flags

| Flag | Meaning |
|---|---|
| `--api <url>` | API base (default `http://localhost:3000`) |
| `--corpus <dir>` | Image folder (default: derived from labels filename) |
| `--batch <id>` | Batch identifier sent with every upload (default: `<mode>-<timestamp>`) |
| `--threshold <0..1>` | Confidence below this counts as "uncertainty flagged" (default 0.5) |
| `--rescore <internal-data.json>` | Re-score a previous run from its recorded raw outputs — no API calls, no new uploads. Labels CSV is re-read, so label fixes apply. |
| `--redact "Name,term"` | Replace terms with `[name redacted]` in the report HTML (internal data is left verbatim) |

> **Auth note:** the harness targets a local dev API, which is open as long as no
> master password is configured (see docs/SECRETS.md). Pointing it at an
> auth-enforced instance would require adding an `Authorization: Bearer <device
> token>` header to its fetch calls — not implemented.

Scoring notes:

- Empty label fields are "not shown in image" and are not compared; a label of
  `{}` means only the classification is scored.
- Duration equivalence: a label like `"57:51"` or `"1:37:48"` matches the
  API's stored minutes within rounding (the display format vs. storage format
  differ; this is representation, not accuracy).
- Every upload carries a `batchIdentifier`, and the API is sent **only** the
  image file, `sourceApp`, and that identifier — never expected values or notes.

## Why the labeler is standalone

The labels are the answer key HealthDigits is graded against. The labeler
therefore **never displays model output** and must stay out of the HealthDigits
UI, where classifications are visible everywhere. If ground truth is labeled
with the model's answer in view, anchoring bias makes shared errors invisible
and the benchmark measures agreement, not accuracy. Keep it that way.

(In-app human judgment belongs in the existing review flow — `reviewsTable` —
which is the opposite tool: it exists to respond to model output.)

## Provenance

Each report carries a provenance block: batch ID, run date, corpus SHA-256
manifest hash, labels-file SHA-256, model name and prompt version (read from
the actual `llm_runs` responses), API base, and uncertainty threshold. A
result without its provenance block is not reproducible — regenerate rather
than hand-edit.
