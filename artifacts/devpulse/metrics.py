"""Metric calculations aligned to the formulas in Software Metrics Report 1."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd


def _utc_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if frame.empty or column not in frame:
        return pd.Series(dtype="datetime64[ns, UTC]", index=frame.index)
    return pd.to_datetime(frame[column], errors="coerce", utc=True)


def _window(frame: pd.DataFrame, column: str, start: date, end: date) -> pd.DataFrame:
    if frame.empty or column not in frame:
        return frame.iloc[0:0].copy()
    dates = _utc_series(frame, column)
    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = pd.Timestamp(end + timedelta(days=1), tz="UTC")
    return frame.loc[dates.ge(start_ts) & dates.lt(end_ts)].copy()


def _scope(
    frame: pd.DataFrame,
    repository: str | None,
    selected_developers: set[str] | None,
    developer_column: str,
) -> pd.DataFrame:
    result = frame.copy()
    if repository and repository != "All repositories" and "repository" in result:
        result = result.loc[result["repository"].eq(repository)].copy()
    if selected_developers and developer_column in result:
        result = result.loc[result[developer_column].isin(selected_developers)].copy()
    return result


def _duration_hours(frame: pd.DataFrame, start_col: str, end_col: str) -> pd.Series:
    start = _utc_series(frame, start_col)
    end = _utc_series(frame, end_col)
    return (end - start).dt.total_seconds() / 3600


def _number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if pd.notna(number) else default
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return []


def _active_as_of(
    frame: pd.DataFrame,
    end: date,
    threshold_days: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (open as of end date, stale among those open records)."""
    if frame.empty:
        return frame.copy(), frame.copy()
    created = _utc_series(frame, "created_at")
    updated = _utc_series(frame, "updated_at")
    end_exclusive = pd.Timestamp(end + timedelta(days=1), tz="UTC")
    stale_cutoff = pd.Timestamp(end - timedelta(days=threshold_days), tz="UTC")
    state = frame.get("state", pd.Series("open", index=frame.index)).astype(str).str.lower()
    still_open = state.eq("open") | state.eq("opened")
    active = frame.loc[created.lt(end_exclusive) & still_open].copy()
    active_updated = updated.loc[active.index]
    stale = active.loc[active_updated.lt(stale_cutoff)].copy()
    return active, stale


