#!/usr/bin/env bash
set -Eeuo pipefail

die() { echo "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || die "Run as root (Flow host deployment user: root)."
release="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
base=/opt/doubo
release_root=/srv/doubo
[[ "$release" == "$release_root/"* ]] || die "Extract into /srv/doubo/<unique-id> first."
[[ -f "$release/bin/doubo-api" && -f "$release/web/index.html" ]] || die "Incomplete release."
for command in systemctl curl flock; do
  command -v "$command" >/dev/null || die "Missing command: $command"
done

mkdir -p "$base/shared/media" "$base/shared/web/assets" /etc/doubo
exec 9> "$base/deploy.lock"
flock -n 9 || die "Another deployment is running; retry after it completes."
if [[ ! -f /etc/doubo/doubo.env ]]; then
  install -m 600 "$release/deploy/native/doubo.env.example" /etc/doubo/doubo.env
  die "Fill /etc/doubo/doubo.env, then rerun this deployment. Services have not been stopped."
fi
chmod 600 /etc/doubo/doubo.env
chown root:root /etc/doubo/doubo.env
if ! id doubo >/dev/null 2>&1; then
  useradd --system --home-dir "$base" --shell /usr/sbin/nologin doubo
fi
chown doubo:doubo "$base/shared" "$base/shared/media"
# Built-in covers and model icons must land where the API reads media, which
# may be overridden in doubo.env (for example /srv/doubo/shared/media).
media_dir="$(sed -n 's/^[[:space:]]*MEDIA_DIR=//p' /etc/doubo/doubo.env | tail -n 1 | tr -d "\"'\r")"
media_dir="${media_dir:-$base/shared/media}"
[[ "$media_dir" == /* ]] || die "MEDIA_DIR must be an absolute path: $media_dir"
mkdir -p "$media_dir"
chown doubo:doubo "$media_dir"
for assets in design model-icons brand; do
  mkdir -p "$media_dir/$assets"
  cp -R "$release/media/$assets/." "$media_dir/$assets/"
  chmod -R a+rX "$media_dir/$assets"
done
# Keep old hashed chunks so an already-open browser can still lazy-load pages.
cp -R "$release/web/assets/." "$base/shared/web/assets/"
chmod -R a+rX "$base/shared/web"
chmod 755 "$base" "$release_root" "$base/shared" "$release" "$release/bin"
chmod -R a+rX "$release/web"
chmod 755 "$release/bin/doubo-api"
install -m 644 "$release/deploy/native/doubo@.service" /etc/systemd/system/
install -m 644 "$release/deploy/native/doubo-migrate.service" /etc/systemd/system/
systemctl daemon-reload

# A missing or looped current link is not a previous release.
previous="$(readlink -e "$base/current" || true)"
switched=false
switch_to() {
  ln -sfn "$1" "$base/current.next"
  mv -Tf "$base/current.next" "$base/current"
}
rollback() {
  result=$?
  trap - ERR
  echo "Deployment failed. Check journalctl -u doubo-migrate -u doubo@serve -u doubo@worker." >&2
  systemctl --no-pager --lines=20 status doubo-migrate doubo@serve doubo@worker || true
  if [[ "$switched" == true ]]; then
    systemctl stop doubo@serve doubo@worker || true
  fi
  if [[ -n "$previous" && -f "$previous/bin/doubo-api" ]]; then
    if [[ "$switched" == true ]]; then switch_to "$previous"; fi
    systemctl reset-failed doubo@serve doubo@worker 2>/dev/null || true
    systemctl restart doubo@serve doubo@worker || true
    echo "Previous application selected; check service status. Database and environment were NOT rolled back." >&2
  fi
  exit "$result"
}
trap rollback ERR

# A single host has a brief maintenance window; never migrate on API startup.
systemctl stop doubo@serve doubo@worker
switch_to "$release"
switched=true
# Freshly installed inactive units may already be unloaded. Resetting their
# counters is optional; migration and startup errors below remain fatal.
systemctl reset-failed doubo-migrate doubo@serve doubo@worker 2>/dev/null || true
systemctl start doubo-migrate
systemctl enable doubo@serve doubo@worker
systemctl restart doubo@serve doubo@worker
for ((attempt = 0; attempt < 30; attempt++)); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:5173/health/ready >/dev/null && \
    systemctl is-active --quiet doubo@worker; then
    trap - ERR
    echo "Application ready: $(cat "$release/REVISION"). Check the HTTPS endpoint separately."
    exit 0
  fi
  sleep 2
done
echo "API/Worker health check timed out." >&2
false
