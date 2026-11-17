const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => (n == null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','));
const enc = encodeURIComponent;
const leggi = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const scrivi = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* storage non disponibile */ } };
let password = leggi('adminPassword') ?? '';

async function api(url, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (admin) headers['x-admin-password'] = password;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && admin) {
    password = await chiedi('Password amministratore', { password: true });
    scrivi('adminPassword', password);
    if (password) return api(url, { method, body, admin });
  }
  if (!res.ok) throw new Error(json.err ?? `Errore ${res.status}`);
  return json.data;
}

// finestre in pagina al posto di prompt/confirm/alert (non disponibili ovunque)
function chiedi(testo, { password: pw = false, conferma = false } = {}) {
  return new Promise((resolve) => {
    dialog.innerHTML = `<form method="dialog"><h2>${esc(testo)}</h2>${conferma ? '' : `<input name="v" type="${pw ? 'password' : 'text'}" autofocus>`}
      <div class="row" style="margin-top:12px"><button type="button" data-annulla>Annulla</button><button class="primary" value="ok">OK</button></div></form>`;
    // "Annulla" non è un pulsante di invio, così Invio conferma invece di annullare
    dialog.querySelector('[data-annulla]').onclick = () => dialog.close('cancel');
    dialog.onclose = () => resolve(conferma ? dialog.returnValue === 'ok' : dialog.returnValue === 'ok' ? dialog.querySelector('input').value : '');
    dialog.showModal();
  });
}
const avviso = (testo) => chiedi(testo, { conferma: true });
const back = (href) => `<a class="back" href="${href}">← Torna indietro</a>`;
const render = (html) => { app.innerHTML = html; app.scrollTop = 0; };

let toastTimer;
function errore(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

// --- barra superiore: indietro e percorso -------------------------------------
function barra({ indietro = null, percorso = [] } = {}) {
  const b = $('indietro');
  b.hidden = !indietro;
  b.onclick = indietro ? () => { location.hash = indietro; } : null;
  $('percorso').innerHTML = percorso.map((p) => `<b>${esc(p)}</b>`).join('<i>›</i>');
  $('admin-link').hidden = Boolean(indietro);
}

// --- schermo intero ----------------------------------------------------------
const pieno = () => document.fullscreenElement ?? document.webkitFullscreenElement;
const puoPieno = () => Boolean(document.documentElement.requestFullscreen ?? document.documentElement.webkitRequestFullscreen);
function entraPieno() {
  const el = document.documentElement;
  const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (req && !pieno()) Promise.resolve(req.call(el, { navigationUI: 'hide' })).catch(() => {});
}
$('schermo').hidden = !puoPieno() || matchMedia('(display-mode: fullscreen)').matches;
$('schermo').onclick = () => (pieno() ? (document.exitFullscreen ?? document.webkitExitFullscreen).call(document) : entraPieno());
const esciPieno = () => { if (pieno()) Promise.resolve((document.exitFullscreen ?? document.webkitExitFullscreen).call(document)).catch(() => {}); };
// al primo tocco su una schermata operatore torna a schermo intero (i browser lo permettono solo dopo un gesto).
// Solo con il dito o la penna: l'admin si usa dal computer con il mouse e resta in una finestra normale.
addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || document.body.classList.contains('admin')) return;
  if (e.target.closest('#schermo, #admin-link')) return;
  entraPieno();
}, { capture: true });

// --- inattività: dopo 2 minuti si torna alla scelta del materiale ---------------
let inattivo;
const riarma = () => {
  clearTimeout(inattivo);
  inattivo = setTimeout(() => {
    const h = location.hash || '#/';
    if (h !== '#/' && !h.startsWith('#/admin')) location.hash = '#/';
  }, 120_000);
};
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, riarma, { passive: true }));
riarma();

// --- rotte ---------------------------------------------------------------------
const rotte = [
  [/^\/$/, home],
  [/^\/forma\/([^/]+)$/, forma],
  [/^\/misura\/([^/]+)\/([^/]+)$/, misura],
  [/^\/quantita\/(\d+)$/, quantita],
  [/^\/admin$/, admin],
];

async function route() {
  const path = location.hash.slice(1) || '/';
  const inAdmin = path === '/admin';
  document.body.classList.toggle('admin', inAdmin);
  if (inAdmin) esciPieno();
  document.querySelector('.velo')?.remove();
  for (const [re, fn] of rotte) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1).map(decodeURIComponent)); }
      catch (e) { barra({ indietro: '#/' }); render(`<p class="messaggio">${esc(e.message)}</p>`); }
      return;
    }
  }
  location.hash = '#/';
}
addEventListener('hashchange', route);
route();

