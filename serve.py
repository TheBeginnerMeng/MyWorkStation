#!/usr/bin/env python3
"""
OpsDesk 本地静态服务器

与 `python3 -m http.server` 的区别：所有响应都带 `Cache-Control: no-store`，
避免更新了 index.html / app.css 后浏览器仍使用磁盘缓存里的旧文件
（这在本地自用场景下是高频踩坑点）。

用法：python3 serve.py [端口]
"""
import http.server
import os
import socketserver
import sys


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


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    class Server(socketserver.TCPServer):
        allow_reuse_address = True
        daemon_threads = True

    try:
        with Server(("", port), NoCacheHandler) as httpd:
            print(f"OpsDesk 服务已启动 → http://localhost:{port}/index.html", flush=True)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止", flush=True)
    except OSError as e:
        print(f"✗ 端口 {port} 启动失败：{e}", file=sys.stderr)
        print(f"  端口可能已被占用，可换一个端口：python3 serve.py {port + 1}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
