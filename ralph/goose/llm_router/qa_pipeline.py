#!/usr/bin/env python3
"""
Goose QA Pipeline — collect context, plan tests, run tests, write report.
Resumes from last incomplete step if interrupted mid-run.

Usage:
  python qa_pipeline.py --app qwencode
  python qa_pipeline.py --app orchestrator
  python qa_pipeline.py --app agent-hub
  python qa_pipeline.py --auto        # detect active app from prd.json
  python qa_pipeline.py --app qwencode --force  # ignore cooldown/commit threshold
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
GOOSE_DIR = Path(__file__).parent.parent
RALPH_DIR = GOOSE_DIR.parent
ROUTER_SCRIPT = Path(__file__).parent / "router.py"
CONFIG_PATH = Path(__file__).parent / "config.json"
SESSION_DIR = GOOSE_DIR / "session_state"
REPORTS_BASE = GOOSE_DIR / "reports"

# ── App configs ───────────────────────────────────────────────────────────────
APP_CONFIGS = {
    "qwencode": {
        "dir": RALPH_DIR / "qwencode-gemini-cli-fork",
        "report_dir": REPORTS_BASE / "qwencode-gemini-cli-fork",
        "session_file": "qwencode.json",
        "test_cmds": ["npm test", "pnpm test"],
        "description": "CLI encode/decode tool (Gemini CLI fork with Qwen workers)",
        "qa_focus": (
            "Focus on: CLI argument parsing correctness, input/output format, "
            "round-trip encoding/decoding (encode then decode must match original), "
            "edge cases like empty input, large files, special characters."
        ),
    },
    "orchestrator": {
        "dir": RALPH_DIR / "custom-orchestrator-agent",
        "report_dir": REPORTS_BASE / "custom-orchestrator-agent",
        "session_file": "orchestrator.json",
        "test_cmds": ["npm test", "pnpm test"],
        "description": "Orchestration + sharded workers + compiler layer",
        "qa_focus": (
            "Focus on: orchestration correctness (shard boundaries, task routing), "
            "worker determinism (same input → same output), compiler's ability to merge "
            "conflicting partials without missing sections or corrupted output. "
            "Test both sequential drip mode and parallel mode."
        ),
    },
    "agent-hub": {
        "dir": RALPH_DIR / "agent-management-hub",
        "report_dir": REPORTS_BASE / "agent-management-hub",
        "session_file": "agent-hub.json",
        "test_cmds": ["npm test", "pnpm test"],
        "description": "Agent management hub (Paperclip/trigger.dev/Mastra-style)",
        "qa_focus": (
            "Focus on: trigger execution correctness, workflow routing paths "
            "(correct agent invoked with correct parameters), idempotency and retry behavior. "
            "Fake incoming events and verify correct agent invocation and end result. "
            "Highlight which flows are stable vs flaky."
        ),
    },
}

STEPS = ["collect_context", "plan_tests", "run_tests", "write_report"]


# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg):
    print(f"[qa {datetime.now().strftime('%H:%M:%S')}] {msg}")


# ── Config ────────────────────────────────────────────────────────────────────
def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


# ── Session state ─────────────────────────────────────────────────────────────
def load_session(app_key):
    SESSION_DIR.mkdir(exist_ok=True)
    path = SESSION_DIR / APP_CONFIGS[app_key]["session_file"]
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def save_session(app_key, state):
    SESSION_DIR.mkdir(exist_ok=True)
    path = SESSION_DIR / APP_CONFIGS[app_key]["session_file"]
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def new_session(app_key):
    return {
        "session_id": str(uuid.uuid4())[:8],
        "app": app_key,
        "step": "collect_context",
        "provider_used": None,
        "fallback_triggered": False,
        "last_commit": None,
        "status": "in_progress",
        "started_at": datetime.now().isoformat(),
        "last_run": None,
        "context": {},
        "test_plan": [],
        "test_results": [],
    }


# ── Git helpers ───────────────────────────────────────────────────────────────
def git_log_since(work_dir, since_commit, n=20):
    """Get git log since a commit hash. Returns list of {hash, message, files}."""
    if not work_dir.exists():
        return []
    try:
        if since_commit:
            cmd = ["git", "log", f"{since_commit}..HEAD", "--oneline", f"-{n}"]
        else:
            cmd = ["git", "log", "--oneline", f"-{n}"]
        result = subprocess.run(cmd, cwd=work_dir, capture_output=True, text=True)
        lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
        return lines
    except Exception:
        return []


def git_head(work_dir):
    """Get current HEAD commit hash."""
    if not work_dir.exists():
        return None
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=work_dir, capture_output=True, text=True
        )
        return result.stdout.strip() or None
    except Exception:
        return None


def count_commits_since(work_dir, since_commit):
    if not work_dir.exists() or not since_commit:
        return 0
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", f"{since_commit}..HEAD"],
            cwd=work_dir, capture_output=True, text=True
        )
        return int(result.stdout.strip() or "0")
    except Exception:
        return 0


# ── Active app detection ──────────────────────────────────────────────────────
def detect_active_app():
    """Read prd.json to find the current active story and map to app key."""
    prd_path = RALPH_DIR / "prd.json"
    if not prd_path.exists():
        return None
    with open(prd_path) as f:
        prd = json.load(f)
    done = set(prd.get("done", []))
    story_to_app = {"1": "qwencode", "2": "orchestrator", "3": "agent-hub"}
    for story in prd.get("stories", []):
        if story["id"] not in done:
            return story_to_app.get(story["id"])
    return None


# ── Should run? ───────────────────────────────────────────────────────────────
def should_run(app_key, session, config, force=False):
    if force:
        return True, "forced"
    if session is None:
        return True, "no previous session"
    if session.get("status") == "in_progress":
        return True, f"resuming from step: {session.get('step')}"

    qa_cfg = config.get("qa_pipeline", {})
    commit_threshold = qa_cfg.get("trigger_after_n_commits", 3)
    minute_threshold = qa_cfg.get("trigger_after_minutes", 30)

    work_dir = APP_CONFIGS[app_key]["dir"]
    last_commit = session.get("last_commit")
    commits_since = count_commits_since(work_dir, last_commit)
    if commits_since >= commit_threshold:
        return True, f"{commits_since} new commits since last QA"

    last_run = session.get("last_run")
    if last_run:
        minutes_ago = (datetime.now() - datetime.fromisoformat(last_run)).total_seconds() / 60
        if minutes_ago >= minute_threshold:
            return True, f"{int(minutes_ago)}min since last QA"

    return False, f"only {commits_since} commits and <{minute_threshold}min since last run"


# ── LLM call via router ───────────────────────────────────────────────────────
def llm(prompt, system_prompt=None):
    """Call router.py and return (text, provider_used, fallback_triggered)."""
    cmd = [sys.executable, str(ROUTER_SCRIPT), "--prompt", prompt]
    if system_prompt:
        cmd += ["--system", system_prompt]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 and not result.stdout.strip():
        log(f"  router error: {result.stderr.strip()[:300]}")
        return "", "unknown", False
    try:
        data = json.loads(result.stdout)
        return data.get("text", ""), data.get("provider_used", "?"), data.get("fallback_triggered", False)
    except json.JSONDecodeError:
        return result.stdout.strip(), "unknown", False


# ── Pipeline steps ────────────────────────────────────────────────────────────
def step_collect_context(app_key, session):
    log("Step 1/4: collect_context")
    app = APP_CONFIGS[app_key]
    work_dir = app["dir"]

    recent_commits = git_log_since(work_dir, session.get("last_commit"))
    head = git_head(work_dir)

    # Find entry points and test files
    entry_files = []
    test_files = []
    if work_dir.exists():
        for pattern in ["src/index.*", "index.*", "main.*", "src/main.*"]:
            found = list(work_dir.glob(pattern))
            entry_files.extend([str(f.relative_to(work_dir)) for f in found[:3]])
        for pattern in ["**/*.test.*", "**/*.spec.*", "test/**/*", "tests/**/*"]:
            found = list(work_dir.glob(pattern))
            test_files.extend([str(f.relative_to(work_dir)) for f in found[:10]])

    context = {
        "app": app_key,
        "description": app["description"],
        "work_dir": str(work_dir),
        "head_commit": head,
        "recent_commits": recent_commits,
        "entry_files": entry_files,
        "test_files": test_files,
        "test_cmds": app["test_cmds"],
        "qa_focus": app["qa_focus"],
        "app_exists": work_dir.exists(),
    }

    session["context"] = context
    session["last_commit"] = head
    return session


def step_plan_tests(app_key, session):
    log("Step 2/4: plan_tests (calling LLM via router)")
    ctx = session["context"]
    app = APP_CONFIGS[app_key]

    if not ctx.get("app_exists"):
        log("  App directory does not exist yet — skipping test planning")
        session["test_plan"] = [{"note": "App not built yet, no tests to run"}]
        return session

    prompt = f"""You are a QA agent reviewing a software project. Here is the context:

