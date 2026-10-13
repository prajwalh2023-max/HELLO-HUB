"""Deterministic sample records used until a real GitHub repository is available."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import pandas as pd


DEVELOPERS = [
    "alex-dev",
    "blair-dev",
    "casey-dev",
    "drew-dev",
    "ellis-dev",
    "frankie-dev",
]
REPOSITORIES = [
    "acme/platform",
    "acme/web-client",
    "acme/api-service",
    "acme/dev-tools",
]
FILES = [
    "src/auth/session.py",
    "src/api/routes.py",
    "src/components/dashboard.tsx",
    "src/db/models.py",
    "tests/test_api.py",
    "src/config/settings.py",
    "src/services/metrics.py",
    "docs/setup.md",
    "src/components/charts.tsx",
    "src/workers/sync.py",
    "tests/test_metrics.py",
]
TABLE_NAMES = ("pull_requests", "issues", "tasks", "sessions", "disruptions")


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat() if value else None


def build_demo_tables(seed: int = 42) -> dict[str, pd.DataFrame]:
    """Create repeatable synthetic activity with fields needed by the report formulas."""
    rng = random.Random(seed)
    start = datetime(2025, 2, 1, tzinfo=timezone.utc)
    end = datetime(2025, 4, 30, 23, 59, tzinfo=timezone.utc)
    span_hours = int((end - start).total_seconds() // 3600)

    pull_requests: list[dict] = []
    for number in range(1, 91):
        created = start + timedelta(hours=rng.randint(0, span_hours))
        author = rng.choice(DEVELOPERS)
        merged = rng.random() < 0.73
        merged_at = created + timedelta(hours=rng.randint(3, 180)) if merged else None
        if merged_at and merged_at > end:
            merged_at = end - timedelta(hours=rng.randint(1, 48))
        updated_at = merged_at or min(end, created + timedelta(hours=rng.randint(4, 350)))
        first_review = (
            created + timedelta(hours=rng.randint(1, 68))
            if rng.random() < 0.91
            else None
        )
        if first_review and first_review > end:
            first_review = None
        reviewers = rng.sample([person for person in DEVELOPERS if person != author], k=rng.randint(1, 3))
        files = rng.sample(FILES, k=rng.randint(1, 5))
        pull_requests.append(
            {
                "id": f"PR-{number:04d}",
                "number": number,
                "repository": rng.choice(REPOSITORIES),
                "author": author,
                "state": "merged" if merged else "open",
                "created_at": _iso(created),
                "updated_at": _iso(updated_at),
                "merged_at": _iso(merged_at),
                "first_review_at": _iso(first_review),
                "review_cycles": rng.randint(1, 4) if merged else 0,
                "changed_files": files,
                "reviewers": reviewers,
                "lines_changed": rng.randint(8, 820),
            }
        )

    issues: list[dict] = []
    for number in range(1, 101):
        created = start + timedelta(hours=rng.randint(0, span_hours))
        closed = rng.random() < 0.64
        closed_at = created + timedelta(hours=rng.randint(8, 500)) if closed else None
        if closed_at and closed_at > end:
            closed_at = None
            closed = False
        last_update = closed_at or min(end, created + timedelta(hours=rng.randint(2, 780)))
        assignee = rng.choice(DEVELOPERS)
        participants = rng.sample(
            [person for person in DEVELOPERS if person != assignee],
            k=rng.randint(0, 3),
        )
        issues.append(
            {
                "id": f"ISSUE-{number:04d}",
                "repository": rng.choice(REPOSITORIES),
                "title": f"Sample work item {number}",
                "state": "closed" if closed else "open",
                "assignee": assignee,
                "created_at": _iso(created),
                "updated_at": _iso(last_update),
                "closed_at": _iso(closed_at),
                "labels": rng.choice(["bug", "feature", "task", "maintenance"]),
                "participants": participants,
            }
        )

    tasks: list[dict] = []
    for number in range(1, 76):
        created = start + timedelta(hours=rng.randint(0, span_hours))
        assignee = rng.choice(DEVELOPERS)
        completed = rng.random() < 0.68
        duration_hours = round(rng.uniform(2, 95), 1) if completed else None
        completed_at = created + timedelta(hours=duration_hours) if completed else None
        due_at = created + timedelta(hours=rng.randint(24, 240))
        tasks.append(
            {
                "id": f"TASK-{number:04d}",
                "repository": rng.choice(REPOSITORIES),
                "title": f"Sample task {number}",
                "assignee": assignee,
                "created_at": _iso(created),
                "due_at": _iso(due_at),
                "completed_at": _iso(completed_at),
                "status": "completed" if completed else "open",
            }
        )

    sessions: list[dict] = []
    for number in range(1, 241):
        started = start + timedelta(hours=rng.randint(0, span_hours))
        sessions.append(
            {
                "id": f"SESSION-{number:04d}",
                "developer": rng.choice(DEVELOPERS),
                "started_at": _iso(started),
                "focused": rng.random() < 0.72,
            }
        )

    disruptions: list[dict] = []
    for number in range(1, 91):
        occurred = start + timedelta(hours=rng.randint(0, span_hours))
        recovered = rng.random() < 0.69
        recovered_at = occurred + timedelta(hours=rng.randint(1, 36)) if recovered else None
        disruptions.append(
            {
                "id": f"DISRUPTION-{number:04d}",
                "developer": rng.choice(DEVELOPERS),
                "occurred_at": _iso(occurred),
                "recovered_productively": recovered,
                "recovered_at": _iso(recovered_at),
                "type": rng.choice(["review blocked", "failed build", "dependency", "reopened work"]),
            }
        )

    raw = {
        "pull_requests": pull_requests,
        "issues": issues,
        "tasks": tasks,
        "sessions": sessions,
        "disruptions": disruptions,
    }
    return {name: pd.DataFrame(raw[name]) for name in TABLE_NAMES}
