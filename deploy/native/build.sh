#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
output="$root/out/package"
cd "$root"

case "${TARGET_ARCH:-amd64}" in
  amd64|arm64) ;;
  *) echo "TARGET_ARCH must be amd64 or arm64" >&2; exit 1 ;;
esac

# Use a Linux build runner with Node >=22.12 and Go >=1.26 installed.
node --version
go version
npm ci --prefix web
npm run build --prefix web
(
  cd server
  go test ./...
)

# Only the generated output directory is replaced; never package the workspace.
[[ "$root" != / && "$output" == "$root/out/package" ]]
rm -rf -- "$output"
mkdir -p "$output/bin" "$output/web" "$output/media" "$output/deploy"
(
  cd server
  CGO_ENABLED=0 GOOS=linux GOARCH="${TARGET_ARCH:-amd64}" \
    go build -trimpath -ldflags='-s -w' -o "$output/bin/doubo-api" ./cmd/server
)
cp -R web/dist/. "$output/web/"
cp -R media/design media/model-icons "$output/media/"
cp -R deploy/native "$output/deploy/"
git rev-parse HEAD > "$output/REVISION"

echo "Upload out/package/ as a Flow artifact, without including its parent directories."
