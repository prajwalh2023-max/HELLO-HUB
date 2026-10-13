# DevPulse — Streamlit version

This application aligns its dashboard sections and metric definitions with `SOFTWARE_METRICS_REPORT - 1`.

## Current status

- Runs as a Python / Streamlit dashboard and calculates the 12 report metrics from a local SQLite snapshot.
- Starts with deterministic, synthetic sample data. The app labels that data and does **not** claim to be connected to GitHub.
- Supports replacing the local snapshot with a JSON file in the documented DevPulse schema.
- A live GitHub collector is not included yet because no repository has been selected or connected.
- FSS and PRI are proposed metrics and require session / interruption data that GitHub does not directly provide.

## Run

From the workspace root:

```bash
uv run streamlit run artifacts/devpulse/app.py --server.address 0.0.0.0 --server.port 5000
```

## JSON snapshot format

The import file must contain these top-level arrays:

```json
{
  "pull_requests": [],
  "issues": [],
  "tasks": [],
  "sessions": [],
  "disruptions": []
}
```

Use **Data source → Download current data as JSON** to get a complete example. Importing replaces the local SQLite snapshot.

## Metric definitions and limits

See the **Metric definitions** view in the app. Workload balance currently uses activity-count units (authored PRs, assigned issues, and assigned tasks), not effort. Task due dates and FSS/PRI event data are available in demo mode but require additional conventions or instrumentation for real repositories.
