import json
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from app import create_app


class VotingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "votes.db"
        self.app = create_app(self.database)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        self.voter = str(uuid4())

    def vote(self, topic="gitops"):
        return self.client.post("/api/votes", json={"voterId": self.voter, "topicId": topic})

    def test_initial_state(self):
        response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["totalVotes"], 0)
        self.assertEqual(len(response.json["topics"]), 4)
        self.assertIsNone(response.json["lastVoteAt"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_vote_and_change_vote_without_double_counting(self):
        self.assertEqual(self.vote().json["totalVotes"], 1)
        self.assertEqual(self.vote().json["totalVotes"], 1)
        state = self.vote("identity").json
        self.assertEqual(state["totalVotes"], 1)
        counts = {topic["id"]: topic["votes"] for topic in state["topics"]}
        self.assertEqual(counts["gitops"], 0)
        self.assertEqual(counts["identity"], 1)
        self.assertIsNotNone(state["lastVoteAt"])

    def test_multiple_voters(self):
        self.vote()
        self.voter = str(uuid4())
        self.assertEqual(self.vote().json["totalVotes"], 2)

    def test_votes_survive_application_restart(self):
        self.vote()
        restarted = create_app(self.database).test_client()
        self.assertEqual(restarted.get("/api/state").json["totalVotes"], 1)

    def test_invalid_input_does_not_store_votes(self):
        for value in (
            [], None, {}, {"voterId": "not-a-uuid", "topicId": "gitops"},
            {"voterId": self.voter, "topicId": "unknown"},
            {"voterId": self.voter, "topicId": []},
            {"voterId": 1, "topicId": "gitops"},
        ):
            with self.subTest(value=value):
                response = self.client.post("/api/votes", data=json.dumps(value), content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)
        self.assertEqual(self.client.get("/api/state").json["totalVotes"], 0)

    def test_malformed_json_and_missing_content_type(self):
        self.assertEqual(self.client.post("/api/votes", data="{", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/votes", data="{}").status_code, 415)

    def test_oversized_request(self):
        response = self.client.post("/api/votes", data="x" * 1025, content_type="application/json")
        self.assertEqual(response.status_code, 413)
        self.assertIn("error", response.json)

    def test_database_failure_is_explicit(self):
        self.database.unlink()
        with self.assertLogs(self.app.logger, level="ERROR"):
            response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 503)
        self.assertIn("error", response.json)

    def test_health_and_readiness(self):
        self.assertEqual(self.client.get("/healthz").status_code, 200)
        self.assertEqual(self.client.get("/readyz").status_code, 200)


if __name__ == "__main__":
    unittest.main()
