#!/bin/bash
# ============================================================
#  OpsDesk 一键启动（macOS / Linux / 麒麟）
#  用法：双击本文件，或在终端执行 ./启动.command
#  按 Control + C 结束服务
# ============================================================
cd "$(dirname "$0")" || exit 1
PORT=5173
URL="http://localhost:${PORT}/index.html"

# ---- 跨平台打开浏览器 ----
# 注意：不能只看 `command -v open`，Linux 上可能存在同名但语义不同的
# /usr/bin/open（xdg-utils 的替代品，参数不兼容）。因此按优先级依次
# 尝试，且只接受 macOS 特有的 /usr/bin/open。
open_browser() {
  local target="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$target" >/dev/null 2>&1 &
  elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "$target" >/dev/null 2>&1 &
  elif [ -x /usr/bin/open ] && [ "$(uname -s)" = "Darwin" ]; then
    /usr/bin/open "$target" >/dev/null 2>&1 &
  elif command -v firefox >/dev/null 2>&1; then
    firefox "$target" >/dev/null 2>&1 &
  elif command -v chromium >/dev/null 2>&1; then
    chromium "$target" >/dev/null 2>&1 &
  elif command -v chromium-browser >/dev/null 2>&1; then
    chromium-browser "$target" >/dev/null 2>&1 &
  elif command -v google-chrome >/dev/null 2>&1; then
    google-chrome "$target" >/dev/null 2>&1 &
  else
    return 1
  fi
  return 0
}

echo ""
echo "  ╭──────────────────────────────────────╮"
echo "  │            OpsDesk 启动器             │"
echo "  ╰──────────────────────────────────────╯"
echo ""

# ---- 端口探测：ss / netstat / lsof 三种都试，兼容精简版麒麟系统 ----
port_in_use() {
  # 精确判断端口是否被监听，不去 grep 文本输出（各系统 netstat 的
  # 选项支持差异太大：macOS 的 netstat 不支持 -l，输出格式也各不相同）
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "(^|[^0-9])${PORT}[[:space:]]"
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    # -a 覆盖全部连接状态，-n 关闭名字解析（Linux/macOS 都支持）
    netstat -an 2>/dev/null | grep -qE "(^|[^0-9])${PORT}[[:space:]]"
    return $?
  fi
  return 1
}

# 端口已被占用：多半是服务已经在跑，直接打开即可
if port_in_use; then
  echo "  ✓ 检测到 ${PORT} 端口已有服务，直接打开浏览器"
  open_browser "$URL"
  echo "  → ${URL}"
  echo ""
  exit 0
fi

# ---- 找一个可用的 Python ----
PY=""
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
fi

if [ -z "$PY" ]; then
  echo "  ! 未检测到 Python，退回「直接打开文件」模式"
  echo "    （功能完全可用，数据同样保存在本机浏览器）"
  echo ""
  open_browser "index.html"
  exit 0
fi

echo "  · 正在启动本地服务（$PY serve.py $PORT）..."
$PY serve.py "$PORT" >/dev/null 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null' EXIT INT TERM
sleep 1

if ! kill -0 $SRV_PID 2>/dev/null; then
  echo "  ✗ 服务启动失败，请检查 ${PORT} 端口是否被占用"
  read -r -p "  按回车键退出…"
  exit 1
fi

if open_browser "$URL"; then
  echo "  ✓ 已启动并打开浏览器 → $URL"
else
  echo "  ✓ 已启动 → $URL"
  echo "  ! 未找到可用的浏览器命令，请手动在浏览器地址栏打开上面的地址"
fi
echo ""
echo "  · 数据保存在本机浏览器（localStorage + IndexedDB 双写）"
echo "  · 换电脑请用左栏「导出备份 / 导入备份」迁移数据"
echo "  · 按 Control + C 结束服务"
echo ""

wait $SRV_PID
