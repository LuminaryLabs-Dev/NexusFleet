import io
import json
import unittest
from unittest.mock import patch

from nexusfleet_sidecar.protocol import handle


class ProtocolTests(unittest.TestCase):
    def test_health(self):
        output = io.StringIO()
        with patch("sys.stdout", output):
            self.assertTrue(handle({"protocol": 1, "id": "one", "operation": "health", "payload": {}}))
        message = json.loads(output.getvalue())
        self.assertTrue(message["ok"])
        self.assertEqual(message["result"]["protocol"], 1)

    def test_unknown_operation_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            handle({"protocol": 1, "id": "two", "operation": "shell", "payload": {}})


if __name__ == "__main__":
    unittest.main()
