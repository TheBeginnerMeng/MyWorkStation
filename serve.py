#!/usr/bin/env python3
"""
OpsDesk 本地静态服务器

与 `python3 -m http.server` 的区别：
1. 所有响应都带 `Cache-Control: no-store`，避免更新了 index.html / app.css 后
   浏览器仍使用磁盘缓存里的旧文件（这在本地自用场景下是高频踩坑点）。
2. 提供 `/__opsdesk/backup` 文件级备份接口：把工作台数据存成项目目录下的
   `opsdesk-data.json`，让数据跟着程序文件夹走 —— 换电脑、换浏览器、换端口、
   浏览器清了站点数据，都不会再导致数据"人间蒸发"。

用法：python3 serve.py [端口]
"""
import http.server
import json
import os
import socketserver
import sys
import threading
import time

BACKUP_NAME = "opsdesk-data.json"
BACKUP_PATH = "/__opsdesk/backup"
BACKUP_LOCK = threading.Lock()


def _is_local_client(address):
    """只接受来自本机的请求，避免同网段其它设备读写备份文件。"""
    if not address:
        return False
    host = address[0]
    return host in ("127.0.0.1", "::1", "::ffff:127.0.0.1") or host.startswith("127.")


def _atomic_write(path, content):
    """先写临时文件再 rename，避免中途断电/崩溃留下半截文件。"""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(content)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """静态文件处理器：禁用缓存，并关闭访问日志噪音。"""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只在出错时输出，避免刷屏
        if args and len(args) > 1 and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------------- 文件级备份接口 ----------------

    def _send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] != BACKUP_PATH:
            super().do_GET()
            return
        if not _is_local_client(self.client_address):
            self._send_json(403, {"ok": False, "error": "仅允许本机访问"})
            return
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), BACKUP_NAME)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                content = fh.read()
        except FileNotFoundError:
            self._send_json(404, {"ok": False, "error": "尚无备份文件"})
            return
        except OSError as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return
        self._send_json(200, {"ok": True, "file": BACKUP_NAME, "content": content,
                              "mtime": os.path.getmtime(path)})

    def do_PUT(self):
        if self.path.split("?")[0] != BACKUP_PATH:
            self._send_json(405, {"ok": False, "error": "不支持的方法"})
            return
        if not _is_local_client(self.client_address):
            self._send_json(403, {"ok": False, "error": "仅允许本机访问"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 64 * 1024 * 1024:
            self._send_json(400, {"ok": False, "error": "请求体大小非法"})
            return
        raw = self.rfile.read(length)
        try:
            content = raw.decode("utf-8")
            # 只接受合法 JSON，避免把垃圾写进备份文件
            json.loads(content)
        except (UnicodeDecodeError, ValueError) as e:
            self._send_json(400, {"ok": False, "error": "内容不是合法 JSON：%s" % e})
            return

        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), BACKUP_NAME)
        try:
            with BACKUP_LOCK:
                _atomic_write(path, content)
        except OSError as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return
        self._send_json(200, {"ok": True, "file": BACKUP_NAME, "bytes": len(raw)})

    def do_DELETE(self):
        if self.path.split("?")[0] != BACKUP_PATH:
            self._send_json(405, {"ok": False, "error": "不支持的方法"})
            return
        if not _is_local_client(self.client_address):
            self._send_json(403, {"ok": False, "error": "仅允许本机访问"})
            return
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), BACKUP_NAME)
        try:
            with BACKUP_LOCK:
                if os.path.exists(path):
                    os.remove(path)
        except OSError as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return
        self._send_json(200, {"ok": True, "deleted": True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    try:
        with Server(("", port), NoCacheHandler) as httpd:
            print(f"OpsDesk 服务已启动 → http://localhost:{port}/index.html", flush=True)
            print(f"  数据目录级备份 → {os.path.join(root, BACKUP_NAME)}", flush=True)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止", flush=True)
    except OSError as e:
        print(f"✗ 端口 {port} 启动失败：{e}", file=sys.stderr)
        print(f"  端口可能已被占用，可换一个端口：python3 serve.py {port + 1}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
