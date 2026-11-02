#!/bin/zsh
set -eu
team_launcher="${TEAM_DSH_LAUNCHER:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}"
"$team_launcher" plugin --profile "${TEAM_PLUGIN_PROFILE:-desktop}" remove team-harness-dsh-plugin
print '\n插件已移除，重新打开 dsh 后生效。本机身份和私人草稿保留。'
