import { writeFileSync } from 'node:fs';
export const name = 'team-ai-verification';
export const inject = ['tools'];
export function apply(ctx, config) {
  const allowed = config.allowDraft ? ['team_state', 'team_progress_draft'] : ['team_state'];
  const calls = [];
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.restrict({ allow: allowed });
    agent.ctx.tools.presentAs('native');
  });
  ctx.tools.guard(exec => allowed.includes(exec.name) ? undefined : 'This verification run may only read team state or prepare a private draft.');
  ctx.on('tools/result', (exec, result) => {
    if (!allowed.includes(exec.name)) return;
    const call = { tool: exec.name, isError: Boolean(result.isError), result: result.value ?? result.content };
    calls.push(call);
    writeFileSync(config.auditFile, JSON.stringify({ ...call, calls }), { mode: 0o600 });
  });
}
