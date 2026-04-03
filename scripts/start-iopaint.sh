#!/usr/bin/env bash
set -euo pipefail

PORT="${IOPAINT_PORT:-8080}"
MODEL="${IOPAINT_MODEL:-lama}"
DEVICE="${IOPAINT_DEVICE:-cpu}"

if ! command -v iopaint >/dev/null 2>&1; then
  echo "未找到 iopaint 命令。请先安装：pip3 install iopaint"
  exit 1
fi

echo "启动 IOPaint..."
echo "  model : ${MODEL}"
echo "  device: ${DEVICE}"
echo "  port  : ${PORT}"

exec iopaint start --model="${MODEL}" --device="${DEVICE}" --port="${PORT}"
