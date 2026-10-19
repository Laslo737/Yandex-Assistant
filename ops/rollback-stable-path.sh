#!/bin/bash
set -euo pipefail
umask 077

# Installed as /root/yassistant-backups/20261019-162724/rollback.sh by the migration.
# Keep the original rollback, which restores the untouched original systemd unit.
STABLE=/opt/yandex-360-ai-assistant
CURRENT=/opt/yassistant-releases/admin-load-20261019
LEGACY=/opt/yassistant-releases/legacy-843b921
DROPIN=/etc/systemd/system/yassistant.service.d/90-admin-load-release.conf
ORIGINAL=/root/yassistant-backups/20261019-162724/rollback-before-stable-path.sh

[[ $EUID -eq 0 ]] || { echo RUN_AS_ROOT >&2; exit 1; }
exec 9>/run/lock/yassistant-stable-path.lock
flock -n 9 || { echo ANOTHER_MIGRATION_RUNNING >&2; exit 1; }
[[ -L "$STABLE" && -d "$LEGACY" && -f "$ORIGINAL" ]] || { echo ROLLBACK_PREFLIGHT_FAILED >&2; exit 1; }
TARGET=$(readlink -f -- "$STABLE")
[[ "$TARGET" == "$CURRENT" || "$TARGET" == "$LEGACY" ]] || { echo UNKNOWN_ACTIVE_RELEASE >&2; exit 1; }
[[ $(git -C "$LEGACY" rev-parse --short=7 HEAD) == 843b921 ]] || { echo UNKNOWN_LEGACY_RELEASE >&2; exit 1; }
if [[ -e "$DROPIN" ]]; then
  grep -Fxq '# release-ca65be5' "$DROPIN" || { echo UNKNOWN_DROPIN >&2; exit 1; }
fi

LINK=/opt/.yassistant-rollback-$$.link
trap 'rm -f -- "$LINK"' EXIT
# Atomic replacement of a symlink only; never overwrite a real directory.
ln -s -- "$LEGACY" "$LINK"
trap 'rc=$?; trap - ERR; set +e; systemctl daemon-reload; systemctl start yassistant; echo ROLLBACK_FAILED_CHECK_SERVICE >&2; exit "$rc"' ERR
systemctl stop yassistant
mv -Tf -- "$LINK" "$STABLE"
if [[ -e "$DROPIN" ]]; then
  bash "$ORIGINAL"
else
  # Also recover if a preceding attempt already removed the drop-in.
  systemctl daemon-reload
  systemctl start yassistant
  curl --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 -fsS http://127.0.0.1:3002/health
fi
trap - ERR
echo
echo ROLLBACK_OK_STABLE_PATH
