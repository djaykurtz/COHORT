"""RFC599 W4 (NIMBUS): acceptance test for the two-tier SSH-lane health probe.

Proves the acceptance criteria WITHOUT touching the real COORD_HOST sshd, using local
fake listeners to stand in for the lane:
  * banner listener (sends "SSH-2.0-...") -> status "green"
  * silent listener  (accepts, sends nothing / hangs) -> status "degraded"
        (this is DRAGON's false-GREEN blind spot #85821: port open but sshd hung)
  * closed port (no listener) -> status "red"  (e.g. Stop-Service sshd)

The real-sshd reproduction (Stop-Service sshd on COORD_HOST -> red on next poll; a hung
sshd -> degraded) is the same code path; this makes it deterministic and offline.

Run:  python tests/test_rfc599_w4_lane_probe.py
"""

import importlib.util
import os
import socket
import sys
import threading
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER = os.path.join(_HERE, "..", "superdash-server.py")


def _load_server_module():
    spec = importlib.util.spec_from_file_location("superdash_server", _SERVER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # import-only; does not run the __main__ loop
    return mod


class _FakeLane:
    """A localhost TCP listener that optionally emits an SSH banner on accept."""

    def __init__(self, banner=None):
        self._banner = banner  # bytes or None (None = silent/hung)
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(1)
        self.port = self._sock.getsockname()[1]
        self._stop = False
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self):
        while not self._stop:
            try:
                self._sock.settimeout(0.3)
                conn, _ = self._sock.accept()
            except (socket.timeout, OSError):
                continue
            try:
                if self._banner is not None:
                    conn.sendall(self._banner)
                else:
                    time.sleep(0.5)  # hang: accept but never send a banner
            except OSError:
                pass
            finally:
                try:
                    conn.close()
                except OSError:
                    pass

    def close(self):
        self._stop = True
        try:
            self._sock.close()
        except OSError:
            pass


def _check(cond, msg):
    if not cond:
        print(f"  FAIL: {msg}")
        return False
    print(f"  ok:   {msg}")
    return True


def main():
    mod = _load_server_module()
    ok = True
    timeout = 1.0

    # --- 1) lane GREEN: connect + SSH banner ---
    green = _FakeLane(banner=b"SSH-2.0-OpenSSH_for_Windows_9.5\r\n")
    try:
        r = mod._probe_lane("127.0.0.1", green.port, timeout)
        ok &= _check(r["status"] == "green", "banner lane -> status green")
        ok &= _check(r["connect_ok"] and r["banner_ok"], "green: connect_ok + banner_ok")
        ok &= _check(isinstance(r["latency_ms"], float), "green: latency_ms is a float")
        ok &= _check(r["banner"].startswith("SSH-"), "green: banner string captured")
        ok &= _check(r["error"] is None, "green: no error")
    finally:
        green.close()

    # --- 2) lane DEGRADED: connect ok but NO banner (sshd hung) -- the blind spot ---
    silent = _FakeLane(banner=None)
    try:
        r = mod._probe_lane("127.0.0.1", silent.port, timeout)
        ok &= _check(r["status"] == "degraded", "silent/hung lane -> status degraded (NOT false-green)")
        ok &= _check(r["connect_ok"] and not r["banner_ok"], "degraded: connect_ok but banner_ok=False")
        ok &= _check(r["error"] is not None, "degraded: error explains missing banner")
    finally:
        silent.close()

    # --- 3) lane RED: connect fails (closed port) ---
    dead = _FakeLane(banner=b"x")
    dead_port = dead.port
    dead.close()
    time.sleep(0.1)
    r = mod._probe_lane("127.0.0.1", dead_port, timeout)
    ok &= _check(r["status"] == "red", "closed port -> status red")
    ok &= _check(not r["connect_ok"], "red: connect_ok=False")
    ok &= _check(r["latency_ms"] is None, "red: latency_ms None")
    ok &= _check(r["error"] is not None, "red: error populated")

    # --- 4) default lane port is 2222 (NOT :22) ---
    ok &= _check(mod.LANE_PORT == 2222, "default LANE_PORT == 2222 (git lane, not :22)")

    # --- 5) handler builds full payload + binary `healthy` (green path) ---
    handler = mod.SuperdashHandler.__new__(mod.SuperdashHandler)
    captured = {}
    handler._send_json = lambda payload, status=200: captured.update(payload)
    green2 = _FakeLane(banner=b"SSH-2.0-Test\r\n")
    try:
        mod.LANE_HOST = "127.0.0.1"
        mod.LANE_PORT = green2.port
        handler._handle_lane_health()
    finally:
        green2.close()
    ok &= _check(captured.get("status") == "green", "handler: green path -> status green")
    ok &= _check(captured.get("healthy") is True, "handler: green -> healthy True (binary RED signal)")
    ok &= _check(captured.get("lane") == "git-ssh-coord", "handler: lane label present")
    ok &= _check("checked_at" in captured, "handler: checked_at present")

    # --- 6) handler degraded path -> healthy False (NOT a false-green) ---
    captured.clear()
    silent2 = _FakeLane(banner=None)
    try:
        mod.LANE_PORT = silent2.port
        handler._handle_lane_health()
    finally:
        silent2.close()
    ok &= _check(captured.get("status") == "degraded", "handler: hung lane -> status degraded")
    ok &= _check(captured.get("healthy") is False, "handler: degraded -> healthy False (no false-green)")

    print("\nRESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
