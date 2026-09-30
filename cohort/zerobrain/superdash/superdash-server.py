"""
Superdash v2 HTTP Server with /api/health + /api/version endpoints.
Drop-in replacement for `python -m http.server 8430`.
Serves static files + health check API + deploy-version API.
"""

import gzip
import http.server
import io
import json
import logging
import os
import re
import socket
import subprocess
import threading
import time
import socketserver

PORT = int(os.environ.get("SUPERDASH_PORT", "8430"))
COORDINATOR_URL = os.environ.get("COORDINATOR_URL", "http://127.0.0.1:8420").rstrip("/")
INTEGRATION_REF = os.environ.get("SUPERDASH_INTEGRATION_REF", "master")
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
START_TIME = time.time()

# RFC599 W4 (NIMBUS): SSH-lane health probe for the COORD_HOST git-over-ssh endpoint.
# W1 stood the git lane up on port 2222 (NOT :22 -- the in-box :22 rule was
# disabled; the lane is Match-scoped sshd on 2222). The superdash runs on the
# same host (COORD_HOST coordinator-host:8430), so the probe is a local TCP connect to
# 2222. A live per-request probe means /api/lane_health flips RED within one
# dashboard poll cycle when the lane drops (e.g. Stop-Service sshd). Host/port
# are env-overridable for testability and for a future off-host probe.
LANE_HOST = os.environ.get("RFC599_LANE_HOST", "127.0.0.1")
LANE_PORT = int(os.environ.get("RFC599_LANE_PORT", "2222"))
LANE_PROBE_TIMEOUT = float(os.environ.get("RFC599_LANE_PROBE_TIMEOUT", "1.5"))
_SSH_BANNER_PREFIX = b"SSH-"  # RFC 4253 server identification string


