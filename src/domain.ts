import type { Modo } from './types.js';

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Accetta "3,5" o "3.5" e restituisce un numero, o NaN se non valido. */
export function parseNumero(valore: unknown): number {
    if (typeof valore === 'number') return valore;
    if (typeof valore !== 'string' || valore.trim() === '') return NaN;
    return Number(valore.trim().replace(',', '.'));
}

/** kg totali di `barre` barre lunghe `lunghezzaM` metri, con `peso` in kg/m. */
export const kgDaBarre = (barre: number, peso: number, lunghezzaM: number): number =>
    round3(barre * lunghezzaM * peso);

export interface Giacenza {
    barre: number;
    peso: number;
}

/**
 * Applica un movimento (positivo = carico, negativo = scarico) e restituisce
 * le nuove barre e i kg totali. In modalità kg le barre diventano frazionarie
 * invece di perdere il resto come faceva la vecchia versione.
 */
export function applicaMovimento(g: Giacenza, modo: Modo, quantita: number, lunghezzaM: number) {
    if (!Number.isFinite(quantita)) throw new Error('Quantità non valida');
    if (!(g.peso > 0)) throw new Error('Peso dell\'articolo non impostato');
    if (!(lunghezzaM > 0)) throw new Error('Lunghezza barra non valida');
    const deltaBarre = modo === 'barre' ? quantita : quantita / (g.peso * lunghezzaM);
    const barre = round3(g.barre + deltaBarre);
    return { barre, quantita: kgDaBarre(barre, g.peso, lunghezzaM), deltaBarre: round3(deltaBarre) };
}
