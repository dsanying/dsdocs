export const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','editor','publisher','reader')), disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(username TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, translation_key TEXT NOT NULL, locale TEXT NOT NULL, version TEXT NOT NULL, head INTEGER NOT NULL DEFAULT 0, published INTEGER, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(translation_key,locale,version));
CREATE TABLE IF NOT EXISTS revisions(document_id TEXT NOT NULL REFERENCES documents(id), number INTEGER NOT NULL, snapshot TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(document_id,number));
CREATE TABLE IF NOT EXISTS routes(locale TEXT NOT NULL, version TEXT NOT NULL, path TEXT NOT NULL, document_id TEXT NOT NULL REFERENCES documents(id), PRIMARY KEY(locale,version,path), UNIQUE(document_id));
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset_references(asset_id TEXT NOT NULL REFERENCES assets(id), document_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(asset_id,document_id,revision), FOREIGN KEY(document_id,revision) REFERENCES revisions(document_id,number));
CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY, actor TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL, title TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, actor TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`;
