#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
[[ "$ROOT" == */backend ]] || { echo 'Unexpected backend directory' >&2; exit 1; }
JAR="$ROOT/.tools/sbt-launch-1.10.7.jar"
[[ -f "$JAR" ]] || { echo 'Download the pinned launcher as documented in backend/README.md first.' >&2; exit 1; }
mkdir -p "$ROOT/.cache/sbt" "$ROOT/.cache/ivy" "$ROOT/.cache/coursier"
export COURSIER_CACHE="$ROOT/.cache/coursier"
cd "$ROOT"
# Local services are direct: pgjdbc and JDK SOCKS defaults disagree for numeric loopback.
# This flag affects only this child JVM, never system proxy settings.
exec java -Xms256m -Xmx2g '-DsocksNonProxyHosts=localhost|127.0.0.1|[::1]' \
  -Dsbt.global.base="$ROOT/.cache/sbt/global" \
  -Dsbt.boot.directory="$ROOT/.cache/sbt/boot" \
  -Dsbt.ivy.home="$ROOT/.cache/ivy" \
  -Dsbt.repository.config="$ROOT/project/repositories" \
  -Dsbt.override.build.repos=true -Dsbt.supershell=false -Dsbt.log.noformat=true \
  -jar "$JAR" "$@"
