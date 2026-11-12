#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/autofix-workshop}"
DATA_DIR="$APP_ROOT/data"
BACKUP_DIR="$APP_ROOT/backups"
DB_FILE="$DATA_DIR/autofix.sqlite"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
if [[ ! -f "$DB_FILE" ]]; then
  echo "database not found: $DB_FILE"
  exit 1
fi

sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/autofix-$STAMP.sqlite'"
find "$BACKUP_DIR" -type f -name 'autofix-*.sqlite' -printf '%T@ %p\n' | sort -nr | awk 'NR>7 {print $2}' | xargs -r rm -f
echo "backup created: $BACKUP_DIR/autofix-$STAMP.sqlite"

