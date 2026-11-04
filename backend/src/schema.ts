import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, check, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), username: text('username_normalized').notNull().unique(),
  displayName: text('display_name').notNull(), passwordHash: text('password_hash').notNull(),
  avatarId: text('avatar_id').notNull().default('ip-1'),
  createdAt: integer('created_at').notNull(), disabledAt: integer('disabled_at'),
  aiConfigRevision: integer('ai_config_revision').notNull().default(0),
  isSystemAdmin: integer('is_system_admin', { mode: 'boolean' }).notNull().default(false),
  adminRevision: integer('admin_revision').notNull().default(0),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(), expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(), revokedAt: integer('revoked_at'),
}, t => [index('sessions_user_idx').on(t.userId)]);
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  revision: integer('revision').notNull().default(1), createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
});
export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
  joinedAt: integer('joined_at').notNull(), removedAt: integer('removed_at'),
}, t => [primaryKey({ columns: [t.teamId, t.userId] }),
  index('members_user_idx').on(t.userId), check('valid_member_role', sql`${t.role} IN ('owner', 'admin', 'member')`)]);
export const teamInvites = sqliteTable('team_invites', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull().references(() => teams.id),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(), maxUses: integer('max_uses').notNull(),
  usedCount: integer('used_count').notNull().default(0), revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull(),
}, t => [index('invites_team_idx').on(t.teamId),
  check('invite_uses_valid', sql`${t.usedCount} >= 0 AND ${t.maxUses} > 0 AND ${t.usedCount} <= ${t.maxUses}`)]);
export const aiConfigs = sqliteTable('user_ai_configs', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().unique().references(() => users.id),
  provider: text('provider_id').notNull(), model: text('model').notNull(),
  ciphertext: text('key_ciphertext').notNull(), nonce: text('nonce').notNull(), authTag: text('auth_tag').notNull(),
  keyVersion: integer('key_version').notNull(), revision: integer('revision').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(), actorId: text('actor_id').references(() => users.id),
  actorLabel: text('actor_label').notNull(), action: text('action').notNull(),
  targetType: text('target_type').notNull(), targetId: text('target_id').notNull(),
  targetLabel: text('target_label').notNull(), details: text('details').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [index('admin_audit_time_idx').on(t.createdAt)]);
