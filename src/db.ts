import Database from 'better-sqlite3';

export const db = new Database("magazzino.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS materiali (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS magazzino (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    materiale_id INTEGER NOT NULL,
    forma TEXT NOT NULL,
    misura TEXT NOT NULL,
    quantita REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (materiale_id) REFERENCES materiali(id)
  );
`);

export function getMateriali(): Materiale[] {
    return db.prepare("SELECT * FROM materiali").all() as Materiale[];
}