#!/usr/bin/env bash

set -euo pipefail

LOCK_FILE="/tmp/masswhisper-topic-capture.lock"
export PATH="/usr/local/bin:/usr/bin:/bin"

cd /opt/masswhisper
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  logger -t masswhisper-capture "capture skipped: lock held"
  exit 0
fi

logger -t masswhisper-capture "capture started"
if npm --workspace backend run agent 2>&1 | logger -t masswhisper-capture; then
  logger -t masswhisper-capture "capture finished"
else
  logger -t masswhisper-capture "capture failed"
  exit 1
fi