Project: {ctx['description']}
Directory: {ctx['work_dir']}
Head commit: {ctx.get('head_commit', 'unknown')}

Recent commits:
{chr(10).join(ctx.get('recent_commits', ['(no commits yet)']))}

Entry point files: {', '.join(ctx.get('entry_files', ['unknown'])) or 'none found'}
Test files found: {', '.join(ctx.get('test_files', [])) or 'none found'}

QA focus areas:
{ctx['qa_focus']}

Available test commands to try (in order): {ctx['test_cmds']}

Return a JSON array of test targets. Each object: {{"name": str, "command": str, "rationale": str}}
Return ONLY the JSON array, no markdown, no explanation."""

    system = "You are a concise QA engineer. Output only valid JSON."
    text, provider, fallback = llm(prompt, system)

    session["provider_used"] = provider
    session["fallback_triggered"] = fallback

    # Parse test plan from LLM response
    try:
        # Strip markdown fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        test_plan = json.loads(clean.strip())
    except (json.JSONDecodeError, IndexError):
        log(f"  Could not parse test plan JSON — using default test commands")
        test_plan = [{"name": cmd, "command": cmd, "rationale": "default"} for cmd in app["test_cmds"]]

    session["test_plan"] = test_plan
    log(f"  {len(test_plan)} test targets planned (via {provider})")
    return session


def step_run_tests(app_key, session):
    log("Step 3/4: run_tests")
    app = APP_CONFIGS[app_key]
    work_dir = app["dir"]

    if not work_dir.exists():
        log("  App directory does not exist — marking as environment issue")
        session["test_results"] = [{
            "command": "n/a",
            "exit_code": -1,
            "stdout": "",
            "stderr": "App directory does not exist yet",
            "env_issue": True,
        }]
        return session

    results = []
    seen_cmds = set()

    for target in session.get("test_plan", []):
        cmd = target.get("command", "")
        if not cmd or cmd in seen_cmds:
            continue
        seen_cmds.add(cmd)

        log(f"  Running: {cmd}")
        try:
            proc = subprocess.run(
                cmd, shell=True, cwd=work_dir,
                capture_output=True, text=True, timeout=120
            )
            results.append({
                "command": cmd,
                "name": target.get("name", cmd),
                "exit_code": proc.returncode,
                "stdout": proc.stdout[-3000:] if proc.stdout else "",
                "stderr": proc.stderr[-2000:] if proc.stderr else "",
                "env_issue": False,
            })
            status = "PASS" if proc.returncode == 0 else "FAIL"
            log(f"  {status} (exit {proc.returncode})")
            # Stop trying more commands once one succeeds (e.g. npm test worked)
            if proc.returncode == 0:
                break
        except subprocess.TimeoutExpired:
            results.append({
                "command": cmd,
                "name": target.get("name", cmd),
                "exit_code": -1,
                "stdout": "",
                "stderr": "Test timed out after 120s",
                "env_issue": True,
            })
            log(f"  TIMEOUT on {cmd}")

    session["test_results"] = results
    return session


def step_write_report(app_key, session):
    log("Step 4/4: write_report (calling LLM via router)")
    app = APP_CONFIGS[app_key]
    ctx = session["context"]
    results = session.get("test_results", [])

    # Build test summary for the prompt
    test_summary_lines = []
    for r in results:
        status = "PASS" if r["exit_code"] == 0 else ("ENV_ISSUE" if r.get("env_issue") else "FAIL")
        test_summary_lines.append(f"- [{status}] `{r['command']}` (exit {r['exit_code']})")
        if r.get("stderr") and r["exit_code"] != 0:
            test_summary_lines.append(f"  stderr: {r['stderr'][:500]}")

    prompt = f"""You are writing a QA report for a software project.

