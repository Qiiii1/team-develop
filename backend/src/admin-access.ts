import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { openDatabase } from './database.js';
import { adminAudit, users } from './schema.js';

export type WebDatabase = ReturnType<typeof openDatabase>['db'];

/** Deployment-only operation. No public HTTP endpoint can grant system administrator access. */
export function grantSystemAdmin(db: WebDatabase, username: string) {
  return db.transaction(tx => {
    const user = tx.select().from(users).where(and(eq(users.username, username.toLowerCase()), isNull(users.disabledAt))).get();
    if (!user) throw new Error('找不到这个已启用的账号，请先在网页注册并检查登录名。');
    if (!user.isSystemAdmin) {
      tx.update(users).set({ isSystemAdmin: true, adminRevision: user.adminRevision + 1 }).where(eq(users.id, user.id)).run();
      tx.insert(adminAudit).values({ id: randomUUID(), actorId: null, actorLabel: '本机部署者', action: 'admin.grant',
        targetType: 'user', targetId: user.id, targetLabel: user.username, details: '{}', createdAt: Date.now() }).run();
    }
    return { username: user.username, displayName: user.displayName };
  }, { behavior: 'immediate' });
}
