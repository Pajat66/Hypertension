#!/usr/bin/env bash
# backend/run.sh
set -e
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$PROJECT_DIR/venv/bin/activate"
# 若使用 .env 文件，取消下一行注释：
# source "$PROJECT_DIR/.env"
exec gunicorn -w 2 -k gevent -b 127.0.0.1:8000 app:create_app()