def _git(args):
    """Run a git command in DIRECTORY; return stripped stdout or '' on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=DIRECTORY,
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return ""


def _probe_lane(host, port, timeout):
    """RFC599 W4: two-tier health probe for the COORD_HOST git-over-ssh lane.

    DRAGON review (#85821): a bare TCP-connect has a false-GREEN blind spot --
    port-open-but-sshd-hung reports reachable while git-over-SSH is actually
    broken (he repro'd exactly this from WORKER_HOST_2: connect to :2222 succeeded
    but `ssh -T` timed out "during banner exchange"). So we add a second tier:

      tier 1  TCP connect           -> reachability + latency (fast signal)
      tier 2  read the sshd ident   -> liveness (RFC 4253: the server sends its
              "SSH-..." identification string on connect; a hung sshd accepts
              the TCP connection but never emits the banner)

    Pure-socket (no key, no `ssh` subprocess, no auth attempt) -> safe to run
    every request. Returns a dict:
      status      "green"    connect ok AND SSH banner seen
                  "degraded" connect ok but NO banner (sshd hung / wrong service)
                  "red"      connect failed (lane down/unreachable)
      connect_ok, banner_ok, latency_ms, banner, error
    """
    t0 = time.perf_counter()
    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except (OSError, socket.timeout) as exc:
        return {
            "status": "red", "connect_ok": False, "banner_ok": False,
            "latency_ms": None, "banner": None,
            "error": f"connect: {type(exc).__name__}: {exc}",
        }
    try:
        sock.settimeout(timeout)
        data = sock.recv(256)
        banner = data.split(b"\r\n", 1)[0].decode("ascii", "replace") if data else ""
        if data.startswith(_SSH_BANNER_PREFIX):
            return {
                "status": "green", "connect_ok": True, "banner_ok": True,
                "latency_ms": latency_ms, "banner": banner, "error": None,
            }
        return {
            "status": "degraded", "connect_ok": True, "banner_ok": False,
            "latency_ms": latency_ms, "banner": banner,
            "error": "port open but no SSH banner (sshd hung / wrong service?)",
        }
    except (OSError, socket.timeout) as exc:
        return {
            "status": "degraded", "connect_ok": True, "banner_ok": False,
            "latency_ms": latency_ms, "banner": None,
            "error": f"banner: {type(exc).__name__}: {exc}",
        }
    finally:
        try:
            sock.close()
        except OSError:
            pass


def _read_sw_cache_version():
    """Parse CACHE_VERSION literal from sw.js (cheap regex, no JS eval).
    Returns the version string or '' if not parsable."""
    sw_path = os.path.join(DIRECTORY, "sw.js")
    try:
        with open(sw_path, "r", encoding="utf-8") as fh:
            head = fh.read(4096)
        m = re.search(r"CACHE_VERSION\s*=\s*['\"]([^'\"]+)['\"]", head)
        if m:
            return m.group(1)
    except OSError:
        pass
    return ""


# Cache these at startup -- they only change on deploy.
_GIT_SHA = _git(["rev-parse", "HEAD"])
_GIT_SHA_SHORT = _git(["rev-parse", "--short", "HEAD"])
_GIT_BRANCH = _git(["rev-parse", "--abbrev-ref", "HEAD"])
_GIT_COMMIT_TIME = _git(["log", "-1", "--format=%cI"])  # ISO 8601 strict
_SW_CACHE_VERSION = _read_sw_cache_version()
_SERVER_STARTED_AT = time.time()


# UXIA 2026-06-06: per-request perf log (jsonl) to diagnose tail latency that
# survived ThreadingTCPServer + address_string fixes (DRAGON load test showed
# 1s floor + 4s serialization cluster under 8-parallel browser-class load).
_PERF_LOG_PATH = os.path.join(DIRECTORY, "..", "logs", "superdash-perf.jsonl")
os.makedirs(os.path.dirname(os.path.abspath(_PERF_LOG_PATH)), exist_ok=True)
_perf_logger = logging.getLogger("superdash.perf")
_perf_logger.setLevel(logging.INFO)
_perf_logger.propagate = False
if not _perf_logger.handlers:
    _h = logging.FileHandler(_PERF_LOG_PATH, encoding="utf-8")
    _h.setFormatter(logging.Formatter("%(message)s"))
    _perf_logger.addHandler(_h)

# Lightweight in-flight counter to spot serialization windows in logs.
_inflight_lock = threading.Lock()
_inflight_count = 0


class SuperdashHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def address_string(self):
        # Skip socket.getfqdn() reverse-DNS lookup (Windows: ~2s per request on
        # localhost/127.0.0.1). Log raw client IP instead. Per-request latency
        # drops from ~2000ms to <50ms. (UXIA 2026-06-06 perf sweep, DRAGON greenlight.)
        return self.client_address[0]

    def do_GET(self):
        if self.path == "/api/health":
            self._handle_health()
        elif self.path == "/api/version":
            self._handle_version()
        elif self.path == "/api/deploy_status":
            self._handle_deploy_status()
        elif self.path == "/api/lane_health":
            self._handle_lane_health()
        elif self.path.split("?", 1)[0].startswith("/api/"):
            self._proxy_to_coord()
        else:
            super().do_GET()

    def _proxy_to_coord(self):
        """SWAT-20260613-0033 Axis B: reverse-proxy unhandled /api/* GETs to the
        coordinator on :8420, forwarding the client's auth header as-is.

        The B4/P5 widgets fetch coord-canonical (hyphen) /api/* paths relative to
        the superdash origin (:8430). Superdash answers a few local /api endpoints
        (health/version/deploy_status, matched BEFORE this clause) but holds no
        coord data, so anything else under /api/ is proxied to the coordinator.
        The client already sets ``Authorization: Bearer <token>``; forwarding it
        verbatim keeps the coord token off the superdash side (no env lookup, no
        token surfaced in superdash) and the browser sees same-origin (no CORS).
        GET-only by design -- the dashboard widgets are read-only.
        """
        import urllib.request
        import urllib.error

        target = COORDINATOR_URL + self.path
        fwd_headers = {}
        for header_name in ("Authorization", "X-Node-Token"):
            value = self.headers.get(header_name)
            if value:
                fwd_headers[header_name] = value
        req = urllib.request.Request(target, headers=fwd_headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as upstream:
                body = upstream.read()
                self.send_response(upstream.status)
                self.send_header(
                    "Content-Type",
                    upstream.headers.get("Content-Type", "application/json"),
                )
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            # Relay the coordinator's own error response (e.g. 401/404) faithfully
            # so the widget sees the real upstream status, not a generic 500.
            body = exc.read() or b""
            self.send_response(exc.code)
            self.send_header(
                "Content-Type", exc.headers.get("Content-Type", "application/json")
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001 -- coord unreachable / timeout
            body = json.dumps(
                {"error": "superdash_proxy_upstream_failed", "detail": str(exc)}
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    # SWAT-candidate finding H (superdash resource-efficiency pass, 2026-08):
    # text assets (JS/CSS/HTML) were served completely uncompressed -- ~168
    # files, no build step, no bundling (per KB `superdash-architecture`).
    # Gzip cuts transfer size ~70-80% for JS/CSS/HTML with near-zero CPU cost
    # (compression happens once per request, no caching of compressed bytes
    # needed given the existing immutable-URL cache-bust scheme above already
    # makes the browser cache the compressed response itself). Gated on:
    #   (a) client sends Accept-Encoding: gzip (universal in practice, but
    #       must not blindly compress for clients that don't advertise it)
    #   (b) extension is a known-compressible text type
    #   (c) file is above a minimum size (gzip has ~20-30 byte overhead;
    #       not worth it below a few hundred bytes)
    _COMPRESSIBLE_EXTS = (".js", ".css", ".html", ".json", ".svg", ".mjs")
    _GZIP_MIN_BYTES = 512

    def _client_accepts_gzip(self):
        accept_encoding = self.headers.get("Accept-Encoding", "")
        # Simple substring check (no q-value parsing needed -- gzip is either
        # offered or not in every real browser/client seen on this dashboard).
        return "gzip" in accept_encoding.lower()

    def send_head(self):
        # Compute ETag from file stat for static assets and honor If-None-Match
        # before deferring to the parent (which still handles If-Modified-Since).
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            try:
                st = os.stat(path)
                # ETag = mtime_ns + size. Intentionally NOT a content hash: every
                # `promote-superdash-v2-master.ps1` run touches mtime, so ETag
                # rotates per-deploy even on unchanged content -- forces revalidation
                # on every ship and prevents the 60s staleness-after-ship window.
                # Do NOT "optimize" by switching to content-hash without re-thinking
                # deploy-bust semantics (UXIA #45454).
                etag = f'"{st.st_mtime_ns}-{st.st_size}"'
                self._current_etag = etag
                inm = self.headers.get("If-None-Match")
                if inm and inm == etag:
                    self.send_response(304)
                    # ETag emitted via overridden end_headers() (avoids duplicate header)
                    self.end_headers()
                    return None
            except OSError:
                self._current_etag = None
                st = None

            _, ext = os.path.splitext(path)
            if (
                st is not None
                and ext.lower() in self._COMPRESSIBLE_EXTS
                and st.st_size >= self._GZIP_MIN_BYTES
                and self._client_accepts_gzip()
            ):
                return self._send_gzipped(path, st)
        else:
            self._current_etag = None
        return super().send_head()

    def _send_gzipped(self, path, st):
        """Read `path`, gzip-compress in memory, and send headers + a
        file-like object of the compressed bytes for copyfile() to stream.
        Falls back to the uncompressed parent path on ANY read/compress
        failure -- never breaks a response for the sake of a size optimization.
        """
        try:
            with open(path, "rb") as f:
                raw = f.read()
            compressed = gzip.compress(raw, compresslevel=6)
        except OSError:
            return super().send_head()

        ctype = self.guess_type(path)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(compressed)))
        self.send_header("Vary", "Accept-Encoding")
        self.send_header(
            "Last-Modified", self.date_time_string(int(st.st_mtime))
        )
        # end_headers() (overridden below) still applies the existing
        # Cache-Control/ETag policy based on self.path -- unchanged behavior,
        # only the body transfer-encoding changes.
        self.end_headers()
        return io.BytesIO(compressed)

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith(".html") or path == "/" or path == "":
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        elif path.endswith((".css", ".js")):
            # INVARIANT: dashboard never serves post-ship stale assets.
            # Two-mode cache policy depending on whether the URL carries an explicit
            # version query string (e.g. `?v=20260606-uxia-fh-rounded-center`):
            #
            #   (a) URL has ?v=… cache-buster  -> immutable, 1-year max-age.
            #       The version string IS the cache-bust; on ship the URL changes,
            #       browsers fetch the new URL fresh. No staleness window possible.
            #       Eliminates the ~3s warm-reload conditional-GET waterfall
            #       (47 JS+CSS files * ~70ms RTT) DRAGON measured 2026-06-06.
            #
            #   (b) URL has no query string  -> no-cache, must-revalidate (legacy).
            #       Some assets (config.js, scripts.js, etc.) are not version-stamped;
            #       fall back to ETag-driven revalidation per the 2026-06-03 fix
            #       (UXIA #45454 -- prior max-age=60 left a 60s post-ship stale window).
            #
            # Audit hygiene: any new <script>/<link> in index.html SHOULD include ?v=N
            # so it benefits from path (a). Unversioned assets degrade gracefully to (b).
            has_version = "?" in self.path and "v=" in self.path.split("?", 1)[1]
            if has_version:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            else:
                self.send_header("Cache-Control", "no-cache, must-revalidate")
                etag = getattr(self, "_current_etag", None)
                if etag:
                    self.send_header("ETag", etag)
        elif path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _handle_health(self):
        uptime_seconds = round(time.time() - START_TIME, 1)
        payload = {
            "status": "ok",
            "service": "superdash-v2",
            "port": PORT,
            "uptime_seconds": uptime_seconds,
            "directory": DIRECTORY,
        }
        self._send_json(payload)

    def _handle_version(self):
        """SWAT-20260604-0014: deploy-version stamp for OPERATOR self-diagnose.
        Returns server-side deploy facts (git SHA, branch, commit time) +
        precomputed SW cache version. Client side joins this with its
        actual SW.CACHE_VERSION, localStorage SWR rev, IndexedDB rev, and
        last-API-fetch timestamp to compute fresh/stale color."""
        now = time.time()
        payload = {
            "git_sha": _GIT_SHA,
            "git_sha_short": _GIT_SHA_SHORT,
            "git_branch": _GIT_BRANCH,
            "git_commit_time": _GIT_COMMIT_TIME,
            "sw_cache_version": _SW_CACHE_VERSION,
            "server_started_at": _SERVER_STARTED_AT,
            "server_started_iso": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(_SERVER_STARTED_AT)
            ),
            "server_now": now,
            "server_uptime_seconds": round(now - _SERVER_STARTED_AT, 1),
        }
        self._send_json(payload)

    def _handle_deploy_status(self):
        """SWAT-20260604-0017 Option C: live deploy-vs-master drift surface for
        OPERATOR-visible deploy-pending banner. Distinct from /api/version (which
        caches git facts at startup and goes stale post-promote because
        promote-superdash-v2-master.ps1 does `git reset --hard` without server
        restart). This endpoint does LIVE git lookups every request so the
        banner reflects real-time drift state.

        Fields:
          deploy_sha       — HEAD of deploy worktree (the served files)
          deploy_sha_short — 7-char abbrev
          master_sha       — current local master ref tip (where merges land)
          master_sha_short — 7-char abbrev
          drift            — bool: master != deploy
          deploy_behind    — int: commits master is AHEAD of deploy (a promote is
                             pending); 0 when not behind, -1 if git rev-list failed
          deploy_ahead     — int: commits deploy is AHEAD of master (an unmerged
                             branch is checked out in the served worktree); 0/-1 as above
          drift_commits    — int: back-compat magnitude = the non-zero direction
                             (prefers behind). 0 when drift==False; -1 on git failure
          checked_at       — server-side now() float seconds

        Drift is SYMMETRIC: the served deploy worktree can be behind master
        (normal "promote pending") OR ahead of master (a feature branch left
        checked out in the served tree). The original one-directional count
        (HEAD..master only) returned 0 in the ahead case, which the client
        rendered as a bare "?"; deploy_behind/deploy_ahead resolve that.
        """
        deploy_sha = _git(["rev-parse", "HEAD"])
        master_sha = _git(["rev-parse", INTEGRATION_REF])
        drift = bool(deploy_sha and master_sha and deploy_sha != master_sha)

        def _count(rng):
            count_str = _git(["rev-list", "--count", rng])
            try:
                return int(count_str) if count_str else -1
            except ValueError:
                return -1

        deploy_behind = _count(f"HEAD..{INTEGRATION_REF}") if drift else 0
        deploy_ahead = _count(f"{INTEGRATION_REF}..HEAD") if drift else 0
        if deploy_behind and deploy_behind > 0:
            drift_commits = deploy_behind
        elif deploy_ahead and deploy_ahead > 0:
            drift_commits = deploy_ahead
        else:
            drift_commits = -1 if drift else 0
        payload = {
            "deploy_sha": deploy_sha,
            "deploy_sha_short": deploy_sha[:7] if deploy_sha else "",
            "master_sha": master_sha,
            "master_sha_short": master_sha[:7] if master_sha else "",
            "integration_ref": INTEGRATION_REF,
            "drift": drift,
            "deploy_behind": deploy_behind,
            "deploy_ahead": deploy_ahead,
            "drift_commits": drift_commits,
            "checked_at": time.time(),
        }
        self._send_json(payload)

    def _handle_lane_health(self):
        """RFC599 W4 (NIMBUS): live two-tier SSH-lane health probe for the COORD_HOST
        git-over-ssh endpoint (port 2222). Runs fresh every request so the
        dashboard flips off-green within one poll cycle when the lane drops.

        Two tiers (DRAGON review #85821) close the false-GREEN blind spot:
          status "green"    = TCP connect AND SSH banner (lane truly serving)
                 "degraded" = connect ok but no SSH banner (sshd hung) -> NOT green
                 "red"      = connect failed (lane down; e.g. Stop-Service sshd)
        `healthy` is the binary RED signal for the dashboard (green only).
        Keyed on port 2222 (the live git lane), NOT :22 (W1 disabled in-box :22).
        """
        r = _probe_lane(LANE_HOST, LANE_PORT, LANE_PROBE_TIMEOUT)
        payload = {
            "lane": "git-ssh-coord",
            "host": LANE_HOST,
            "port": LANE_PORT,
            "status": r["status"],               # green | degraded | red
            "healthy": r["status"] == "green",   # binary RED signal for the dash
            "connect_ok": r["connect_ok"],
            "banner_ok": r["banner_ok"],
            "banner": r["banner"],
            "latency_ms": r["latency_ms"],
            "error": r["error"],
            "probe_timeout_s": LANE_PROBE_TIMEOUT,
            "checked_at": time.time(),
        }
        self._send_json(payload)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.write(body)

    def write(self, data):
        self.wfile.write(data)

    def log_message(self, format, *args):
        # Suppress noisy per-request logging
        pass

    def handle_one_request(self):
        # UXIA perf instrumentation: capture per-request total + in-flight count
        # so log analysis can spot serialization windows. recv = parse_request,
        # handler = do_GET / send_head, send = wfile flush. We only measure
        # total + parse_done because finer phases require deeper overrides.
        global _inflight_count
        t0 = time.perf_counter()
        t_parse = None
        with _inflight_lock:
            _inflight_count += 1
            inflight_at_start = _inflight_count
        try:
            # Hook parse-done timing by overriding parse_request via wrapper.
            orig_parse = self.parse_request

            def timed_parse():
                ok = orig_parse()
                nonlocal t_parse
                t_parse = time.perf_counter()
                return ok

            self.parse_request = timed_parse  # type: ignore
            super().handle_one_request()
        finally:
            t_end = time.perf_counter()
            with _inflight_lock:
                _inflight_count -= 1
                inflight_at_end = _inflight_count
            try:
                method = getattr(self, "command", None)
                path = getattr(self, "path", None)
                status = getattr(self, "_perf_status", None)
                if method and path:
                    ms_total = round((t_end - t0) * 1000, 2)
                    ms_parse = round((t_parse - t0) * 1000, 2) if t_parse else None
                    ms_handler = round((t_end - t_parse) * 1000, 2) if t_parse else None
                    _perf_logger.info(json.dumps({
                        "ts": round(time.time(), 3),
                        "method": method,
                        "path": path[:200],
                        "status": status,
                        "ms_total": ms_total,
                        "ms_parse": ms_parse,
                        "ms_handler": ms_handler,
                        "inflight_start": inflight_at_start,
                        "inflight_end": inflight_at_end,
                        "thread": threading.get_ident(),
                    }))
            except Exception:
                pass

    def send_response(self, code, message=None):
        self._perf_status = code
        super().send_response(code, message)


class ReuseTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # UXIA 2026-06-06: bump from default 5 to handle 8+ browser parallel sockets
    # without TCP-SYN-queue overflow + retransmit-delay tail.
    request_queue_size = 128


if __name__ == "__main__":
    print(f"Superdash v2 server starting on port {PORT}")
    print(f"Serving: {DIRECTORY}")
    print(f"Health:  http://127.0.0.1:{PORT}/api/health")
    print(f"Version: http://127.0.0.1:{PORT}/api/version")
    print(f"Deploy:  git={_GIT_SHA_SHORT or '??'} branch={_GIT_BRANCH or '??'} sw={_SW_CACHE_VERSION or '??'}")
    print(f"Lane:    http://127.0.0.1:{PORT}/api/lane_health (probes git-ssh {LANE_HOST}:{LANE_PORT})")
    with ReuseTCPServer(("", PORT), SuperdashHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
