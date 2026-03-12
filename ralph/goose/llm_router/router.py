#!/usr/bin/env python3
"""
LLM Provider Router — Ollama Cloud primary, local Ollama fallback.
Switch providers by editing config.json: "active_profile": "ollama" | "qwen"

Usage:
  python router.py --prompt "your prompt here"
  python router.py --prompt "your prompt" --system "you are a code reviewer"
  python router.py --prompt "..." --raw   # pretty-print text only, no JSON wrapper
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)

# ── Paths ─────────────────────────────────────────────────────────────────────
ROUTER_DIR = Path(__file__).parent
CONFIG_PATH = ROUTER_DIR / "config.json"
COOLDOWN_PATH = ROUTER_DIR / "cooldown.json"


# ── Error types ───────────────────────────────────────────────────────────────
class RateLimitError(Exception):
    def __init__(self, provider, message):
        self.provider = provider
        self.message = message
        super().__init__(f"[{provider}] Rate limit: {message}")


class TransientError(Exception):
    def __init__(self, provider, message):
        self.provider = provider
        self.message = message
        super().__init__(f"[{provider}] Transient error: {message}")


class PermanentError(Exception):
    def __init__(self, provider, message):
        self.provider = provider
        self.message = message
        super().__init__(f"[{provider}] Permanent error: {message}")


# ── Config loader ─────────────────────────────────────────────────────────────
def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def get_active_providers(config):
    profile_name = config["active_profile"]
    profile = config["profiles"][profile_name]
    primary = config["providers"][profile["primary_provider"]]
    primary["name"] = profile["primary_provider"]
    fallback = config["providers"][profile["fallback_provider"]]
    fallback["name"] = profile["fallback_provider"]
    return primary, fallback


# ── Cooldown management ───────────────────────────────────────────────────────
def load_cooldown():
    if COOLDOWN_PATH.exists():
        with open(COOLDOWN_PATH) as f:
            return json.load(f)
    return {}


def save_cooldown(state):
    with open(COOLDOWN_PATH, "w") as f:
        json.dump(state, f, indent=2)


def is_cooling_down(provider_name, config):
    state = load_cooldown()
    if provider_name not in state:
        return False
    disabled_until = datetime.fromisoformat(state[provider_name]["disabled_until"])
    if datetime.now() < disabled_until:
        return True
    # Expired — remove
    del state[provider_name]
    save_cooldown(state)
    return False


def set_cooldown(provider_name, config):
    minutes = config.get("cooldown_minutes", 45)
    disabled_until = datetime.now() + timedelta(minutes=minutes)
    state = load_cooldown()
    state[provider_name] = {"disabled_until": disabled_until.isoformat()}
    save_cooldown(state)
    log(f"  {provider_name} cooling down until {disabled_until.strftime('%H:%M')}")


# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg):
    print(f"[router {datetime.now().strftime('%H:%M:%S')}] {msg}", file=sys.stderr)


# ── Rate-limit detection ──────────────────────────────────────────────────────
def check_rate_limit(provider_name, response, config):
    keywords = config.get("rate_limit_keywords", [])
    if response.status_code in (429, 403):
        raise RateLimitError(provider_name, f"HTTP {response.status_code}")
    try:
        body = response.text.lower()
        for kw in keywords:
            if kw.lower() in body:
                raise RateLimitError(provider_name, f"keyword '{kw}' in response body")
    except RateLimitError:
        raise
    except Exception:
        pass


# ── Provider clients ──────────────────────────────────────────────────────────
def send_ollama(provider, prompt, system_prompt, config):
    """Call Ollama /api/generate (works for both cloud and local)."""
    host = provider["host"].rstrip("/")
    url = f"{host}/api/generate"
    api_key = None
    if provider.get("api_key_env"):
        api_key = os.environ.get(provider["api_key_env"])
        if not api_key:
            raise PermanentError(
                provider["name"],
                f"env var {provider['api_key_env']} not set"
            )

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": provider["model"],
        "prompt": prompt,
        "stream": False,
    }
    if system_prompt:
        payload["system"] = system_prompt

    timeout = provider.get("timeout_seconds", 60)
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.Timeout:
        raise TransientError(provider["name"], "request timed out")
    except requests.ConnectionError as e:
        raise TransientError(provider["name"], f"connection error: {e}")

    check_rate_limit(provider["name"], resp, config)

    if resp.status_code == 401:
        raise PermanentError(provider["name"], "invalid API key (401)")
    if resp.status_code >= 500:
        raise TransientError(provider["name"], f"server error HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise TransientError(provider["name"], f"unexpected HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    return {
        "text": data.get("response", ""),
        "provider": provider["name"],
        "model": provider["model"],
        "tokens": data.get("eval_count", 0),
    }


def send_openai_compat(provider, prompt, system_prompt, config):
    """Call OpenAI-compatible /chat/completions (Qwen Lite, DeepSeek, etc.)."""
    host = provider["host"].rstrip("/")
    url = f"{host}/chat/completions"
    api_key = os.environ.get(provider["api_key_env"], "")
    if not api_key:
        raise PermanentError(
            provider["name"],
            f"env var {provider['api_key_env']} not set"
        )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": provider["model"],
        "messages": messages,
    }

    timeout = provider.get("timeout_seconds", 60)
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.Timeout:
        raise TransientError(provider["name"], "request timed out")
    except requests.ConnectionError as e:
        raise TransientError(provider["name"], f"connection error: {e}")

    check_rate_limit(provider["name"], resp, config)

    if resp.status_code == 401:
        raise PermanentError(provider["name"], "invalid API key (401)")
    if resp.status_code >= 500:
        raise TransientError(provider["name"], f"server error HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise TransientError(provider["name"], f"unexpected HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return {
        "text": text,
        "provider": provider["name"],
        "model": provider["model"],
        "tokens": usage.get("total_tokens", 0),
    }


def send_to_provider(provider, prompt, system_prompt, config):
    """Dispatch to the correct client based on provider type."""
    ptype = provider.get("type", "ollama")
    if ptype == "ollama":
        return send_ollama(provider, prompt, system_prompt, config)
    elif ptype == "openai_compat":
        return send_openai_compat(provider, prompt, system_prompt, config)
    else:
        raise PermanentError(provider["name"], f"unknown provider type: {ptype}")


# ── Router ────────────────────────────────────────────────────────────────────
def route(prompt, system_prompt=None):
    """
    Send prompt through the router. Returns:
      {text, provider_used, fallback_triggered, error_summary}
    """
    config = load_config()
    primary, fallback = get_active_providers(config)

    fallback_triggered = False
    error_summary = None

    # Skip primary if it's cooling down
    if is_cooling_down(primary["name"], config):
        log(f"  {primary['name']} is cooling down — going straight to fallback")
        fallback_triggered = True
    else:
        # Try primary
        try:
            log(f"  Trying primary: {primary['name']} ({primary['model']})")
            result = send_to_provider(primary, prompt, system_prompt, config)
            result["fallback_triggered"] = False
            result["error_summary"] = None
            log(f"  OK — {primary['name']} ({result['tokens']} tokens)")
            return result
        except RateLimitError as e:
            log(f"  Rate limit on {e.provider}: {e.message}")
            set_cooldown(primary["name"], config)
            fallback_triggered = True
            error_summary = str(e)
        except TransientError as e:
            log(f"  Transient error on {e.provider}: {e.message} — retrying once...")
            time.sleep(5)
            try:
                result = send_to_provider(primary, prompt, system_prompt, config)
                result["fallback_triggered"] = False
                result["error_summary"] = None
                log(f"  OK on retry — {primary['name']}")
                return result
            except Exception as retry_e:
                log(f"  Retry failed: {retry_e} — falling back to {fallback['name']}")
                fallback_triggered = True
                error_summary = str(retry_e)
        except PermanentError as e:
            log(f"  Permanent error on {e.provider}: {e.message} — failing fast")
            return {
                "text": "",
                "provider_used": primary["name"],
                "fallback_triggered": False,
                "error_summary": str(e),
            }

    # Try fallback
    try:
        log(f"  Trying fallback: {fallback['name']} ({fallback['model']})")
        result = send_to_provider(fallback, prompt, system_prompt, config)
        result["fallback_triggered"] = fallback_triggered
        result["error_summary"] = error_summary
        result["provider_used"] = result.pop("provider")
        log(f"  OK — {fallback['name']} ({result['tokens']} tokens)")
        return result
    except Exception as e:
        log(f"  Fallback also failed: {e}")
        return {
            "text": "",
            "provider_used": f"{primary['name']}→{fallback['name']}",
            "fallback_triggered": True,
            "error_summary": f"both providers failed. last: {e}",
        }


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM router: Ollama Cloud → local fallback")
    parser.add_argument("--prompt", required=True, help="User prompt to send")
    parser.add_argument("--system", default=None, help="Optional system prompt")
    parser.add_argument("--raw", action="store_true", help="Print text only, no JSON wrapper")
    args = parser.parse_args()

    result = route(args.prompt, args.system)

    if args.raw:
        print(result["text"])
    else:
        print(json.dumps(result, indent=2))

    if not result.get("text"):
        sys.exit(1)
