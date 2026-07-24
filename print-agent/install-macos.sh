#!/bin/zsh
set -euo pipefail

agent_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$agent_dir/.." && pwd)"
env_file="$agent_dir/.env"
agent_file="$agent_dir/agent.mjs"
node_path="$(command -v node)"
label="cl.pizzaroll.print-agent"
plist_path="$HOME/Library/LaunchAgents/$label.plist"
log_path="$agent_dir/launch-agent.log"

if [[ ! -f "$env_file" ]]; then
  echo "Falta $env_file. Copia .env.example a .env y completa sus valores." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

sed \
  -e "s|__NODE__|$node_path|g" \
  -e "s|__ENV__|$env_file|g" \
  -e "s|__AGENT__|$agent_file|g" \
  -e "s|__WORKDIR__|$project_dir|g" \
  -e "s|__LOG__|$log_path|g" \
  "$agent_dir/macos-launch-agent.plist.template" > "$plist_path"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/$label"

echo "Agente instalado e iniciado: $label"
