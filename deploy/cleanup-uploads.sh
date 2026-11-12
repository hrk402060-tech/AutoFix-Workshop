#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/autofix-workshop}"
UPLOAD_DIR="$APP_ROOT/uploads"
MAX_BYTES=$((20 * 1024 * 1024 * 1024))

mkdir -p "$UPLOAD_DIR"
current_bytes="$(du -sb "$UPLOAD_DIR" | awk '{print $1}')"
echo "uploads usage: $current_bytes bytes"
if (( current_bytes > MAX_BYTES )); then
  echo "uploads directory exceeds 20 GB; stop accepting uploads and review files"
  exit 2
fi

find "$UPLOAD_DIR" -type f -name '*.tmp' -mtime +1 -delete

