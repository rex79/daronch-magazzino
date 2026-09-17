import express, { Request, Response } from 'express';

// models
import { getMateriali } from './db';

const app = express();
const PORT = 3000;

app.get("/api/materiali", (req: Request, res: Response) => {
    res.json({err: 'ok', data: getMateriali() });
});

app.get("/api/ciao", (req: Request, res: Response) => {
    res.json({ err: 'ok', data: 'il server risponde'});
});

app.listen(PORT, '0.0.0.0', () => {
    console.log("il server è in ascolto alla porta 3000");
})