// --- schermate operatore ---------------------------------------------------------
async function home() {
  barra();
  const materiali = await api('/api/materiali');
  render(`<h1>Scegli il materiale</h1><div class="griglia">${materiali.map((m) =>
    `<a class="tile" href="#/forma/${enc(m.nome)}">${esc(m.nome.replace(/_/g, ' '))}</a>`).join('')}</div>`);
}

const ICONE = {
  TONDO: '<circle cx="50" cy="50" r="38"/>',
  QUADRO: '<rect x="14" y="14" width="72" height="72" rx="4"/>',
  ESAGONO: '<path d="M50 10l35 20v40L50 90 15 70V30z"/>',
  TUBO: '<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="22"/>',
};
const icona = (f) => (ICONE[f] ? `<svg viewBox="0 0 100 100" aria-hidden="true">${ICONE[f]}</svg>` : '');

async function forma(materiale) {
  barra({ indietro: '#/', percorso: [materiale] });
  const forme = await api(`/api/forme?materiale=${enc(materiale)}`);
  if (forme.length === 1) return location.replace(`#/misura/${enc(materiale)}/${enc(forme[0].forma)}`);
  render(`<h1>Scegli la forma</h1><div class="griglia larga">${forme.map((f) =>
    `<a class="tile forma" href="#/misura/${enc(materiale)}/${enc(f.forma)}">${icona(f.forma)}${esc(f.forma)}</a>`).join('')}</div>`);
}

async function misura(materiale, forma) {
  barra({ indietro: `#/forma/${enc(materiale)}`, percorso: [materiale, forma] });
  const misure = await api(`/api/misure?materiale=${enc(materiale)}&forma=${enc(forma)}`);
  if (!misure.length) return render('<p class="messaggio">Nessuna misura registrata per questa forma.</p>');
  render(`<h1>Scegli la misura</h1><div class="griglia stretta">${misure.map((m) =>
    `<a class="tile${m.barre > 0 ? '' : ' vuota'}" href="#/quantita/${m.id}">
      <span class="num">${fmt(m.misura)}</span>${m.spessore ? `<span class="sp">sp. ${fmt(m.spessore)}</span>` : ''}
      <small>${fmt(m.barre)} barre</small></a>`).join('')}</div>`);
}

const nomeArticolo = (a) => `${a.materiale.replace(/_/g, ' ')} ${a.forma} ${fmt(a.misura)}${a.spessore ? ` sp. ${fmt(a.spessore)}` : ''}`;

async function quantita(id) {
  const [a, imp] = await Promise.all([api(`/api/articoli/${id}`), api('/api/impostazioni')]);
  const lunghezza = imp.lunghezza_barra_m;
  barra({ indietro: `#/misura/${enc(a.materiale)}/${enc(a.forma)}`, percorso: [a.materiale, a.forma, fmt(a.misura) + (a.spessore ? ` sp. ${fmt(a.spessore)}` : '')] });
  // nessun verso preselezionato: l'operatore sceglie sempre prelievo o carico
  const stato = { segno: 0, modo: 'barre', testo: '' };

  render(`<div class="quantita">
    <div class="pannello">
      <div class="articolo"><div class="nome">${esc(nomeArticolo(a))}</div>
        <div class="giacenza"><div><span>A magazzino</span><strong>${fmt(a.barre)} barre</strong></div><div><span>Peso totale</span><strong>${fmt(a.quantita)} kg</strong></div></div>
        ${a.note ? `<div class="nota">${esc(a.note)}</div>` : ''}</div>
      <div class="segmenti movimento" id="segno"><button data-v="-1">− Prelievo</button><button data-v="1">+ Carico</button></div>
      <div class="segmenti" id="modo"><button data-v="barre">Barre</button><button data-v="kg">Kg</button></div>
      <div class="display"><div class="valore" id="valore"></div><div class="unita" id="unita"></div></div>
      <div class="anteprima" id="anteprima"></div>
    </div>
    <div class="pannello">
      <div class="tastierino">${['1','2','3','4','5','6','7','8','9',',','0','⌫'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
      <button class="grande" id="ok" disabled>Conferma</button>
    </div></div>`);

  const valore = () => Number(stato.testo.replace(',', '.'));
  const aggiorna = () => {
    $('segno').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === stato.segno)));
    $('modo').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === stato.modo)));
    const v = $('valore');
    v.textContent = stato.testo ? `${stato.segno > 0 ? '+ ' : stato.segno < 0 ? '− ' : ''}${stato.testo}` : '0';
    v.classList.toggle('vuoto', !stato.testo);
    $('unita').textContent = stato.modo === 'kg' ? 'kg' : 'barre';
    const n = valore();
    const numeroOk = stato.testo !== '' && Number.isFinite(n) && n > 0;
    const ok = numeroOk && stato.segno !== 0;
    $('ok').disabled = !ok;
    $('ok').textContent = numeroOk && !stato.segno ? 'Scegli prelievo o carico' : 'Conferma';
    const p = $('anteprima');
    if (!ok) { p.textContent = ''; p.classList.remove('negativa'); return; }
    const delta = stato.segno * (stato.modo === 'kg' ? n / (a.peso * lunghezza) : n);
    const dopo = Math.round((a.barre + delta) * 1000) / 1000;
    p.innerHTML = `Dopo: <strong>${fmt(dopo)} barre</strong> · ${fmt(dopo * a.peso * lunghezza)} kg${dopo < 0 ? ' — più di quanto risulta a magazzino' : ''}`;
    p.classList.toggle('negativa', dopo < 0);
  };
  $('segno').onclick = (e) => { const b = e.target.closest('button'); if (b) { stato.segno = Number(b.dataset.v); aggiorna(); } };
  $('modo').onclick = (e) => { const b = e.target.closest('button'); if (b) { stato.modo = b.dataset.v; aggiorna(); } };
  const tasto = (k) => {
    if (k === '⌫') stato.testo = stato.testo.slice(0, -1);
    else if (k === ',') { if (!stato.testo.includes(',')) stato.testo = (stato.testo || '0') + ','; }
    else if (stato.testo.length < 8 && !/,\d{3}$/.test(stato.testo)) stato.testo = stato.testo === '0' ? k : stato.testo + k;
    aggiorna();
  };
  app.querySelector('.tastierino').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) tasto(b.dataset.k); };
  // tenendo premuto ⌫ si cancella tutto
  const canc = app.querySelector('[data-k="⌫"]');
  let lungo;
  canc.onpointerdown = () => { lungo = setTimeout(() => { stato.testo = ''; aggiorna(); }, 600); };
  canc.onpointerup = canc.onpointerleave = () => clearTimeout(lungo);
  // tastiera fisica, se collegata
  onkeydown = (e) => {
    if (!location.hash.startsWith('#/quantita/') || document.querySelector('.velo')) return;
    if (/^[0-9]$/.test(e.key)) tasto(e.key);
    else if (e.key === ',' || e.key === '.') tasto(',');
    else if (e.key === 'Backspace') tasto('⌫');
    else if (e.key === 'Enter' && !$('ok').disabled) $('ok').click();
  };
  $('ok').onclick = () => conferma(a, stato.modo, stato.segno * valore());
  aggiorna();
}

