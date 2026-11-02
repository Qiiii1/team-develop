#!/bin/zsh
set -eu
team_bundle_dir="${0:A:h}"
team_dsh_home="${DSH_HOME:-$HOME/.dsh}"
team_profile="${TEAM_PLUGIN_PROFILE:-desktop}"
team_launcher="${TEAM_DSH_LAUNCHER:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}"
if [[ ! -x "$team_launcher" ]]; then
  print '请先安装 DeepSeek Harness 0.2.0-rc.2。其他安装位置可通过 TEAM_DSH_LAUNCHER 指定。'
  exit 1
fi
if [[ "$team_profile" == desktop && ! -f "$team_dsh_home/profiles/desktop/package.json" ]]; then
  print '请先打开一次 DeepSeek Harness，完成首次初始化后，再运行安装。'
  exit 1
fi
team_package="$team_bundle_dir/team-harness-dsh-plugin-0.0.3.tgz"
if [[ ! -f "$team_package" ]]; then
  print '请先完整解压试用包，再运行安装。'
  exit 1
fi
mkdir -p "$team_dsh_home/plugin-archives"
cp "$team_package" "$team_dsh_home/plugin-archives/team-harness-dsh-plugin-0.0.3.tgz"
DSH_HOME="$team_dsh_home" "$team_launcher" plugin --profile "$team_profile" add --ignore-scripts --config.auto-install-peers=false "$team_dsh_home/plugin-archives/team-harness-dsh-plugin-0.0.3.tgz"
print '\n安装完成。请完全退出并重新打开 DeepSeek Harness，在侧栏打开「团队情况」。'
print '加入异地团队时，粘贴发起人提供的完整邀请信息。'
