// Uso: npm run export:csv -- [file.csv] [--excel]   (senza file: stampa su stdout)
import fs from 'node:fs';
import { apriDb, type Db } from './db.js';

const COLONNE = ['id', 'materiale', 'forma', 'misura', 'peso', 'barre', 'quantita', 'created_at', 'updated_at', 'note', 'spessore'] as const;

export interface OpzioniCsv {
    /** ';' come separatore, virgola decimale e BOM UTF-8: si apre correttamente in Excel italiano. */
    excel?: boolean;
}

function cella(v: unknown, { excel }: OpzioniCsv): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' && excel ? String(v).replace('.', ',') : String(v);
    const sep = excel ? ';' : ',';
    return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function esportaCsv(db: Db, opzioni: OpzioniCsv = {}): string {
    const righe = db.prepare(`
        SELECT m.id, mt.nome AS materiale, m.forma, m.misura, m.peso, m.barre, m.quantita,
               m.created_at, m.updated_at, m.note, m.spessore
        FROM magazzino m JOIN materiali mt ON mt.id = m.materiale_id
        ORDER BY mt.ordine, mt.nome, m.forma, m.misura, m.spessore`).all() as Record<string, unknown>[];
    const sep = opzioni.excel ? ';' : ',';
    const out = [COLONNE.join(sep), ...righe.map((r) => COLONNE.map((c) => cella(r[c], opzioni)).join(sep))];
    return (opzioni.excel ? '﻿' : '') + out.join('\r\n') + '\r\n';
}

export const nomeFileExport = (d = new Date()): string => `magazzino_${d.toISOString().slice(0, 10)}.csv`;

if (process.argv[1]?.endsWith('export-csv.ts')) {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith('--'));
    const csv = esportaCsv(apriDb(), { excel: args.includes('--excel') });
    if (file) { fs.writeFileSync(file, csv); console.log(`Esportato in ${file}`); } else process.stdout.write(csv);
}