function conferma(a, modo, n) {
  const unita = modo === 'kg' ? 'kg' : (Math.abs(n) === 1 ? 'barra' : 'barre');
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML = `<div class="scheda" role="dialog" aria-modal="true" aria-labelledby="conf-t">
    <h2 id="conf-t">Confermi il movimento?</h2>
    <div class="movimento-grande ${n > 0 ? 'carico' : 'scarico'}">${n > 0 ? '+' : '−'} ${fmt(Math.abs(n))} ${unita}</div>
    <dl class="riepilogo"><dt>Articolo</dt><dd>${esc(nomeArticolo(a))}</dd><dt>Movimento</dt><dd>${n > 0 ? 'Carico' : 'Prelievo'}</dd></dl>
    <div class="azioni"><button class="grande secondario" id="annulla">Annulla</button><button class="grande" id="si">Conferma</button></div></div>`;
  document.body.append(velo);
  const chiudi = () => velo.remove();
  velo.onclick = (e) => { if (e.target === velo) chiudi(); };
  velo.querySelector('#annulla').onclick = chiudi;
  const si = velo.querySelector('#si');
  si.onclick = async () => {
    si.disabled = true;
    try {
      const dopo = await api('/api/movimenti', { method: 'POST', body: { articolo_id: a.id, modo, quantita: n } });
      chiudi();
      esito(a, n, unita, dopo);
    } catch (e) { si.disabled = false; errore(e.message); }
  };
}

function esito(a, n, unita, dopo) {
  barra({ percorso: [] });
  render(`<div class="esito" id="esito"><div class="spunta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <h1>${n > 0 ? 'Carico' : 'Prelievo'} registrato</h1>
    <p>${esc(nomeArticolo(a))}: ${n > 0 ? '+' : '−'}${fmt(Math.abs(n))} ${unita}</p>
    <p>Ora a magazzino: <strong>${fmt(dopo?.barre)} barre</strong></p>
    <p style="margin-top:12px">Tocca lo schermo per continuare</p></div>`);
  const via = () => { clearTimeout(t); if ($('esito')) location.hash = '#/'; };
  const t = setTimeout(via, 4000);
  $('esito').onclick = via;
}

