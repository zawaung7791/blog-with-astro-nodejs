// Writes a consistent snapshot of the SQLite database to stdout.
// Used by scripts/backup.sh via `docker compose exec`.
import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH ?? '/data/blog.db', { readonly: true, fileMustExist: true });
const snapshot = db.serialize();
process.stdout.write(snapshot);
