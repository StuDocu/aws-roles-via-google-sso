#!/bin/bash
set -xe

# Files copied from a browser download carry com.apple.quarantine. launchctl
# bootstrap then fails with: Bootstrap failed: 5: Input/output error
user_uid=$(id -u)
if [[ "$user_uid" -eq 0 && -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  user_uid=$(id -u "$SUDO_USER")
  HOME=$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory | awk '{print $2}')
fi

launch_config_dir="$HOME/Library/LaunchAgents"
launch_config_path="$launch_config_dir/com.github.ilyatbn.aws_alwayson.plist"
service_path="$HOME/.local/share/aosvc/bin"

mkdir -p "$service_path"
mkdir -p "$launch_config_dir"
cp aosvc "$service_path"
cp aosvc.plist "$launch_config_path"
xattr -cr "$service_path/aosvc" "$launch_config_path" 2>/dev/null || true
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R "$SUDO_USER:staff" "$HOME/.local/share/aosvc" "$launch_config_path"
fi
launchctl bootout "gui/$user_uid/aosvc" 2>/dev/null || true
launchctl bootstrap "gui/$user_uid" "$launch_config_path"
launchctl kickstart -k "gui/$user_uid/aosvc"
