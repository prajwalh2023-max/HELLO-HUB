"""Streamlit entry point for the report-aligned DevPulse dashboard."""

from __future__ import annotations

import json
from datetime import date

import pandas as pd
import plotly.express as px
import streamlit as st

from demo_data import TABLE_NAMES
from metrics import calculate_metrics
from storage import export_payload, load_tables, save_tables, validate_payload


st.set_page_config(
    page_title="DevPulse · Software Metrics",
    page_icon="📊",
    layout="wide",
)

PAGES = [
    "Overview",
    "Developer comparison",
    "Pull requests",
    "Review performance",
    "Tasks & stale work",
    "Workload & collaboration",
    "Change hotspots",
    "Focus & recovery",
    "Metric definitions",
    "Data source",
]


def _date_bounds(tables: dict[str, pd.DataFrame]) -> tuple[date, date]:
    values = []
    for table_name, column in (
        ("pull_requests", "created_at"),
        ("issues", "created_at"),
        ("tasks", "created_at"),
        ("sessions", "started_at"),
        ("disruptions", "occurred_at"),
    ):
        frame = tables.get(table_name, pd.DataFrame())
        if column in frame:
            dates = pd.to_datetime(frame[column], errors="coerce", utc=True).dropna()
            values.extend(dates.dt.date.tolist())
    if not values:
        today = date.today()
        return today, today
    return min(values), max(values)


def _repositories(tables: dict[str, pd.DataFrame]) -> list[str]:
    found = set()
    for name in ("pull_requests", "issues", "tasks"):
        frame = tables.get(name, pd.DataFrame())
        if "repository" in frame:
            found.update(frame["repository"].dropna().astype(str))
    return ["All repositories", *sorted(found)]


def _developers(tables: dict[str, pd.DataFrame]) -> list[str]:
    found = set()
    for name, column in (
        ("pull_requests", "author"),
        ("issues", "assignee"),
        ("tasks", "assignee"),
        ("sessions", "developer"),
        ("disruptions", "developer"),
    ):
        frame = tables.get(name, pd.DataFrame())
        if column in frame:
            found.update(frame[column].dropna().astype(str))
    return sorted(found)


def _filtered_table(frame: pd.DataFrame, repository: str, person_column: str, people: list[str]) -> pd.DataFrame:
    result = frame.copy()
    if repository != "All repositories" and "repository" in result:
        result = result.loc[result["repository"].eq(repository)].copy()
    if people and person_column in result:
        result = result.loc[result[person_column].isin(people)].copy()
    return result


def _metric_row(items: list[tuple[str, str, str]]) -> None:
    columns = st.columns(len(items))
    for column, (label, value, help_text) in zip(columns, items):
        column.metric(label, value, help=help_text)


def _pct(value: float | None) -> str:
    return "n/a" if value is None or pd.isna(value) else f"{value:.1f}%"


def _days(value: float | None) -> str:
    return "n/a" if value is None or pd.isna(value) else f"{value:.1f} days"


def _hours(value: float | None) -> str:
    return "n/a" if value is None or pd.isna(value) else f"{value:.1f} hours"


def _number(value: float | None, digits: int = 1) -> str:
    return "n/a" if value is None or pd.isna(value) else f"{value:.{digits}f}"


