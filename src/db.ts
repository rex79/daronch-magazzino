import Database from 'better-sqlite3';
import type { Articolo, Materiale } from './types.js';

export const LUNGHEZZA_BARRA_DEFAULT = 3;

export type Db = Database.Database;

export function apriDb(file = process.env.DB_FILE ?? 'data/magazzino.db'): Db {
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS impostazioni (
        chiave TEXT PRIMARY KEY,
        valore TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS materiali (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        ordine INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS magazzino (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        materiale_id INTEGER NOT NULL REFERENCES materiali(id),
        forma TEXT NOT NULL,
        misura REAL NOT NULL,
        spessore REAL,
        peso REAL NOT NULL DEFAULT 0,
        barre REAL NOT NULL DEFAULT 0,
        quantita REAL NOT NULL DEFAULT 0,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS magazzino_unico
        ON magazzino (materiale_id, forma, misura, IFNULL(spessore, 0));
      CREATE TABLE IF NOT EXISTS movimenti (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        magazzino_id INTEGER NOT NULL REFERENCES magazzino(id) ON DELETE CASCADE,
        delta_barre REAL NOT NULL,
        barre_dopo REAL NOT NULL,
        lunghezza_barra REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare("INSERT OR IGNORE INTO impostazioni (chiave, valore) VALUES ('lunghezza_barra_m', ?)")
        .run(String(LUNGHEZZA_BARRA_DEFAULT));
    return db;
}


export const SELECT_ARTICOLO = `
  SELECT m.id, m.materiale_id, mt.nome AS materiale, m.forma, m.misura, m.spessore,
         m.peso, m.barre, m.quantita, m.note
  FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id`;

export const getLunghezzaBarra = (db: Db): number =>
    Number((db.prepare("SELECT valore FROM impostazioni WHERE chiave = 'lunghezza_barra_m'").get() as { valore: string }).valore);

export const getMateriali = (db: Db): Materiale[] =>
    db.prepare('SELECT id, nome, ordine FROM materiali ORDER BY ordine, nome').all() as Materiale[];

export const getArticolo = (db: Db, id: number): Articolo | undefined =>
    db.prepare(`${SELECT_ARTICOLO} WHERE m.id = ?`).get(id) as Articolo | undefined;

export function trovaOCreaMateriale(db: Db, nome: string): number {
    db.prepare('INSERT OR IGNORE INTO materiali (nome) VALUES (?)').run(nome);
    return (db.prepare('SELECT id FROM materiali WHERE nome = ?').get(nome) as { id: number }).id;
}
