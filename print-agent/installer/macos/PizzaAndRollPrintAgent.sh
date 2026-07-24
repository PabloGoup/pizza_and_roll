#!/bin/zsh
set -euo pipefail

supabase_url="https://aefneixnrlkbhfyplkid.supabase.co"
supabase_key="sb_publishable_dET07DIxJcMCFSd6qDsPWw_JnIj8Hep"
label="cl.pizzaroll.print-agent"
resources_dir="$(cd "$(dirname "$0")/../Resources" && pwd)"
support_dir="$HOME/Library/Application Support/Pizza and Roll/Print Agent"
launch_agents_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agents_dir/$label.plist"
architecture="$(uname -m)"
if [[ "$architecture" == "arm64" ]]; then
  node_path="$resources_dir/node-arm64"
else
  node_path="$resources_dir/node-x64"
fi

pairing_code="$(
  osascript <<'APPLESCRIPT'
tell application "System Events"
  activate
  set response to display dialog "Ingresa el código de 8 caracteres mostrado en la sección Impresión de Pizza and Roll." default answer "" with title "Vincular computador" buttons {"Cancelar", "Vincular"} default button "Vincular" cancel button "Cancelar" with icon note
  return text returned of response
end tell
APPLESCRIPT
)"

pairing_code="$(printf "%s" "$pairing_code" | tr '[:lower:]' '[:upper:]' | tr -d '[:space:]')"
if [[ ${#pairing_code} -ne 8 ]]; then
  osascript -e 'display alert "Código no válido" message "El código debe tener 8 caracteres." as critical'
  exit 1
fi

mkdir -p "$support_dir" "$launch_agents_dir"

if ! "$node_path" \
  "$resources_dir/pair-agent.mjs" \
  "$pairing_code" \
  "$supabase_url" \
  "$supabase_key" \
  "$support_dir"; then
  osascript -e 'display alert "No se pudo vincular" message "Verifica que el código no haya vencido y vuelve a intentarlo." as critical'
  exit 1
fi

cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_path</string>
    <string>--env-file=$support_dir/.env</string>
    <string>$resources_dir/agent.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$support_dir</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$support_dir/launch-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$support_dir/launch-agent-error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/$label"

osascript -e 'display notification "El computador ya está conectado y reportará sus impresoras en unos segundos." with title "Pizza and Roll - Impresión"'
osascript -e 'display dialog "Instalación completada. Ya puedes cerrar esta ventana y volver al panel de Impresión." with title "Pizza and Roll - Impresión" buttons {"Listo"} default button "Listo" with icon note'
