#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/autofix-workshop}"
DATA_DIR="$APP_ROOT/data"
BACKUP_DIR="$APP_ROOT/backups"
DB_FILE="$DATA_DIR/autofix.sqlite"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || exit 0
umask 027
if [[ ! -f "$DB_FILE" ]]; then
  echo "database not found: $DB_FILE"
  exit 1
fi

TEMP_BACKUP="$BACKUP_DIR/.autofix-$STAMP.tmp"
sqlite3 -cmd '.timeout 5000' "$DB_FILE" ".backup '$TEMP_BACKUP'"
test "$(sqlite3 "$TEMP_BACKUP" 'PRAGMA integrity_check;')" = "ok"
mkdir -p "$BACKUP_DIR/uploads"
if [[ -d "$APP_ROOT/uploads" ]]; then
  cp -an "$APP_ROOT/uploads/." "$BACKUP_DIR/uploads/"
fi
mv "$TEMP_BACKUP" "$BACKUP_DIR/autofix-$STAMP.sqlite"
mapfile -d '' snapshots < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'autofix-*.sqlite' -print0 | sort -zr)
if (( ${#snapshots[@]} > 7 )); then
  for stale in "${snapshots[@]:7}"; do rm -- "$stale"; done
fi
echo "backup created: $BACKUP_DIR/autofix-$STAMP.sqlite"

