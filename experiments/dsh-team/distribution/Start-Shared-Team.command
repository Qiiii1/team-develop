#!/bin/zsh
set -eu
team_bundle_dir="${0:A:h}"
team_electron="${TEAM_DSH_APP:-/Applications/DeepSeek Harness.app}/Contents/MacOS/DeepSeek Harness"
if [[ -x "$team_electron" ]]; then
  ELECTRON_RUN_AS_NODE=1 "$team_electron" --expose-internals "$team_bundle_dir/owner/start-share.mjs"
elif command -v node >/dev/null 2>&1; then
  node "$team_bundle_dir/owner/start-share.mjs"
else
  print '请先安装 DeepSeek Harness，或 Node.js 22 及以上版本。'
  exit 1
fi