def _render_overview(result: dict, metrics: dict, period_days: int) -> None:
    st.title("Developer Productivity Metrics")
    st.caption(f"Report-aligned dashboard · Analysis window: {period_days} days")
    _metric_row(
        [
            ("PR throughput", f"{metrics['PRT']:.1f} / month", "Merged pull requests divided by the selected period in months."),
            ("Average PR lead time", _days(metrics["PRLT mean days"]), "Mean time from pull request creation to merge."),
            ("First review response", _hours(metrics["RRT mean hours"]), "Mean time from pull request creation to first recorded review."),
            ("Stale work ratio", _pct(metrics["SWR %"]), "Stale open issues and PRs divided by all open issues and PRs at the period end."),
        ]
    )
    st.subheader("Delivery and activity")
    left, right = st.columns(2)
    with left:
        monthly = result["monthly"]
        if monthly.empty:
            st.info("No merged PRs in the selected period.")
        else:
            st.plotly_chart(
                px.bar(monthly, x="Month", y="Merged PRs", title="Merged pull requests by month"),
                use_container_width=True,
            )
    with right:
        workload = result["workload"]
        if workload.empty:
            st.info("No developer work records in the selected period.")
        else:
            st.plotly_chart(
                px.bar(
                    workload,
                    x="Developer",
                    y="Workload share %",
                    title="Workload share (activity-count proxy)",
                ),
                use_container_width=True,
            )
    st.subheader("Metric snapshot")
    _metric_row(
        [
            ("Iteration count", _number(metrics["PRIC cycles per merged PR"]), "Average review/revision cycles per merged PR."),
            ("Task efficiency", _number(metrics["TCE tasks per hour"], 3), "Completed tasks per development hour, using task duration as a proxy."),
            ("Delivery predictability", _pct(metrics["DPR %"]), "Completed tasks finished on or before their supplied due date."),
            ("Change hotspots", _number(metrics["CHF mean changes per month"]), "Mean file touches per month across files changed in the period."),
        ]
    )
    st.caption(
        "Use these measures to inspect workflow patterns, not to rank individual performance. "
        "Workload is an activity-count proxy, not a measure of effort or quality."
    )


def _render_developers(result: dict) -> None:
    st.title("Developer comparison")
    st.caption("Compare workflow context side by side; the demo values are not individual performance ratings.")
    frame = result["by_developer"]
    if frame.empty:
        st.info("No developer activity matches these filters.")
    else:
        st.dataframe(frame, hide_index=True, use_container_width=True)
        st.plotly_chart(
            px.bar(frame, x="Developer", y="Merged PRs", title="Merged pull requests by author"),
            use_container_width=True,
        )


def _render_pull_requests(result: dict, metrics: dict) -> None:
    st.title("Pull request analytics")
    _metric_row(
        [
            ("Merged in period", str(metrics["Merged PRs"]), "Merged pull requests in the selected date window."),
            ("Throughput", f"{metrics['PRT']:.1f} / month", "Merged PRs normalized to a 30.4375-day month."),
            ("Mean lead time", _days(metrics["PRLT mean days"]), "Creation to merge, averaged across merged pull requests."),
            ("Median lead time", _days(metrics["PRLT median days"]), "Median creation-to-merge time."),
        ]
    )
    st.subheader("Pull request iteration count")
    st.metric("Review/revision cycles per merged PR", _number(metrics["PRIC cycles per merged PR"]))
    st.caption("The demo stores a cycle count per PR. A live GitHub importer must derive this from review and revision events.")
    frame = result["pull_requests"].copy()
    if not frame.empty:
        columns = [c for c in ("id", "repository", "author", "state", "created_at", "merged_at", "review_cycles") if c in frame]
        st.dataframe(frame[columns].sort_values("created_at", ascending=False), hide_index=True, use_container_width=True)
    else:
        st.info("No pull requests match the selected filters.")


def _render_reviews(result: dict, metrics: dict) -> None:
    st.title("Review performance")
    _metric_row(
        [
            ("Average first response", _hours(metrics["RRT mean hours"]), "Time from PR creation to first review."),
            ("PRs with a recorded review", str(result["pull_requests"].get("first_review_at", pd.Series(dtype=object)).notna().sum()), "A missing first review is excluded from the response-time average."),
            ("Iteration cycles / merged PR", _number(metrics["PRIC cycles per merged PR"]), "Average review/revision cycle count."),
        ]
    )
    frame = result["pull_requests"].copy()
    if not frame.empty and "first_review_at" in frame:
        created = pd.to_datetime(frame["created_at"], errors="coerce", utc=True)
        reviewed = pd.to_datetime(frame["first_review_at"], errors="coerce", utc=True)
        frame["First response (hours)"] = (reviewed - created).dt.total_seconds() / 3600
        response = frame.loc[frame["First response (hours)"].ge(0)]
        if not response.empty:
            st.plotly_chart(
                px.histogram(response, x="First response (hours)", nbins=16, title="First-review response-time distribution"),
                use_container_width=True,
            )
            st.dataframe(
                response[[c for c in ("id", "repository", "author", "First response (hours)", "review_cycles") if c in response]],
                hide_index=True,
                use_container_width=True,
            )
        else:
            st.info("No first-review timestamps are available in this period.")


