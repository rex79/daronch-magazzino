import { creaApp } from './app.js';
import { apriDb, inizializza } from './db.js';

const PORT = Number(process.env.PORT ?? 3000);
const db = apriDb();
await inizializza(db);
const app = creaApp(db, { adminPassword: process.env.ADMIN_PASSWORD });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Magazzino in ascolto su http://localhost:${PORT}`);
    if (!process.env.DATABASE_URL) console.warn('DATABASE_URL non impostata: uso il Postgres locale (magazzino)');
    if (!process.env.ADMIN_PASSWORD) console.warn('ATTENZIONE: ADMIN_PASSWORD non impostata, l\'area admin è aperta');
});
