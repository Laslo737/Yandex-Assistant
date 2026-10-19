#!/bin/bash
set -euo pipefail
umask 077

STABLE=/opt/yandex-360-ai-assistant
CURRENT=/opt/yassistant-releases/admin-load-20261019
LEGACY=/opt/yassistant-releases/legacy-843b921
DROPIN=/etc/systemd/system/yassistant.service.d/90-admin-load-release.conf
BACKUP_ROOT=/root/yassistant-backups
ROLLBACK=$BACKUP_ROOT/20261019-162724/rollback.sh
ORIGINAL_ROLLBACK=$BACKUP_ROOT/20261019-162724/rollback-before-stable-path.sh
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
MODE=${1:---check}

fail() { echo "STABLE_PATH_STOPPED: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail 'Use --check or --apply'
[[ $EUID -eq 0 ]] || fail 'Run as root'
exec 9>/run/lock/yassistant-stable-path.lock
flock -n 9 || fail 'Another path migration or rollback is running'
[[ -d "$STABLE" && ! -L "$STABLE" ]] || fail 'Old path is not an untouched regular directory'
[[ -d "$CURRENT" && ! -L "$CURRENT" ]] || fail 'Active release is missing or already a symlink'
[[ ! -e "$LEGACY" && ! -L "$LEGACY" ]] || fail 'Legacy destination already exists; do not overwrite it'
[[ ! -e "$ORIGINAL_ROLLBACK" && ! -L "$ORIGINAL_ROLLBACK" ]] || fail 'Previous migration detected; inspect it first'
[[ -f "$CURRENT/.env" && ! -L "$CURRENT/.env" ]] || fail 'Inspect active env before migration'
[[ -f "$ROLLBACK" && ! -L "$ROLLBACK" ]] || fail 'Original rollback script is missing'
[[ -f "$HERE/rollback-stable-path.sh" ]] || fail 'Companion rollback script is missing'
[[ $(git -C "$STABLE" rev-parse --short=7 HEAD) == 843b921 ]] || fail 'Unexpected old release'
[[ -z $(git -C "$STABLE" status --porcelain) ]] || fail 'Old rollback checkout has changes'
[[ $(git -C "$CURRENT" branch --show-current) == main ]] || fail 'Active release is not on main'
[[ -z $(git -C "$CURRENT" status --porcelain) ]] || fail 'Active checkout has changes'
[[ $(stat -c %d "$STABLE") == $(stat -c %d "$(dirname -- "$LEGACY")") ]] || fail 'Cross-filesystem move requires a separate plan'
[[ $(systemctl show yassistant --value -p WorkingDirectory) == "$CURRENT" ]] || fail 'Unexpected service working directory'
[[ -z $(systemctl show yassistant --value -p EnvironmentFiles) ]] || fail 'External EnvironmentFile requires inspection'
SERVICE_USER=$(systemctl show yassistant --value -p User)
[[ -z "$SERVICE_USER" || "$SERVICE_USER" == root ]] || fail 'Service user changed; inspect permissions'
[[ $(grep -Fxc "WorkingDirectory=$CURRENT" "$DROPIN") == 1 ]] || fail 'Unexpected override contents'
grep -Fxq '# release-ca65be5' "$DROPIN" || fail 'Unexpected override marker'
systemctl show yassistant --value -p ExecStart | grep -Fq 'argv[]=/usr/bin/npm start' || fail 'Unexpected ExecStart'
systemctl is-active --quiet yassistant || fail 'Service is not active; restore health before migrating'
MAIN_PID=$(systemctl show yassistant --value -p MainPID)
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ ]] || fail 'No running service PID'
[[ $(readlink -f -- "/proc/$MAIN_PID/cwd") == "$CURRENT" ]] || fail 'Actual service cwd differs; inspect before changing paths'
curl --max-time 10 -fsS http://127.0.0.1:3002/health >/dev/null || fail 'Health check failed'
[[ $(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/admin) == 401 ]] || fail 'Admin is not in the expected authenticated state'
bash -n "$ROLLBACK"
bash -n "$HERE/rollback-stable-path.sh"
echo STABLE_PATH_PREFLIGHT_OK
[[ "$MODE" == --apply ]] || exit 0

