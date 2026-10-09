import { creaApp } from './app.js';
import { apriDb } from './db.js';

const PORT = Number(process.env.PORT ?? 3000);
const app = creaApp(apriDb(), { adminPassword: process.env.ADMIN_PASSWORD });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Magazzino in ascolto su http://localhost:${PORT}`);
    if (!process.env.ADMIN_PASSWORD) console.warn('ATTENZIONE: ADMIN_PASSWORD non impostata, l\'area admin è aperta');
});
