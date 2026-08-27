import json
import sys

from .operations import OPERATIONS

MAX_MESSAGE_BYTES = 1024 * 1024


def response(message):
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle(message):
    request_id = message.get("id")
    if message.get("protocol") != 1 or not isinstance(request_id, str):
        raise ValueError("Unsupported sidecar request")
    operation = message.get("operation")
    if operation == "shutdown":
        response({"id": request_id, "ok": True, "result": {"message": "Shutting down"}})
        return False
    handler = OPERATIONS.get(operation)
    if handler is None:
        raise ValueError("Unsupported sidecar operation")
    response({"id": request_id, "ok": True, "result": handler(message.get("payload") or {})})
    return True


def serve():
    for line in sys.stdin:
        if len(line.encode("utf-8")) > MAX_MESSAGE_BYTES:
            continue
        request_id = None
        try:
            message = json.loads(line)
            request_id = message.get("id") if isinstance(message, dict) else None
            if not handle(message):
                break
        except Exception as error:  # protocol boundary must remain alive
            response({"id": request_id, "ok": False, "error": str(error)})