STATE=$BACKUP_ROOT/stable-path-$(date -u +%Y%m%dT%H%M%S)-$(date +%N)
install -d -m 700 "$STATE"
install -m 600 "$CURRENT/.env" "$STATE/active.env.before"
install -m 644 "$DROPIN" "$STATE/override.before.conf"
install -m 700 "$ROLLBACK" "$STATE/rollback.before.sh"
# Keep all flags, especially admin=true; change only one literal WorkingDirectory line.
awk -v old="WorkingDirectory=$CURRENT" -v new="WorkingDirectory=$STABLE" '{ if ($0 == old) print new; else print }' "$DROPIN" > "$STATE/override.after.conf"
grep -Fxq "WorkingDirectory=$STABLE" "$STATE/override.after.conf"
echo "MIGRATION_BACKUP: $STATE"
LINK=/opt/.yassistant-stable-$$.link
ORIGINAL_CREATED=0

restore_previous() {
  local rc=$?
  trap - ERR INT TERM HUP
  set +e
  echo STABLE_PATH_FAILED_RESTORING >&2
  install -m 644 "$STATE/override.before.conf" "$DROPIN"
  if [[ -L "$STABLE" && $(readlink -f -- "$STABLE") == "$CURRENT" ]]; then rm -- "$STABLE"; fi
  if [[ -d "$LEGACY" && ! -e "$STABLE" && ! -L "$STABLE" ]]; then mv -- "$LEGACY" "$STABLE"; fi
  install -m 700 "$STATE/rollback.before.sh" "$ROLLBACK"
  if [[ "$ORIGINAL_CREATED" == 1 ]]; then rm -f -- "$ORIGINAL_ROLLBACK"; fi
  rm -f -- "$LINK"
  systemctl daemon-reload
  if [[ $(systemctl show yassistant --value -p WorkingDirectory) == "$CURRENT" ]] &&
     { { systemctl is-active --quiet yassistant && curl --max-time 10 -fsS http://127.0.0.1:3002/health; } ||
       { systemctl restart yassistant && curl --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 -fsS http://127.0.0.1:3002/health; }; }; then
    echo; echo PREVIOUS_SERVICE_RESTORED
  else
    echo "RESTORE_NEEDS_ATTENTION: $STATE" >&2
  fi
  exit "$rc"
}
trap restore_previous ERR
trap 'false' INT TERM HUP
trap 'rm -f -- "$LINK"' EXIT

# Prepare the replacement rollback before changing any production paths.
install -m 700 "$ROLLBACK" "$ORIGINAL_ROLLBACK"
ORIGINAL_CREATED=1
install -m 700 "$HERE/rollback-stable-path.sh" "$ROLLBACK"
ln -s -- "$CURRENT" "$LINK"
# The running process and its real cwd stay in CURRENT. Only the unused old directory moves.
mv -- "$STABLE" "$LEGACY"
mv -T -- "$LINK" "$STABLE"
install -m 644 "$STATE/override.after.conf" "$DROPIN"
# No env/DB movement; current credentials remain byte-for-byte unchanged.
cmp -s "$STATE/active.env.before" "$STABLE/.env"
systemctl daemon-reload
systemctl is-active --quiet yassistant
[[ $(systemctl show yassistant --value -p MainPID) == "$MAIN_PID" ]]
curl --max-time 10 -fsS http://127.0.0.1:3002/health
[[ $(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/admin) == 401 ]]
[[ $(systemctl show yassistant --value -p WorkingDirectory) == "$STABLE" ]]
[[ $(git -C "$STABLE" branch --show-current) == main ]]
trap - ERR INT TERM HUP

echo
echo "ACTIVE_PATH: $STABLE -> $(readlink -f -- "$STABLE")"
git -C "$STABLE" status -sb
echo "SERVICE_PID_UNCHANGED: $MAIN_PID"
echo STABLE_PATH_OK
