from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from metrics import calculate_metrics  # noqa: E402


class MetricTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tables = {
            "pull_requests": pd.DataFrame(
                [
                    {
                        "id": "p1",
                        "repository": "org/repo",
                        "author": "dev-a",
                        "state": "merged",
                        "created_at": "2025-03-01T00:00:00+00:00",
                        "updated_at": "2025-03-03T00:00:00+00:00",
                        "merged_at": "2025-03-03T00:00:00+00:00",
                        "first_review_at": "2025-03-02T00:00:00+00:00",
                        "review_cycles": 2,
                        "changed_files": ["src/a.py", "src/b.py"],
                        "reviewers": ["dev-b"],
                    },
                    {
                        "id": "p2",
                        "repository": "org/repo",
                        "author": "dev-b",
                        "state": "open",
                        "created_at": "2025-03-04T00:00:00+00:00",
                        "updated_at": "2025-03-04T00:00:00+00:00",
                        "merged_at": None,
                        "first_review_at": None,
                        "review_cycles": 0,
                        "changed_files": ["src/a.py"],
                        "reviewers": ["dev-a"],
                    },
                ]
            ),
            "issues": pd.DataFrame(
                [
                    {
                        "id": "i1",
                        "repository": "org/repo",
                        "state": "open",
                        "assignee": "dev-a",
                        "created_at": "2025-03-01T00:00:00+00:00",
                        "updated_at": "2025-03-01T00:00:00+00:00",
                        "participants": ["dev-b"],
                    }
                ]
            ),
            "tasks": pd.DataFrame(
                [
                    {
                        "id": "t1",
                        "repository": "org/repo",
                        "assignee": "dev-a",
                        "created_at": "2025-03-01T00:00:00+00:00",
                        "due_at": "2025-03-04T00:00:00+00:00",
                        "completed_at": "2025-03-02T00:00:00+00:00",
                    }
                ]
            ),
            "sessions": pd.DataFrame(
                [
                    {"id": "s1", "developer": "dev-a", "started_at": "2025-03-01T00:00:00+00:00", "focused": True},
                    {"id": "s2", "developer": "dev-a", "started_at": "2025-03-02T00:00:00+00:00", "focused": False},
                ]
            ),
            "disruptions": pd.DataFrame(
                [
                    {
                        "id": "d1",
                        "developer": "dev-a",
                        "occurred_at": "2025-03-01T00:00:00+00:00",
                        "recovered_productively": True,
                    },
                    {
                        "id": "d2",
                        "developer": "dev-a",
                        "occurred_at": "2025-03-02T00:00:00+00:00",
                        "recovered_productively": False,
                    },
                ]
            ),
        }

    def test_report_metrics_use_expected_formulas(self) -> None:
        result = calculate_metrics(self.tables, date(2025, 3, 1), date(2025, 3, 31), stale_after_days=3)
        metrics = result["metrics"]
        self.assertAlmostEqual(metrics["PRLT mean days"], 2.0)
        self.assertAlmostEqual(metrics["RRT mean hours"], 24.0)
        self.assertAlmostEqual(metrics["PRIC cycles per merged PR"], 2.0)
        self.assertAlmostEqual(metrics["SWR %"], 100.0)
        self.assertAlmostEqual(metrics["TCE tasks per hour"], 1 / 24)
        self.assertAlmostEqual(metrics["DPR %"], 100.0)
        self.assertAlmostEqual(metrics["FSS %"], 50.0)
        self.assertAlmostEqual(metrics["PRI %"], 50.0)
        self.assertEqual(metrics["Merged PRs"], 1)
        self.assertEqual(result["hotspots"].set_index("File").loc["src/a.py", "Changes"], 2)

    def test_repository_filter_excludes_other_repositories(self) -> None:
        result = calculate_metrics(
            self.tables,
            date(2025, 3, 1),
            date(2025, 3, 31),
            repository="other/repo",
        )
        self.assertEqual(result["metrics"]["Merged PRs"], 0)
        self.assertEqual(result["metrics"]["Active work items"], 0)


if __name__ == "__main__":
    unittest.main()