def calculate_metrics(
    tables: dict[str, pd.DataFrame],
    start: date,
    end: date,
    repository: str | None = None,
    selected_developers: set[str] | None = None,
    stale_after_days: int = 14,
) -> dict[str, Any]:
    """Calculate all 12 report metrics and return their supporting tables."""
    prs = tables.get("pull_requests", pd.DataFrame())
    issues = tables.get("issues", pd.DataFrame())
    tasks = tables.get("tasks", pd.DataFrame())
    sessions = tables.get("sessions", pd.DataFrame())
    disruptions = tables.get("disruptions", pd.DataFrame())

    prs = _scope(prs, repository, selected_developers, "author")
    issues = _scope(issues, repository, selected_developers, "assignee")
    tasks = _scope(tasks, repository, selected_developers, "assignee")
    sessions = _scope(sessions, repository, selected_developers, "developer")
    disruptions = _scope(disruptions, repository, selected_developers, "developer")

    prs_period = _window(prs, "created_at", start, end)
    merged_prs = _window(prs, "merged_at", start, end)
    merged_prs = merged_prs.loc[merged_prs["merged_at"].notna()].copy() if not merged_prs.empty else merged_prs
    period_months = max((end - start).days + 1, 1) / 30.4375

    prlt_hours = _duration_hours(merged_prs, "created_at", "merged_at")
    valid_prlt = prlt_hours[prlt_hours.ge(0)]
    prlt_days = valid_prlt / 24
    review_hours = _duration_hours(prs_period, "created_at", "first_review_at")
    valid_reviews = review_hours[review_hours.ge(0)]

    if not merged_prs.empty and "review_cycles" in merged_prs:
        cycles = pd.to_numeric(merged_prs["review_cycles"], errors="coerce").fillna(0)
        pric = float(cycles.sum() / len(merged_prs))
    else:
        pric = None

    active_prs, stale_prs = _active_as_of(prs, end, stale_after_days)
    active_issues, stale_issues = _active_as_of(issues, end, stale_after_days)
    active_work_count = len(active_prs) + len(active_issues)
    stale_work_count = len(stale_prs) + len(stale_issues)
    swr = stale_work_count / active_work_count * 100 if active_work_count else None

    issues_period = _window(issues, "created_at", start, end)
    tasks_period = _window(tasks, "created_at", start, end)
    tasks_completed = tasks.loc[
        _utc_series(tasks, "completed_at").ge(pd.Timestamp(start, tz="UTC"))
        & _utc_series(tasks, "completed_at").lt(pd.Timestamp(end + timedelta(days=1), tz="UTC"))
    ].copy() if not tasks.empty and "completed_at" in tasks else tasks.iloc[0:0].copy()
    task_hours = _duration_hours(tasks_completed, "created_at", "completed_at")
    valid_task_hours = task_hours[task_hours.ge(0)]
    tce = len(tasks_completed) / valid_task_hours.sum() if valid_task_hours.sum() else None
    if not tasks_completed.empty and "due_at" in tasks_completed:
        due = _utc_series(tasks_completed, "due_at")
        completed = _utc_series(tasks_completed, "completed_at")
        has_due = due.notna()
        dpr = float((completed[has_due] <= due[has_due]).mean() * 100) if has_due.any() else None
    else:
        dpr = None

    sessions_period = _window(sessions, "started_at", start, end)
    focused = (
        sessions_period["focused"].astype(str).str.lower().isin(["true", "1", "yes"])
        if not sessions_period.empty and "focused" in sessions_period
        else pd.Series(dtype=bool)
    )
    fss = float(focused.mean() * 100) if len(focused) else None

    disruptions_period = _window(disruptions, "occurred_at", start, end)
    recovered = (
        disruptions_period["recovered_productively"].astype(str).str.lower().isin(["true", "1", "yes"])
        if not disruptions_period.empty and "recovered_productively" in disruptions_period
        else pd.Series(dtype=bool)
    )
    pri = float(recovered.mean() * 100) if len(recovered) else None

    # Workload is an explicitly labeled activity-count proxy: authored PRs,
    # assigned issues, and assigned tasks each contribute one work unit.
    work_parts = []
    for frame, person_col, date_col in (
        (prs_period, "author", "created_at"),
        (issues_period, "assignee", "created_at"),
        (tasks_period, "assignee", "created_at"),
    ):
        if not frame.empty and person_col in frame:
            work_parts.append(frame[person_col].fillna("Unassigned").value_counts())
    work_units = pd.concat(work_parts).groupby(level=0).sum() if work_parts else pd.Series(dtype=float)
    workload = (
        pd.DataFrame({"Developer": work_units.index, "Work units": work_units.values})
        .sort_values("Work units", ascending=False)
        if len(work_units)
        else pd.DataFrame(columns=["Developer", "Work units"])
    )
    if not workload.empty:
        workload["Workload share %"] = workload["Work units"] / workload["Work units"].sum() * 100

    team = set()
    for frame, col in (
        (prs_period, "author"),
        (issues_period, "assignee"),
        (tasks_period, "assignee"),
        (sessions_period, "developer"),
    ):
        if not frame.empty and col in frame:
            team.update(frame[col].dropna().astype(str))
    team_size = len(team)
    collaborator_sets: dict[str, set[str]] = {person: set() for person in team}
    for _, row in prs_period.iterrows():
        author = str(row.get("author", ""))
        if author not in collaborator_sets:
            continue
        collaborator_sets[author].update(
            person for person in _as_list(row.get("reviewers")) if person != author
        )
    for _, row in issues_period.iterrows():
        assignee = str(row.get("assignee", ""))
        if assignee not in collaborator_sets:
            continue
        collaborator_sets[assignee].update(
            person for person in _as_list(row.get("participants")) if person != assignee
        )
    collaboration = pd.DataFrame(
        [
            {
                "Developer": person,
                "Unique collaborators": len(collaborators),
                "Team members": team_size,
                "CRS %": len(collaborators) / team_size * 100 if team_size else None,
            }
            for person, collaborators in collaborator_sets.items()
        ]
    )
    if not collaboration.empty:
        collaboration = collaboration.sort_values("CRS %", ascending=False)
    crs = float(collaboration["CRS %"].mean()) if not collaboration.empty else None

    file_touches: dict[str, int] = {}
    for files in prs_period.get("changed_files", pd.Series(dtype=object)):
        for path in _as_list(files):
            file_touches[path] = file_touches.get(path, 0) + 1
    hotspots = pd.DataFrame(
        [
            {"File": path, "Changes": count, "Changes per month": count / period_months}
            for path, count in file_touches.items()
        ]
    )
    if not hotspots.empty:
        hotspots = hotspots.sort_values("Changes", ascending=False)
    chf = float(hotspots["Changes per month"].mean()) if not hotspots.empty else None

    by_developer = []
    developers = sorted(team)
    for person in developers:
        person_prs = prs_period.loc[prs_period.get("author", pd.Series(index=prs_period.index, dtype=object)).eq(person)]
        person_merged = merged_prs.loc[merged_prs.get("author", pd.Series(index=merged_prs.index, dtype=object)).eq(person)]
        person_issues = issues_period.loc[issues_period.get("assignee", pd.Series(index=issues_period.index, dtype=object)).eq(person)]
        person_tasks = tasks_completed.loc[tasks_completed.get("assignee", pd.Series(index=tasks_completed.index, dtype=object)).eq(person)]
        person_reviews = person_prs.loc[person_prs.get("first_review_at", pd.Series(index=person_prs.index, dtype=object)).notna()]
        author_prlt = _duration_hours(person_merged, "created_at", "merged_at")
        author_rrt = _duration_hours(person_reviews, "created_at", "first_review_at")
        person_sessions = sessions_period.loc[sessions_period.get("developer", pd.Series(index=sessions_period.index, dtype=object)).eq(person)]
        person_disruptions = disruptions_period.loc[disruptions_period.get("developer", pd.Series(index=disruptions_period.index, dtype=object)).eq(person)]
        dev_focus = (
            person_sessions["focused"].astype(str).str.lower().isin(["true", "1", "yes"]).mean() * 100
            if len(person_sessions) and "focused" in person_sessions else None
        )
        dev_recovery = (
            person_disruptions["recovered_productively"].astype(str).str.lower().isin(["true", "1", "yes"]).mean() * 100
            if len(person_disruptions) and "recovered_productively" in person_disruptions else None
        )
        person_collabs = collaborator_sets.get(person, set())
        by_developer.append(
            {
                "Developer": person,
                "Merged PRs": len(person_merged),
                "PRs/month": len(person_merged) / period_months,
                "Average PR lead time (days)": (author_prlt[author_prlt.ge(0)].mean() / 24) if len(author_prlt) else None,
                "Average first response (hours)": author_rrt[author_rrt.ge(0)].mean() if len(author_rrt) else None,
                "Issues assigned": len(person_issues),
                "Tasks completed": len(person_tasks),
                "Workload units": int(work_units.get(person, 0)),
                "Unique collaborators": len(person_collabs),
                "FSS %": dev_focus,
                "PRI %": dev_recovery,
            }
        )

    monthly_rows = []
    if not prs.empty:
        merged_dates = _utc_series(merged_prs, "merged_at").dropna()
        if not merged_dates.empty:
            monthly_rows = (
                merged_dates.dt.tz_convert(None)
                .dt.to_period("M")
                .value_counts()
                .sort_index()
                .rename_axis("Month")
                .reset_index(name="Merged PRs")
            )
            monthly_rows["Month"] = monthly_rows["Month"].astype(str)

    metrics = {
        "PRT": len(merged_prs) / period_months if len(merged_prs) else 0.0,
        "PRLT mean days": float(prlt_days.mean()) if len(prlt_days) else None,
        "PRLT median days": float(prlt_days.median()) if len(prlt_days) else None,
        "RRT mean hours": float(valid_reviews.mean()) if len(valid_reviews) else None,
        "PRIC cycles per merged PR": pric,
        "SWR %": swr,
        "TCE tasks per hour": tce,
        "DWB": workload,
        "CRS mean %": crs,
        "CHF mean changes per month": chf,
        "DPR %": dpr,
        "FSS %": fss,
        "PRI %": pri,
        "Merged PRs": len(merged_prs),
        "Active work items": active_work_count,
        "Stale work items": stale_work_count,
        "Completed tasks": len(tasks_completed),
        "Total development hours": float(valid_task_hours.sum()),
        "Sessions": len(sessions_period),
        "Disruptions": len(disruptions_period),
        "Team members": team_size,
    }
    return {
        "metrics": metrics,
        "by_developer": pd.DataFrame(by_developer),
        "workload": workload,
        "collaboration": collaboration,
        "hotspots": hotspots,
        "monthly": pd.DataFrame(monthly_rows),
        "pull_requests": prs_period,
        "issues": issues_period,
        "tasks": tasks_period,
        "active_prs": active_prs,
        "stale_prs": stale_prs,
        "active_issues": active_issues,
        "stale_issues": stale_issues,
        "merged_prs": merged_prs,
        "tasks_completed": tasks_completed,
        "sessions": sessions_period,
        "disruptions": disruptions_period,
    }
