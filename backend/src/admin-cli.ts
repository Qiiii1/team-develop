import { resolve } from 'node:path';
import { grantSystemAdmin } from './admin-access.js';
import { openDatabase } from './database.js';

const username = process.argv[2];
if (!username || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new Error('用法：npm run admin:grant -- 登录名');
const directory = resolve(process.env.HARNESS_WEB_DATA_DIR ?? '.local/web');
const store = openDatabase(process.env.HARNESS_WEB_DB ?? resolve(directory, 'team.db'));
try {
  const user = grantSystemAdmin(store.db, username);
  console.log(`已授予 ${user.username} 系统管理员权限。刷新网页后进入“系统管理”。`);
} finally { store.sqlite.close(); }