def _render_tasks(result: dict, metrics: dict) -> None:
    st.title("Tasks and stale work")
    _metric_row(
        [
            ("Stale work ratio", _pct(metrics["SWR %"]), "Open issues and PRs inactive beyond the selected threshold at period end."),
            ("Active work items", str(metrics["Active work items"]), "Open issues and PRs at the selected period end."),
            ("Task completion efficiency", _number(metrics["TCE tasks per hour"], 3), "Completed tasks per hour, using created-to-completed time."),
            ("Delivery predictability", _pct(metrics["DPR %"]), "Completed tasks finished by their due dates."),
        ]
    )
    st.write(f"Stale items: **{metrics['Stale work items']}** of **{metrics['Active work items']}** active PRs and issues.")
    left, right = st.columns(2)
    with left:
        st.subheader("Task records")
        st.dataframe(result["tasks"], hide_index=True, use_container_width=True)
    with right:
        st.subheader("Open work at period end")
        st.write("Stale pull requests")
        st.dataframe(result["stale_prs"], hide_index=True, use_container_width=True)
        st.write("Stale issues")
        st.dataframe(result["stale_issues"], hide_index=True, use_container_width=True)
    st.caption("Due dates are not native GitHub issue fields; live data needs a project convention or supplied task estimates.")


def _render_workload_collaboration(result: dict, metrics: dict) -> None:
    st.title("Workload and collaboration")
    _metric_row(
        [
            ("Team members", str(metrics["Team members"]), "Contributors with activity in the selected window."),
            ("Mean collaboration reach", _pct(metrics["CRS mean %"]), "Mean unique collaborators divided by observed team size."),
        ]
    )
    left, right = st.columns(2)
    with left:
        st.subheader("Workload distribution")
        workload = result["workload"]
        if workload.empty:
            st.info("No workload records match these filters.")
        else:
            st.plotly_chart(
                px.bar(workload, x="Developer", y="Workload share %", title="Developer workload share"),
                use_container_width=True,
            )
            st.dataframe(workload, hide_index=True, use_container_width=True)
    with right:
        st.subheader("Collaboration reach")
        collaborators = result["collaboration"]
        if collaborators.empty:
            st.info("No collaboration records match these filters.")
        else:
            st.plotly_chart(
                px.bar(collaborators, x="Developer", y="CRS %", title="Unique collaborator reach"),
                use_container_width=True,
            )
            st.dataframe(collaborators, hide_index=True, use_container_width=True)
    st.caption("Workload uses one activity unit per authored PR, assigned issue, or assigned task. It is not effort or quality.")


def _render_hotspots(result: dict, metrics: dict) -> None:
    st.title("Change hotspots")
    st.metric("Mean file changes per month", _number(metrics["CHF mean changes per month"]))
    hotspots = result["hotspots"]
    if hotspots.empty:
        st.info("No changed-file records match this period.")
        return
    st.plotly_chart(
        px.bar(hotspots.head(20), x="Changes per month", y="File", orientation="h", title="Most frequently changed files"),
        use_container_width=True,
    )
    st.dataframe(hotspots, hide_index=True, use_container_width=True)
    st.caption("A hotspot may reflect an important shared component, not a defect.")


