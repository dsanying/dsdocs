import { betterAuth, APIError } from 'better-auth';
import { admin, username } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { getMigrations } from 'better-auth/db/migration';
import Database from 'better-sqlite3';
import { mkdir, open, readFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export async function createAccounts({ directory, origin }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(directory, 'session.key');
  try {
    const file = await open(keyPath, 'wx', 0o600);
    await file.writeFile(randomBytes(48).toString('base64url'));
    await file.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const secret = await readFile(keyPath, 'utf8');
  if (secret.length < 32) throw new Error('账号密钥文件无效。');
  const databasePath = path.join(directory, 'accounts.sqlite');
  const db = new Database(databasePath);
  await chmod(databasePath, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const options = {
    appName: 'DSdocs',
    baseURL: origin,
    basePath: '/__dsdocs_auth',
    secret,
    database: db,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 4,
      maxPasswordLength: 128,
    },
    session: { expiresIn: 60 * 60 * 8, cookieCache: { enabled: false } },
    user: {
      additionalFields: { needsSetup: { type: 'boolean', defaultValue: false, input: false } },
    },
    rateLimit: { enabled: true, window: 60, max: 20 },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 64 }),
      admin({
        defaultRole: 'admin',
        adminRoles: ['superadmin'],
        roles: { superadmin: adminAc, admin: userAc },
      }),
    ],
    databaseHooks: {
      user: {
        delete: {
          before: async (user) => {
            if (user.role === 'superadmin')
              throw new APIError('FORBIDDEN', { message: '超级管理员不能删除。' });
          },
        },
      },
    },
    logger: { level: 'error' },
  };
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);
  if (!db.prepare('SELECT count(*) AS total FROM user').get().total) {
    // Public bootstrap credentials requested by the project; locked to setup until both change.
    const { user } = await auth.api.createUser({
      body: {
        email: 'admin@accounts.invalid',
        password: 'admin',
        name: 'admin',
        role: 'superadmin',
        data: { username: 'admin' },
      },
    });
    db.prepare('UPDATE user SET needsSetup = 1 WHERE id = ?').run(user.id);
  }
  const visible = (user) => ({ id: user.id, username: user.username, role: user.role });
  const userById = (id) =>
    db.prepare('SELECT id, username, role, needsSetup FROM user WHERE id = ?').get(id);
  const revoke = (id) => db.prepare('DELETE FROM session WHERE userId = ?').run(id);
  return { auth, db, visible, userById, revoke, close: () => db.close() };
}
