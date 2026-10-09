import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { creaApp } from './app.js';
import { apriDb, trovaOCreaMateriale } from './db.js';
import { applicaMovimento, parseNumero } from './domain.js';

test('parseNumero accetta la virgola', () => {
    assert.equal(parseNumero('3,5'), 3.5);
    assert.ok(Number.isNaN(parseNumero('')));
});

test('barre: carico, scarico e lunghezza configurabile', () => {
    assert.deepEqual(applicaMovimento({ barre: 2, peso: 0.1 }, 'barre', 3, 3), { barre: 5, quantita: 1.5, deltaBarre: 3 });
    assert.equal(applicaMovimento({ barre: 5, peso: 0.1 }, 'barre', -1, 6).quantita, 2.4);
});

test('kg: converte in barre senza perdere il resto', () => {
    const r = applicaMovimento({ barre: 0, peso: 0.5 }, 'kg', 4, 3);
    assert.equal(r.barre, 2.667);
});

test('peso zero è rifiutato', () => {
    assert.throws(() => applicaMovimento({ barre: 0, peso: 0 }, 'kg', 1, 3));
});

test('API: flusso completo', async () => {
    const db = apriDb(':memory:');
    const mid = trovaOCreaMateriale(db, 'AVP');
    db.prepare('INSERT INTO magazzino (materiale_id, forma, misura, peso, barre) VALUES (?, ?, ?, ?, ?)').run(mid, 'TONDO', 3, 0.055, 115);
    const server = creaApp(db, { adminPassword: 'x' }).listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        const a = (await (await fetch(`${base}/api/articolo?materiale=AVP&forma=TONDO&misura=3,0`)).json()).data;
        assert.equal(a.barre, 115);
        const m = await fetch(`${base}/api/movimenti`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ articolo_id: a.id, modo: 'barre', quantita: '-5' }) });
        assert.equal((await m.json()).data.barre, 110);
        assert.equal((await fetch(`${base}/api/articolo?materiale=AVP&forma=TONDO&misura=9`)).status, 404);
        assert.equal((await fetch(`${base}/api/admin/magazzino`)).status, 401);
        assert.equal((await fetch(`${base}/api/admin/magazzino`, { headers: { 'x-admin-password': 'x' } })).status, 200);
        const imp = await fetch(`${base}/api/impostazioni`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': 'x' },
            body: JSON.stringify({ lunghezza_barra_m: 6 }) });
        assert.equal(imp.status, 200);
        assert.equal((await (await fetch(`${base}/api/articoli/${a.id}`)).json()).data.quantita, 36.3);
    } finally { server.close(); }
});
