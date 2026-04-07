#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DRY_RUN=${DRY_RUN:-0}
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new)
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET=''
  C_RED=''
  C_CYAN=''
fi

step() {
  printf '\n%s==>%s %s\n' "$C_CYAN" "$C_RESET" "$*"
}

info() {
  printf '%s\n' "$*"
}

fail() {
  printf '%serror:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}

enable_error_trace() {
  set -o errtrace
  trap '
    status_code=$?
    printf "%serror:%s command failed (exit %s)\n" "$C_RED" "$C_RESET" "$status_code" >&2
    exit "$status_code"
  ' ERR
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

require_file() {
  [[ -f "$1" ]] || fail "missing file: $1"
}

require_dir() {
  [[ -d "$1" ]] || fail "missing directory: $1"
}

require_env() {
  [[ -n "${!1:-}" ]] || fail "missing environment variable: $1"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

tf_output() {
  terraform -chdir="$REPO_ROOT/infra/terraform" output -raw "$1"
}

terraform_init() {
  run terraform -chdir="$REPO_ROOT/infra/terraform" init
}

terraform_apply_var_file() {
  local var_file=$1
  run terraform -chdir="$REPO_ROOT/infra/terraform" apply -var-file="$var_file"
}

ssh_massops() {
  local host=$1
  shift
  run ssh "${SSH_OPTS[@]}" "massops@$host" "$@"
}

scp_to_massops() {
  local src=$1
  local host=$2
  local dest=$3
  run scp "$src" "massops@$host:$dest"
}

create_remote_stage_dir_massops() {
  local host=$1

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '%s\n' "/tmp/masswhisper-deploy.dry-run"
  else
    ssh "${SSH_OPTS[@]}" "massops@$host" 'umask 077 && mktemp -d /tmp/masswhisper-deploy.XXXXXX'
  fi
}

cleanup_remote_stage_dir_massops() {
  local host=$1
  local dir=$2

  [[ -n "$dir" ]] || return 0
  ssh_massops "$host" "rm -rf -- '$dir'"
}

run_ssh_massops_script() {
  local host=$1
  local script=$2

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf "+ ssh massops@%s 'bash -seu' <<'EOF'\n%s\nEOF\n" "$host" "$script"
  else
    ssh "${SSH_OPTS[@]}" "massops@$host" 'bash -seEu -o pipefail' <<EOF2
trap '
  status_code=\$?
  printf "error: remote command failed (exit %s): %s\n" "\$status_code" "\$BASH_COMMAND" >&2
  exit "\$status_code"
' ERR
$script
EOF2
  fi
}

read_backend_env_to_temp() {
  local input_path=$1
  local output_path=$2

  if [[ "$input_path" == "-" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      : > "$output_path"
    else
      cat > "$output_path"
    fi
    return 0
  fi

  require_file "$input_path"
  cp "$input_path" "$output_path"
}

manifest_field() {
  local manifest_path=$1
  local field_name=$2
  sed -n "s/^${field_name}: //p" "$manifest_path" | head -n 1
}
