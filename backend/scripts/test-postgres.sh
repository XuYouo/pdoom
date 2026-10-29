#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
[[ "$ROOT" == */backend ]] || { echo 'Unexpected backend directory' >&2; exit 1; }
for TOOL in initdb postgres pg_isready; do command -v "$TOOL" >/dev/null; done
# Never use the host's credentials, service files, PGDATA or running clusters.
export PGPASSFILE=/dev/null
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGDATA
if pg_isready -h 127.0.0.1 -p 55439 >/dev/null 2>&1; then
  echo 'Port 55439 is occupied. Refusing to connect or reuse it.' >&2
  exit 1
fi
mkdir -p "$ROOT/.local"
DATA="$(mktemp -d "$ROOT/.local/pg-test.XXXXXX")"
[[ "$DATA" == "$ROOT"/.local/pg-test.* && ! -L "$DATA" ]] || exit 1
printf '%s\n' "$DATA" > "$ROOT/.local/active-test-cluster-path"
initdb -D "$DATA" --username=pdoom_test --encoding=UTF8 --locale=C --auth=trust
# Managed foreground process. Stop only this job after tests; never start a system service.
# The socket remains inside the private mktemp directory. The test cluster contains no real credentials/data.
exec postgres -D "$DATA" -h 127.0.0.1 -p 55439 -k "$DATA" -c unix_socket_permissions=0700
