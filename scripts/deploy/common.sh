#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DRY_RUN=${DRY_RUN:-0}

step() {
  printf '\n==> %s\n' "$*"
}

info() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
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

ssh_root() {
  local host=$1
  shift
  run ssh "root@$host" "$@"
}

ssh_massops() {
  local host=$1
  shift
  run ssh "massops@$host" "$@"
}

scp_to_root() {
  local src=$1
  local host=$2
  local dest=$3
  run scp "$src" "root@$host:$dest"
}

run_ssh_root_script() {
  local host=$1
  local script=$2

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf "+ ssh root@%s 'bash -seu' <<'EOF'\n%s\nEOF\n" "$host" "$script"
  else
    ssh "root@$host" 'bash -seu' <<EOF2
$script
EOF2
  fi
}

run_ssh_massops_script() {
  local host=$1
  local script=$2

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf "+ ssh massops@%s 'bash -seu' <<'EOF'\n%s\nEOF\n" "$host" "$script"
  else
    ssh "massops@$host" 'bash -seu' <<EOF2
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
