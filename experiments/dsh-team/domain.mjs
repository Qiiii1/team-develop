import { HttpError, text } from './http.mjs';

export const effectiveVersion = decision => [...decision.versions].reverse().find(version => version.confirmedAt) ?? null;

export function urlField(value) {
  const result = text(value, '成果或来源链接', 2000, true);
  if (result) {
    let url;
    try { url = new URL(result); } catch { throw new HttpError(400, '链接格式无效'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new HttpError(400, '链接需要 http 或 https');
  }
  return result;
}

export function progressFields(input, { allowEmpty = false } = {}) {
  const waitingOnIds = input.waitingOnIds ?? [];
  const decisionRefs = input.decisionRefs ?? [];
  if (!Array.isArray(waitingOnIds) || waitingOnIds.length > 9 || waitingOnIds.some(id => typeof id !== 'string')) throw new HttpError(400, '等待成员格式错误');
  if (!Array.isArray(decisionRefs) || decisionRefs.length > 30 || decisionRefs.some(ref => !ref || typeof ref.id !== 'string' || !Number.isSafeInteger(ref.version) || ref.version < 1 || Object.keys(ref).some(key => !['id', 'version'].includes(key)))) throw new HttpError(400, '关联决策格式错误');
  if (new Set(decisionRefs.map(ref => ref.id)).size !== decisionRefs.length) throw new HttpError(400, '关联决策重复');
  return {
    title: text(input.title, '工作事项', 120, true),
    completed: text(input.completed, '已完成工作', 2000, allowEmpty),
    nextStep: text(input.nextStep, '下一步', 1000, true),
    blocker: text(input.blocker, '阻塞', 1000, true),
    helpNeeded: text(input.helpNeeded, '需要的帮助', 1000, true),
    artifactUrl: urlField(input.artifactUrl),
    waitingOnIds: [...new Set(waitingOnIds)], decisionRefs: decisionRefs.map(ref => ({ ...ref })),
  };
}

export function validateTeamReferences(team, memberId, value, requireLatest = false) {
  if (value.waitingOnIds.some(id => id === memberId || !team.members.some(member => member.id === id))) throw new HttpError(400, '只能等待团队中的其他成员');
  for (const ref of value.decisionRefs) {
    const decision = team.decisions.find(item => item.id === ref.id);
    const version = decision?.versions.find(item => item.version === ref.version && item.confirmedAt);
    if (!version) throw new HttpError(400, '只能关联已经确认的决策版本');
    if (requireLatest && effectiveVersion(decision)?.version !== ref.version) throw new HttpError(409, '决策已经更新，请复核草稿后再发布');
  }
}

export function progressText(value) {
  return [value.completed, value.nextStep && `下一步：${value.nextStep}`, value.blocker && `阻塞：${value.blocker}`, value.helpNeeded && `需要帮助：${value.helpNeeded}`].filter(Boolean).join('\n');
}

export function projectTeam(team) {
  const decisions = (team.decisions ?? []).map(decision => ({ ...decision, effective: effectiveVersion(decision) }));
  const updates = team.updates.map(({ payloadHash, status, evidenceStage, ...update }) => ({
    ...update,
    needsReview: (update.decisionRefs ?? []).filter(ref => {
      const effective = decisions.find(decision => decision.id === ref.id)?.effective;
      return effective && effective.version > ref.version;
    }).map(ref => ({ ...ref, currentVersion: decisions.find(decision => decision.id === ref.id).effective.version })),
  }));
  const latest = team.members.map(member => [...updates].reverse().find(update => update.memberId === member.id && update.kind === 'progress')).filter(Boolean);
  return {
    id: team.id, name: team.name, goal: team.goal, revision: team.revision,
    members: team.members.map(({ tokenHash, ...member }) => member), updates, decisions,
    attention: {
      waiting: latest.flatMap(update => (update.waitingOnIds ?? []).map(memberId => ({ memberId: update.memberId, waitingOnId: memberId, updateId: update.id, reason: update.helpNeeded || update.blocker || update.nextStep }))),
      reviewUpdateIds: latest.filter(update => update.needsReview.length).map(update => update.id),
      pendingDecisionIds: decisions.filter(decision => !decision.versions.at(-1).confirmedAt).map(decision => decision.id),
    },
  };
}
