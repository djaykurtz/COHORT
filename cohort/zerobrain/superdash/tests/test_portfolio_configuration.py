"""Offline checks for portable reference-server and image-service settings."""

import ast
import http.server
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class ConfigurationTests(unittest.TestCase):
    def load_server(self, upstream):
        spec = importlib.util.spec_from_file_location("portfolio_server", ROOT / "superdash-server.py")
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {
            "SUPERDASH_PORT": "8496", "COORDINATOR_URL": upstream, "SUPERDASH_INTEGRATION_REF": "main"
        }), patch("subprocess.run") as git:
            git.return_value.returncode = 1
            spec.loader.exec_module(module)
        self.addCleanup(lambda: [handler.close() for handler in module._perf_logger.handlers])
        return module

    def test_server_settings_and_get_proxy(self):
        seen = []

        class Upstream(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append((self.path, self.headers.get("Authorization")))
                status = 401 if self.path.startswith("/api/restricted") else 200
                body = json.dumps({"status": "sample", "path": self.path}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        upstream = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(upstream.server_close)
        self.addCleanup(upstream.shutdown)
        address = f"http://127.0.0.1:{upstream.server_port}"
        module = self.load_server(address + "/")
        self.assertEqual(module.PORT, 8496)
        self.assertEqual(module.COORDINATOR_URL, address)
        self.assertEqual(module.INTEGRATION_REF, "main")
        server = module.ReuseTCPServer(("127.0.0.1", 0), module.SuperdashHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        origin = f"http://127.0.0.1:{server.server_address[1]}"
        request = urllib.request.Request(origin + "/api/sample?limit=2", headers={"Authorization": "Bearer SAMPLE_ONLY"})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response)["path"], "/api/sample?limit=2")
        self.assertEqual(seen, [("/api/sample?limit=2", "Bearer SAMPLE_ONLY")])
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(origin + "/api/restricted")
        self.assertEqual(error.exception.code, 401)
        error.exception.close()
        module.COORDINATOR_URL = "http://127.0.0.1:0"
        with self.assertRaises(urllib.error.HTTPError) as unavailable:
            urllib.request.urlopen(origin + "/api/unavailable")
        self.assertEqual(unavailable.exception.code, 502)
        self.assertEqual(json.load(unavailable.exception)["error"], "superdash_proxy_upstream_failed")
        unavailable.exception.close()

    def test_deploy_drift_uses_selected_integration_ref(self):
        module = self.load_server("http://127.0.0.1:0")
        responses = {
            ("rev-parse", "HEAD"): "sample-deploy",
            ("rev-parse", "main"): "sample-integration",
            ("rev-list", "--count", "HEAD..main"): "2",
            ("rev-list", "--count", "main..HEAD"): "0",
        }
        handler = module.SuperdashHandler.__new__(module.SuperdashHandler)
        captured = {}
        handler._send_json = captured.update
        with patch.object(module, "_git", side_effect=lambda args: responses[tuple(args)]):
            handler._handle_deploy_status()
        self.assertEqual(captured["integration_ref"], "main")
        self.assertEqual(captured["master_sha"], "sample-integration")
        self.assertTrue(captured["drift"])
        self.assertEqual(captured["deploy_behind"], 2)
        self.assertEqual(captured["deploy_ahead"], 0)

    def image_config(self, environment):
        source = ROOT / "services" / "image-service.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        selected = []
        for node in tree.body:
            if isinstance(node, ast.Assign):
                selected.append(node)
                if any(isinstance(target, ast.Name) and target.id == "AUTH_TOKEN" for target in node.targets):
                    break
        token_guard = next(node for node in tree.body if isinstance(node, ast.If))
        selected.append(token_guard)
        config = ast.Module(body=selected, type_ignores=[])
        namespace = {"os": os, "Path": Path, "__file__": str(source)}
        with patch.dict(os.environ, environment, clear=True):
            exec(compile(config, str(source), "exec"), namespace)
        return namespace

    def test_image_token_is_required(self):
        for token in ("", "REPLACE_WITH_FLEET_TOKEN"):
            with self.subTest(token=token), self.assertRaisesRegex(RuntimeError, "IMAGE_SERVICE_TOKEN"):
                self.image_config({"IMAGE_SERVICE_TOKEN": token})

    def test_image_storage_is_portable_and_overridable(self):
        config = self.image_config({"IMAGE_SERVICE_TOKEN": "SAMPLE_ONLY"})
        self.assertEqual(config["UPLOAD_DIR"], ROOT / "services" / "uploads")
        self.assertEqual(config["PORT"], 8421)
        with tempfile.TemporaryDirectory() as directory:
            config = self.image_config({
                "IMAGE_SERVICE_TOKEN": "SAMPLE_ONLY",
                "IMAGE_UPLOAD_DIR": directory,
                "IMAGE_SERVICE_PORT": "8495",
            })
            self.assertEqual(config["UPLOAD_DIR"], Path(directory))
            self.assertEqual(config["PORT"], 8495)


if __name__ == "__main__":
    unittest.main()