def _render_custom_metrics(result: dict, metrics: dict) -> None:
    st.title("Focus stability and recovery")
    st.warning(
        "These are proposed metrics, not validated measurements. The displayed demo records are synthetic. "
        "GitHub does not directly observe focus sessions or actual return-to-work time."
    )
    _metric_row(
        [
            ("Focus Stability Score (FSS)", _pct(metrics["FSS %"]), "Focused development sessions / all recorded sessions."),
            ("Productivity Recovery Index (PRI)", _pct(metrics["PRI %"]), "Productive recovery events / all recorded disruption events."),
            ("Sessions in sample", str(metrics["Sessions"]), "Recorded development sessions."),
            ("Disruptions in sample", str(metrics["Disruptions"]), "Recorded interruption events."),
        ]
    )
    st.subheader("Inputs")
    left, right = st.columns(2)
    with left:
        st.write("Development sessions")
        st.dataframe(result["sessions"], hide_index=True, use_container_width=True)
    with right:
        st.write("Disruption and recovery records")
        st.dataframe(result["disruptions"], hide_index=True, use_container_width=True)
    st.caption("FSS and PRI require a separately agreed event-collection method before they can be treated as real measurements.")


def _render_definitions(metrics: dict) -> None:
    st.title("Metric definitions")
    st.caption("These definitions follow Report 1. Values are only as reliable as the source data and the operational definitions.")
    definitions = [
        ("PRT · Pull Request Throughput", "Merged pull requests / analysis period", "Merged PRs per month."),
        ("PRLT · Pull Request Lead Time", "Merge timestamp − PR creation timestamp", "Mean and median, in days."),
        ("RRT · Review Responsiveness Time", "First review timestamp − PR submission timestamp", "Mean, in hours."),
        ("PRIC · Pull Request Iteration Count", "Review/revision cycles / merged PRs", "Requires revision-cycle derivation for live data."),
        ("SWR · Stale Work Ratio", "Stale active issues and PRs / all active issues and PRs × 100", "Stale threshold is configurable."),
        ("TCE · Task Completion Efficiency", "Completed tasks / total development time", "Shown as completed tasks per hour."),
        ("DWB · Developer Workload Balance", "Developer workload / total team workload × 100", "Current demo uses activity-count units; not effort."),
        ("CRS · Collaboration Reach Score", "Unique collaborators / team members × 100", "Derived from recorded PR reviewers and issue participants."),
        ("CHF · Change Hotspot Frequency", "File/component changes / analysis period", "Shown as file touches per month."),
        ("DPR · Delivery Predictability Rate", "Tasks completed by due date / completed tasks × 100", "Needs an expected due date for each task."),
        ("FSS · Focus Stability Score", "Focused development sessions / total sessions × 100", "Requires session/task-switching instrumentation."),
        ("PRI · Productivity Recovery Index", "Productive recovery events / disruption events × 100", "Requires interruption and recovery event data."),
    ]
    st.dataframe(
        pd.DataFrame(definitions, columns=["Metric", "Report formula", "Implementation note"]),
        hide_index=True,
        use_container_width=True,
    )
    st.caption(
        f"Current computed values: PRT {metrics['PRT']:.1f}/month · "
        f"PRLT {_days(metrics['PRLT mean days'])} · RRT {_hours(metrics['RRT mean hours'])} · "
        f"SWR {_pct(metrics['SWR %'])} · FSS {_pct(metrics['FSS %'])} · PRI {_pct(metrics['PRI %'])}."
    )


