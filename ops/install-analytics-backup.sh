#!/bin/bash
set -euo pipefail
umask 077

# Installs only a separate backup job. Does not restart or edit yassistant/nginx/env.
trap 'echo "AUTOBACKUP_SETUP_FAILED: bot configuration unchanged; inspect the error above." >&2' ERR
if [[ $EUID -ne 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
SOURCE_HELPER=${1:?Pass the analytics-backup.js path from the verified release}
for command in flock install systemctl systemd-analyze; do command -v "$command" >/dev/null; done
/usr/bin/node -e 'require("node:sqlite").DatabaseSync'
test -f /var/lib/yassistant/analytics.sqlite
test -f "$SOURCE_HELPER"
for file in check-analytics-backup.cjs yassistant-analytics-backup.sh yassistant-analytics-backup.service yassistant-analytics-backup.timer; do
  test -f "$HERE/$file"
done

# Never overwrite another backup setup or silently reset its retention policy.
for target in /usr/local/lib/yassistant/analytics-backup.js /usr/local/lib/yassistant/check-analytics-backup.cjs /usr/local/sbin/yassistant-analytics-backup /etc/systemd/system/yassistant-analytics-backup.service /etc/systemd/system/yassistant-analytics-backup.timer; do
  if [[ -e "$target" || -L "$target" ]]; then
    echo "AUTOBACKUP_ALREADY_EXISTS: $target. Nothing installed; inspect existing setup." >&2
    exit 1
  fi
done

bash -n "$HERE/yassistant-analytics-backup.sh"
install -d -m 700 /usr/local/lib/yassistant /var/backups/yassistant
install -m 600 "$SOURCE_HELPER" /usr/local/lib/yassistant/analytics-backup.js
install -m 600 "$HERE/check-analytics-backup.cjs" /usr/local/lib/yassistant/check-analytics-backup.cjs
install -m 700 "$HERE/yassistant-analytics-backup.sh" /usr/local/sbin/yassistant-analytics-backup
install -m 644 "$HERE/yassistant-analytics-backup.service" /etc/systemd/system/yassistant-analytics-backup.service
install -m 644 "$HERE/yassistant-analytics-backup.timer" /etc/systemd/system/yassistant-analytics-backup.timer
systemd-analyze verify /etc/systemd/system/yassistant-analytics-backup.service /etc/systemd/system/yassistant-analytics-backup.timer
systemctl daemon-reload
# Test the exact service and its sandbox before enabling the timer.
systemctl start yassistant-analytics-backup.service
systemctl enable --now yassistant-analytics-backup.timer
systemctl list-timers yassistant-analytics-backup.timer --no-pager
echo AUTOBACKUP_READY
