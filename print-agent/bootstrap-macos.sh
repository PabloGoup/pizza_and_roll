#!/bin/zsh
set -euo pipefail

agent_name="${1:?Falta el nombre del agente}"
agent_token="${2:?Falta el token del agente}"
supabase_url="${3:?Falta la URL de Supabase}"
supabase_key="${4:?Falta la clave publica de Supabase}"
repository_base="${5:-https://raw.githubusercontent.com/PabloGoup/pizza_and_roll/main/print-agent}"

install_dir="$HOME/Library/Application Support/PizzaAndRollPrintAgent"
plist_path="$HOME/Library/LaunchAgents/cl.pizzaroll.print-agent.plist"
mkdir -p "$install_dir" "$HOME/Library/LaunchAgents"

if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org/es/download"
  echo "Instala Node.js LTS y vuelve a abrir este instalador."
  read -r "?Presiona Enter para cerrar..."
  exit 1
fi

for file in agent.mjs package.json; do
  curl -fsSL "$repository_base/$file" -o "$install_dir/$file"
done

cat > "$install_dir/.env" <<EOF
PRINT_AGENT_SUPABASE_URL=$supabase_url
PRINT_AGENT_SUPABASE_ANON_KEY=$supabase_key
PRINT_AGENT_NAME=$agent_name
PRINT_AGENT_TOKEN=$agent_token
PRINT_AGENT_PRINTER=
PRINT_AGENT_POLL_MS=800
PRINT_AGENT_LOG_FILE=$install_dir/print-agent.log
EOF

npm install --omit=dev --prefix "$install_dir"
node_path="$(command -v node)"

cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>cl.pizzaroll.print-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_path</string>
    <string>--env-file=$install_dir/.env</string>
    <string>$install_dir/agent.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$install_dir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$install_dir/launch-agent.log</string>
  <key>StandardErrorPath</key><string>$install_dir/launch-agent.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/cl.pizzaroll.print-agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/cl.pizzaroll.print-agent"

echo "Computador vinculado correctamente. Ya puedes cerrar esta ventana."
read -r "?Presiona Enter para cerrar..."