Project: {ctx['description']}
QA focus: {ctx['qa_focus']}

Recent commits:
{chr(10).join(ctx.get('recent_commits', ['(none)'])[:10])}

Test results:
{chr(10).join(test_summary_lines) or '(no tests ran)'}

Provider used: {session.get('provider_used', 'unknown')}
Fallback triggered: {session.get('fallback_triggered', False)}

Write a concise markdown QA report with these sections:
1. ## Summary (2-3 sentences)
2. ## Test Results (table: Test | Status | Notes)
3. ## Issues Found (bulleted list, or "None" if all pass)
4. ## Next Steps for Ralph (specific files and tests to address, if any)
5. ## Provider Info (which LLM provider was used, any fallback)

Be direct and actionable. Focus on what Ralph needs to know to fix failures."""

    system = "You are a concise technical QA reporter. Write clear markdown."
    text, provider, fallback = llm(prompt, system)

    if not text:
        text = "# QA Report\n\n_Report generation failed — LLM unavailable._\n"

    # Update session with final provider info (may differ from plan_tests step)
    if provider != "unknown":
        session["provider_used"] = provider
        session["fallback_triggered"] = fallback

    # Write report file
    app["report_dir"].mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    report_path = app["report_dir"] / f"{timestamp}.md"

    header = f"""---
