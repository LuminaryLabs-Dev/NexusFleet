from pathlib import Path

MAX_LOG_BYTES = 8 * 1024 * 1024


def health(_payload):
    return {"message": "Python sidecar ready", "protocol": 1}


def analyze_log(payload):
    raw_path = payload.get("path") if isinstance(payload, dict) else None
    if not raw_path or not isinstance(raw_path, str):
        raise ValueError("A log path is required")
    path = Path(raw_path).expanduser().resolve(strict=True)
    if not path.is_file() or path.stat().st_size > MAX_LOG_BYTES:
        raise ValueError("Log file is unavailable or exceeds 8 MB")
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    findings = [line[:500] for line in lines if "FATAL" in line or "ANR" in line or "Exception" in line][-100:]
    return {"lineCount": len(lines), "findings": findings}


OPERATIONS = {"health": health, "analyze-log": analyze_log}
