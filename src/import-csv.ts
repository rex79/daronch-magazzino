// Uso: npm run import:csv -- <file.csv> [--separatore '#'] [--senza-intestazione]
// Formati: export Postgres (con intestazione: materiale,forma,misura,peso,barre,quantita,note,spessore)
//          legacy all.csv (senza intestazione, '#': materiale#forma#misura#peso#barre#note)
import fs from 'node:fs';
import { apriDb, getLunghezzaBarra, trovaOCreaMateriale } from './db.js';
import { kgDaBarre, parseNumero } from './domain.js';

export function parseCsv(testo: string, sep: string): string[][] {
    const righe: string[][] = [];
    let riga: string[] = [], campo = '', quoted = false;
    for (let i = 0; i < testo.length; i++) {
        const c = testo[i]!;
        if (quoted) {
            if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') quoted = false;
            else campo += c;
        } else if (c === '"') quoted = true;
        else if (c === sep) { riga.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && testo[i + 1] === '\n') i++;
            riga.push(campo); campo = '';
            if (riga.some((x) => x !== '')) righe.push(riga);
            riga = [];
        } else campo += c;
    }
    riga.push(campo);
    if (riga.some((x) => x !== '')) righe.push(riga);
    return righe;
}

if (process.argv[1]?.endsWith('import-csv.ts')) {
    const args = process.argv.slice(2);
    const sepIdx = args.indexOf('--separatore');
    const file = args.find((a, i) => !a.startsWith('--') && (sepIdx < 0 || i !== sepIdx + 1));
    if (!file) { console.error('Indicare il file CSV'); process.exit(1); }
    const sep = sepIdx >= 0 ? args[sepIdx + 1]! : ',';
    let righe = parseCsv(fs.readFileSync(file, 'utf8'), sep);
    let colonne = ['materiale', 'forma', 'misura', 'peso', 'barre', 'note'];
    if (!args.includes('--senza-intestazione')) colonne = righe.shift()!.map((c) => c.trim());

    const db = apriDb();
    const lunghezza = getLunghezzaBarra(db);
    const ins = db.prepare(`INSERT INTO magazzino (materiale_id, forma, misura, spessore, peso, barre, quantita, note)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT DO UPDATE SET peso = excluded.peso, barre = excluded.barre,
                              quantita = excluded.quantita, note = excluded.note`);
    let n = 0, saltate = 0;
    db.transaction(() => {
        for (const r of righe) {
            const v = Object.fromEntries(colonne.map((c, i) => [c, (r[i] ?? '').trim()]));
            const misura = parseNumero(v.misura), peso = parseNumero(v.peso);
            if (!v.materiale || !v.forma || !Number.isFinite(misura) || !Number.isFinite(peso)) { saltate++; continue; }
            const spessore = parseNumero(v.spessore ?? '');
            let barre = parseNumero(v.barre ?? '');
            if (!Number.isFinite(barre)) {
                const kg = parseNumero(v.quantita ?? '');
                barre = Number.isFinite(kg) && peso > 0 ? kg / (peso * lunghezza) : 0;
            }
            ins.run(trovaOCreaMateriale(db, v.materiale), v.forma.toUpperCase(), misura,
                Number.isFinite(spessore) && spessore !== 0 ? spessore : null, peso, barre,
                kgDaBarre(barre, peso, lunghezza), v.note || null);
            n++;
        }
    })();
    console.log(`Importate ${n} righe, saltate ${saltate}`);
}
