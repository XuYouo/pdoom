#!/usr/bin/env python3
"""Opt-in smoke against the local test server. Never prints or persists a bearer token."""
import json
import os
from pathlib import Path
import sys
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
assert ROOT.name == "backend"
STATE = ROOT / ".local" / "http-smoke-state.json"
BASE = "http://127.0.0.1:8081/api/"
PASSWORD = "ephemeral-smoke-fixture-password"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def post(action, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(BASE + action, json.dumps(body).encode(), headers, method="POST")
    with OPENER.open(request, timeout=15) as response:
        assert response.status == 200
        assert response.headers["Cache-Control"] == "no-store"
        return json.load(response)


def score(run_id):
    return {"runId": run_id, "score": 2468, "stage": 5, "durationMs": 120000, "doom": 50, "ending": "warden"}


def create():
    assert not STATE.exists(), "Existing smoke state retained; run check or choose a new isolated cluster."
    username = "smoke_" + uuid.uuid4().hex[:20]
    auth = post("registeruserapi", {"username": username, "password": PASSWORD})
    token = auth["token"]
    run_id = str(uuid.uuid4())
    save = {"schemaVersion": 1, "runId": run_id, "seed": 42, "stage": 5, "checkpoint": 1,
            "hp": 75, "doom": 50, "tokens": 123, "score": 2468, "elapsedMs": 120000,
            "inventory": ["constitutional", "lisp"], "upgrades": ["reinforced"], "donated": True,
            "actionCounts": {"shots": 50, "dashes": 10, "rewinds": 4, "insights": 3}}
    written = post("savegameapi", {"save": save, "expectedRevision": 0}, token)
    assert written["revision"] == 1
    submitted = post("submitscoreapi", score(run_id), token)
    assert submitted["personalBest"] is True
    state = {"username": username, "save": save, "submission": submitted}
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
        json.dump(state, output)
    print("PASS Main 127.0.0.1:8081 register/save/submit; non-secret restart fixture retained")


def check():
    state = json.loads(STATE.read_text())
    auth = post("loginuserapi", {"username": state["username"], "password": PASSWORD})
    token = auth["token"]
    loaded = post("loadgameapi", {}, token)
    assert loaded["revision"] == 1 and loaded["save"] == state["save"]
    replay = post("submitscoreapi", score(state["save"]["runId"]), token)
    assert replay == state["submission"]
    leaderboard = post("listleaderboardapi", {"limit": 50, "offset": 0})
    assert any(item["username"] == state["username"] and item["score"] == 2468 for item in leaderboard["entries"])
    assert post("logoutuserapi", {}, token) == {"loggedOut": True}
    print("PASS restart persisted account/save/revision/idempotent score/leaderboard/logout")


if __name__ == "__main__":
    assert len(sys.argv) == 2 and sys.argv[1] in {"create", "check"}, "Usage: http-smoke.py create|check"
    (create if sys.argv[1] == "create" else check)()
