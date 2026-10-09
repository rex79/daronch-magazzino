const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => (n == null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','));
const enc = encodeURIComponent;
let password = sessionStorage.getItem('adminPassword') ?? '';

async function api(url, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (admin) headers['x-admin-password'] = password;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && admin) {
    password = await chiedi('Password amministratore', { password: true });
    sessionStorage.setItem('adminPassword', password);
    if (password) return api(url, { method, body, admin });
  }
  if (!res.ok) throw new Error(json.err ?? `Errore ${res.status}`);
  return json.data;
}

// finestre in pagina al posto di prompt/confirm/alert (non disponibili ovunque)
function chiedi(testo, { password: pw = false, conferma = false } = {}) {
  return new Promise((resolve) => {
    dialog.innerHTML = `<form method="dialog"><h2>${esc(testo)}</h2>${conferma ? '' : `<input name="v" type="${pw ? 'password' : 'text'}" autofocus>`}
      <div class="row" style="margin-top:12px"><button value="cancel">Annulla</button><button class="primary" value="ok">OK</button></div></form>`;
    dialog.onclose = () => resolve(conferma ? dialog.returnValue === 'ok' : dialog.returnValue === 'ok' ? dialog.querySelector('input').value : '');
    dialog.showModal();
  });
}
const avviso = (testo) => chiedi(testo, { conferma: true });

const back = (href) => `<a class="back" href="${href}">← Torna indietro</a>`;
const render = (html) => { app.innerHTML = html; };

// tastierino: lega un display e i tasti, restituisce { valore() }
function tastierino(extra = '') {
  const tasti = ['1','2','3','4','5','6','7','8','9',',','0','⌫'];
  return `<div class="keypad">${extra}${tasti.map((t) => `<button data-k="${t}">${t}</button>`).join('')}</div>`;
}
function leggiTasti(display, { permettiSegno = false } = {}) {
  app.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k;
    display.value = k === '⌫' ? display.value.slice(0, -1) : display.value + k;
  }));
  if (permettiSegno) app.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    display.value = b.dataset.s + display.value.replace(/^[+-]/, '');
  }));
}

const rotte = [
  [/^\/$/, home],
  [/^\/forma\/([^/]+)$/, forma],
  [/^\/spessore\/([^/]+)\/([^/]+)$/, spessore],
  [/^\/misura\/([^/]+)\/([^/]+)\/([^/]+)$/, misura],
  [/^\/quantita\/(\d+)$/, quantita],
  [/^\/admin$/, admin],
];

async function route() {
  const path = location.hash.slice(1) || '/';
  for (const [re, fn] of rotte) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1).map(decodeURIComponent)); }
      catch (e) { render(`${back('#/')}<p class="err">${esc(e.message)}</p>`); }
      return;
    }
  }
  location.hash = '#/';
}
addEventListener('hashchange', route);
route();

async function home() {
  const materiali = await api('/api/materiali');
  render(`<h1>Scegli il materiale</h1><div class="grid">${materiali.map((m) => `<a class="tile" href="#/forma/${enc(m.nome)}">${esc(m.nome)}</a>`).join('')}</div>`);
}

async function forma(materiale) {
  const forme = await api(`/api/forme?materiale=${enc(materiale)}`);
  render(`${back('#/')}<h1>${esc(materiale)}: scegli la forma</h1><div class="grid">${forme.map((f) =>
    `<a class="tile" href="#/${f.forma === 'TUBO' ? 'spessore' : 'misura'}/${enc(materiale)}/${enc(f.forma)}${f.forma === 'TUBO' ? '' : '/0'}">${esc(f.forma)}</a>`).join('')}</div>`);
}

function inputNumerico({ titolo, indietro, conferma, suggerimenti = '' }) {
  render(`${back(indietro)}<h1>${titolo}</h1><p class="err" id="err"></p>
    <input class="display" id="val" inputmode="none" autocomplete="off">${suggerimenti}${tastierino()}
    <button class="primary" id="ok">Conferma</button>`);
  const val = document.getElementById('val');
  leggiTasti(val);
  document.getElementById('ok').addEventListener('click', async () => {
    if (!val.value) return (document.getElementById('err').textContent = 'Inserire un valore valido');
    try { await conferma(val.value); } catch (e) { document.getElementById('err').textContent = e.message; }
  });
}

function spessore(materiale, forma) {
  inputNumerico({
    titolo: `Spessore della barra ${esc(materiale)} ${esc(forma)}`, indietro: `#/forma/${enc(materiale)}`,
    conferma: async (v) => {
      const misure = await api(`/api/misure?materiale=${enc(materiale)}&forma=${enc(forma)}`);
      const n = Number(v.replace(',', '.'));
      if (!misure.some((m) => m.spessore === n)) throw new Error('Spessore non riconosciuto!');
      location.hash = `#/misura/${enc(materiale)}/${enc(forma)}/${enc(v)}`;
    },
  });
}

