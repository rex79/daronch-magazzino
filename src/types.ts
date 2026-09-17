export interface Materiale {
    id: number,
    nome: string
}

export interface Giacenza {
    id: number,
    materiale_id: number,
    forma: string,
    misura: string,
    quantita: number
}