session_id: {session['session_id']}
app: {app_key}
timestamp: {timestamp}
provider_used: {session.get('provider_used', 'unknown')}
fallback_triggered: {session.get('fallback_triggered', False)}
---

"""
    with open(report_path, "w") as f:
        f.write(header + text)

    log(f"  Report written: {report_path.relative_to(RALPH_DIR)}")
    session["last_report"] = str(report_path)
    return session


# ── Main pipeline runner ──────────────────────────────────────────────────────
def run_pipeline(app_key, force=False):
    if app_key not in APP_CONFIGS:
        log(f"ERROR: unknown app '{app_key}'. Choose: {', '.join(APP_CONFIGS)}")
        sys.exit(1)

    config = load_config()
    session = load_session(app_key)
    should, reason = should_run(app_key, session, config, force)

    if not should:
        log(f"Skipping QA for {app_key}: {reason}")
        log("Use --force to run anyway.")
        return

    log(f"Starting QA pipeline for: {app_key} ({reason})")

    # Resume or start fresh
    if session and session.get("status") == "in_progress":
        log(f"Resuming from step: {session['step']}")
    else:
        session = new_session(app_key)

    step_map = {
        "collect_context": step_collect_context,
        "plan_tests": step_plan_tests,
        "run_tests": step_run_tests,
        "write_report": step_write_report,
    }

    start_idx = STEPS.index(session["step"]) if session["step"] in STEPS else 0

    for step_name in STEPS[start_idx:]:
        session["step"] = step_name
        save_session(app_key, session)
        try:
            session = step_map[step_name](app_key, session)
        except KeyboardInterrupt:
            log(f"Interrupted at step {step_name}. State saved — rerun to resume.")
            save_session(app_key, session)
            sys.exit(130)
        except Exception as e:
            log(f"ERROR in step {step_name}: {e}")
            save_session(app_key, session)
            raise

    session["status"] = "completed"
    session["last_run"] = datetime.now().isoformat()
    session["step"] = "done"
    save_session(app_key, session)

    log(f"QA pipeline complete for {app_key}")
    log(f"  Provider used: {session.get('provider_used', 'unknown')}")
    if session.get("fallback_triggered"):
        log("  (cloud → local fallback was triggered)")
    if session.get("last_report"):
        log(f"  Report: {session['last_report']}")


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Goose QA pipeline runner")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--app", choices=list(APP_CONFIGS.keys()),
                       help="App to run QA for")
    group.add_argument("--auto", action="store_true",
                       help="Auto-detect active app from prd.json")
    parser.add_argument("--force", action="store_true",
                        help="Run even if cooldown/commit threshold not met")
    args = parser.parse_args()

    if args.auto:
        app_key = detect_active_app()
        if not app_key:
            log("No active app found in prd.json (all done or prd.json missing)")
            sys.exit(0)
        log(f"Auto-detected active app: {app_key}")
    else:
        app_key = args.app

    run_pipeline(app_key, force=args.force)