async function misura(materiale, forma, sp) {
  const elenco = await api(`/api/misure?materiale=${enc(materiale)}&forma=${enc(forma)}`);
  const sNum = Number(sp.replace(',', '.')) || 0;
  const filtrate = elenco.filter((m) => (m.spessore ?? 0) === sNum);
  inputNumerico({
    titolo: `Misura della barra ${esc(materiale)} ${esc(forma)}${sNum ? ` sp. ${esc(sp)}` : ''}`,
    indietro: sNum ? `#/spessore/${enc(materiale)}/${enc(forma)}` : `#/forma/${enc(materiale)}`,
    suggerimenti: `<div class="row">${filtrate.map((m) => `<button class="small" data-m="${m.misura}">${fmt(m.misura)}</button>`).join('')}</div>`,
    conferma: async (v) => {
      const a = await api(`/api/articolo?materiale=${enc(materiale)}&forma=${enc(forma)}&misura=${enc(v)}&spessore=${enc(sNum)}`)
        .catch(() => { throw new Error('Misura non riconosciuta!'); });
      location.hash = `#/quantita/${a.id}`;
    },
  });
  app.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById('val').value = fmt(Number(b.dataset.m));
  }));
}

async function quantita(id) {
  const a = await api(`/api/articoli/${id}`);
  let modo = 'barre';
  render(`${back(`#/forma/${enc(a.materiale)}`)}<h1>Quantità: ${esc(a.materiale)} ${esc(a.forma)} ${fmt(a.misura)}${a.spessore ? ` sp. ${fmt(a.spessore)}` : ''}</h1>
    <div class="info">Barre a magazzino: <strong>${fmt(a.barre)}</strong> · ${fmt(a.quantita)} kg${a.note ? `<br>${esc(a.note)}` : ''}</div>
    <p class="err" id="err"></p>
    <input class="display" id="val" value="+" inputmode="none" autocomplete="off">
    <div class="row"><button data-s="-">− Scarico</button><button data-s="+">+ Carico</button></div>
    <div class="row"><button id="m-barre" class="selected">BARRE</button><button id="m-kg">KG</button></div>
    ${tastierino()}<button class="primary" id="ok">Conferma quantità</button>`);
  const val = document.getElementById('val');
  leggiTasti(val, { permettiSegno: true });
  const setModo = (m) => {
    modo = m;
    document.getElementById('m-barre').classList.toggle('selected', m === 'barre');
    document.getElementById('m-kg').classList.toggle('selected', m === 'kg');
  };
  document.getElementById('m-barre').onclick = () => setModo('barre');
  document.getElementById('m-kg').onclick = () => setModo('kg');
  document.getElementById('ok').onclick = () => {
    const n = Number(val.value.replace(',', '.'));
    if (!val.value || !Number.isFinite(n) || n === 0) return (document.getElementById('err').textContent = 'Inserire una quantità valida');
    riepilogo(a, modo, n);
  };
}

function riepilogo(a, modo, n) {
  render(`${back(`#/quantita/${a.id}`)}<h1>Riepilogo inserimento</h1><p class="err" id="err"></p>
    <table><tr><th>Materiale</th><td>${esc(a.materiale)}</td></tr><tr><th>Forma</th><td>${esc(a.forma)}</td></tr>
    <tr><th>Misura</th><td>${fmt(a.misura)}</td></tr>${a.spessore ? `<tr><th>Spessore</th><td>${fmt(a.spessore)}</td></tr>` : ''}
    <tr><th>Movimento</th><td>${n > 0 ? '+' : ''}${fmt(n)} ${modo === 'kg' ? 'kg' : 'barre'}</td></tr></table>
    <button class="primary" id="ok" style="margin-top:12px;width:100%">Confermi l'inserimento?</button>`);
  document.getElementById('ok').onclick = async () => {
    try {
      await api('/api/movimenti', { method: 'POST', body: { articolo_id: a.id, modo, quantita: n } });
      location.hash = '#/';
    } catch (e) { document.getElementById('err').textContent = e.message; }
  };
}

// --- amministrazione ---------------------------------------------------------
async function admin() {
  const [righe, imp] = await Promise.all([api('/api/admin/magazzino', { admin: true }), api('/api/impostazioni')]);
  render(`${back('#/')}<h1>Amministrazione magazzino</h1>
    <div class="row"><label>Lunghezza barra (m)<input id="lung" value="${fmt(imp.lunghezza_barra_m)}"></label>
      <button id="salva-lung">Salva lunghezza</button><button id="nuovo" class="primary">+ Nuovo articolo</button></div>
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