// --- amministrazione ---------------------------------------------------------
async function admin() {
  barra({ indietro: '#/', percorso: ['Amministrazione'] });
  if (!app.querySelector('#righe')) render('');
  const [righe, imp] = await Promise.all([api('/api/admin/magazzino', { admin: true }), api('/api/impostazioni')]);
  render(`${back('#/')}<h1>Amministrazione magazzino</h1>
    <div class="row"><label>Lunghezza barra (m)<input id="lung" value="${fmt(imp.lunghezza_barra_m)}"></label>
      <button id="salva-lung">Salva lunghezza</button><button id="nuovo" class="primary">+ Nuovo articolo</button></div>
    <div class="row"><button id="exp-excel">Esporta CSV (Excel)</button><button id="exp-csv">Esporta CSV (standard)</button></div>
    <input id="cerca" placeholder="Ricerca materiale" style="margin-bottom:12px">
    <div class="scroll"><table><thead><tr><th>Materiale</th><th>Forma</th><th>Misura</th><th>Spess.</th><th>Barre</th><th>Kg</th><th>Peso kg/m</th><th>Note</th><th></th></tr></thead>
    <tbody id="righe"></tbody></table></div>`);
  const tbody = document.getElementById('righe');
  const disegna = (filtro = '') => {
    const f = filtro.toLowerCase();
    tbody.innerHTML = righe.filter((r) => `${r.materiale} ${r.forma} ${r.misura} ${r.note ?? ''}`.toLowerCase().includes(f)).map((r) =>
      `<tr><td>${esc(r.materiale)}</td><td>${esc(r.forma)}</td><td>${fmt(r.misura)}</td><td>${fmt(r.spessore)}</td><td>${fmt(r.barre)}</td>
      <td>${fmt(r.quantita)}</td><td>${fmt(r.peso)}</td><td>${esc(r.note)}</td>
      <td style="white-space:nowrap"><button data-e="${r.id}">Modifica</button> <button class="danger" data-d="${r.id}">Elimina</button></td></tr>`).join('');
  };
  disegna();
  document.getElementById('cerca').oninput = (e) => disegna(e.target.value);
  document.getElementById('salva-lung').onclick = async () => {
    try { await api('/api/impostazioni', { method: 'PUT', admin: true, body: { lunghezza_barra_m: document.getElementById('lung').value } }); admin(); }
    catch (e) { avviso(e.message); }
  };
  const esporta = (formato) => async () => {
    try {
      const res = await fetch(`/api/admin/export.csv?formato=${formato}`, { headers: { 'x-admin-password': password } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).err ?? `Errore ${res.status}`);
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(await res.blob()),
        download: /filename="?([^";]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'magazzino.csv',
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { avviso(e.message); }
  };
  document.getElementById('exp-excel').onclick = esporta('excel');
  document.getElementById('exp-csv').onclick = esporta('standard');
  document.getElementById('nuovo').onclick = () => formArticolo(null);
  tbody.onclick = async (e) => {
    const id = Number(e.target.dataset.e ?? e.target.dataset.d);
    if (!id) return;
    const r = righe.find((x) => x.id === id);
    if (e.target.dataset.e) return formArticolo(r);
    if (await chiedi(`Eliminare ${r.materiale} ${r.forma} ${fmt(r.misura)}?`, { conferma: true })) {
      try { await api(`/api/admin/magazzino/${id}`, { method: 'DELETE', admin: true }); admin(); } catch (err) { avviso(err.message); }
    }
  };
}

function formArticolo(r) {
  const campo = (nome, label, val = '', tipo = 'input') =>
    `<label>${label}<${tipo} name="${nome}" ${tipo === 'input' ? `value="${esc(val)}"` : ''}>${tipo === 'textarea' ? esc(val) : ''}</${tipo}></label>`;
  dialog.innerHTML = `<form method="dialog"><h2>${r ? 'Modifica articolo' : 'Nuovo articolo'}</h2><p class="err" id="derr"></p>
    ${campo('materiale', 'Materiale', r?.materiale)}${campo('forma', 'Forma', r?.forma)}${campo('misura', 'Misura', fmt(r?.misura))}
    ${campo('spessore', 'Spessore', fmt(r?.spessore))}${campo('peso', 'Peso (kg/m)', fmt(r?.peso))}
    ${r ? '' : `${campo('quantita', 'Quantità iniziale')}<label>Unità<select name="modo"><option value="barre">Barre</option><option value="kg">kg</option></select></label>`}
    ${campo('note', 'Note', r?.note, 'textarea')}
    <div class="row"><button value="cancel">Annulla</button><button class="primary" value="ok">Salva</button></div></form>`;
  dialog.onclose = null;
  dialog.showModal();
  dialog.querySelector('form').onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api(r ? `/api/admin/magazzino/${r.id}` : '/api/admin/magazzino', { method: r ? 'PUT' : 'POST', body, admin: true });
      dialog.close(); admin();
    } catch (err) { document.getElementById('derr').textContent = err.message; }
  };
}