def _render_data_source(tables: dict[str, pd.DataFrame], source: str) -> None:
    st.title("Data source")
    if source == "demo":
        st.warning("Demo mode: this dataset is synthetic and is not connected to GitHub.")
    elif source == "imported":
        st.info("Imported JSON snapshot: this is not a live GitHub connection.")
    else:
        st.info(f"Current data source: {source}")
    st.write(
        "Activity is stored locally in SQLite. There is no GitHub repository connected yet. "
        "When you have a repository, the GitHub REST API collector can replace this demo/import step."
    )
    st.subheader("Current dataset")
    counts = pd.DataFrame(
        [{"Dataset": name.replace("_", " ").title(), "Records": len(tables.get(name, pd.DataFrame()))} for name in TABLE_NAMES]
    )
    st.dataframe(counts, hide_index=True, use_container_width=True)
    st.download_button(
        "Download current data as JSON",
        data=export_payload(tables),
        file_name="devpulse-data.json",
        mime="application/json",
    )
    pr_frame = tables.get("pull_requests", pd.DataFrame())
    st.download_button(
        "Download pull requests as CSV",
        data=pr_frame.to_csv(index=False).encode("utf-8"),
        file_name="devpulse-pull-requests.csv",
        mime="text/csv",
    )
    st.divider()
    st.subheader("Import a JSON snapshot")
    st.caption(
        "Expected top-level keys: pull_requests, issues, tasks, sessions, disruptions. "
        "Use the JSON download above as a schema example. Importing replaces the locally stored snapshot."
    )
    upload = st.file_uploader("Choose a DevPulse JSON snapshot", type=["json"])
    if upload is not None:
        try:
            payload = json.loads(upload.getvalue().decode("utf-8"))
            candidate = validate_payload(payload)
            st.success("Snapshot structure looks valid.")
            if st.button("Replace local dataset", type="primary"):
                save_tables(candidate, "imported")
                st.session_state["devpulse_tables"] = candidate
                st.session_state["devpulse_source"] = "imported"
                st.rerun()
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            st.error(f"Could not import this snapshot: {error}")


if "devpulse_tables" not in st.session_state:
    loaded_tables, loaded_source = load_tables()
    st.session_state["devpulse_tables"] = loaded_tables
    st.session_state["devpulse_source"] = loaded_source

tables = st.session_state["devpulse_tables"]
source = st.session_state["devpulse_source"]
date_min, date_max = _date_bounds(tables)

st.sidebar.title("DevPulse")
st.sidebar.caption("Developer productivity metrics")
page = st.sidebar.selectbox("Dashboard view", PAGES)
repository = st.sidebar.selectbox("Repository", _repositories(tables))
selected_people = st.sidebar.multiselect("Developers", _developers(tables), help="Leave empty to include all developers.")
date_selection = st.sidebar.date_input(
    "Analysis period",
    value=(date_min, date_max),
    min_value=date_min,
    max_value=date_max,
)
if isinstance(date_selection, tuple) and len(date_selection) == 2:
    period_start, period_end = date_selection
else:
    period_start = period_end = date_selection
stale_after = st.sidebar.slider("Stale after (days)", min_value=3, max_value=60, value=14)
st.sidebar.caption(f"Source: {'synthetic demo' if source == 'demo' else source}")

result = calculate_metrics(
    tables,
    period_start,
    period_end,
    repository=repository,
    selected_developers=set(selected_people) if selected_people else None,
    stale_after_days=stale_after,
)
period_days = (period_end - period_start).days + 1
metrics = result["metrics"]

if source == "demo":
    st.info("DEMO DATA · Generated sample activity only. No GitHub repository is connected.")

if page == "Overview":
    _render_overview(result, metrics, period_days)
elif page == "Developer comparison":
    _render_developers(result)
elif page == "Pull requests":
    _render_pull_requests(result, metrics)
elif page == "Review performance":
    _render_reviews(result, metrics)
elif page == "Tasks & stale work":
    _render_tasks(result, metrics)
elif page == "Workload & collaboration":
    _render_workload_collaboration(result, metrics)
elif page == "Change hotspots":
    _render_hotspots(result, metrics)
elif page == "Focus & recovery":
    _render_custom_metrics(result, metrics)
elif page == "Metric definitions":
    _render_definitions(metrics)
elif page == "Data source":
    _render_data_source(tables, source)
