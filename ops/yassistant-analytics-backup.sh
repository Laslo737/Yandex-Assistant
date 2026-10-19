#!/bin/bash
set -euo pipefail
umask 077

# Installed outside release directories. Never load app/env or instantiate AnalyticsStore.
SOURCE=/var/lib/yassistant/analytics.sqlite
DIRECTORY=/var/backups/yassistant
HELPER=/usr/local/lib/yassistant/analytics-backup.js
CHECKER=/usr/local/lib/yassistant/check-analytics-backup.cjs
NODE=/usr/bin/node

exec 9>/run/lock/yassistant-analytics-backup.lock
if ! flock -n 9; then
  echo BACKUP_SKIPPED_ALREADY_RUNNING
  exit 0
fi

test -f "$SOURCE"
test -f "$HELPER"
test -f "$CHECKER"
install -d -m 700 "$DIRECTORY"
# Conservative preflight, not a quota: concurrent growth still needs disk monitoring.
SOURCE_BYTES=$(stat -c %s "$SOURCE")
WAL_BYTES=$(stat -c %s "$SOURCE-wal" 2>/dev/null || echo 0)
AVAILABLE=$(df -B1 --output=avail "$DIRECTORY" | tail -n 1)
if (( AVAILABLE < SOURCE_BYTES + WAL_BYTES + 536870912 )); then
  echo BACKUP_FAILED_LOW_DISK >&2
  exit 1
fi
SNAPSHOT="$DIRECTORY/analytics-$(date -u +%Y%m%dT%H%M%S)-$(date +%N).sqlite"
PARTIAL="$SNAPSHOT.partial"
trap 'rm -f -- "$PARTIAL"' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

"$NODE" "$HELPER" "$SOURCE" "$PARTIAL"
"$NODE" "$CHECKER" "$PARTIAL"
mv -- "$PARTIAL" "$SNAPSHOT"

# Rotation only after a new consistent snapshot has passed validation.
# No recursion, symlinks or unrelated files; retention is 14*24h by file mtime.
find "$DIRECTORY" -maxdepth 1 -type f -name 'analytics-*.sqlite' -mmin +20160 -delete
echo "BACKUP_VERIFIED: $SNAPSHOT"
