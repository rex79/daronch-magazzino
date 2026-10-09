export interface Materiale {
    id: number;
    nome: string;
    ordine: number;
}

export interface Articolo {
    id: number;
    materiale_id: number;
    materiale: string;
    forma: string;
    misura: number;
    spessore: number | null;
    peso: number;
    barre: number;
    quantita: number;
    note: string | null;
}

export type Modo = 'barre' | 'kg';
