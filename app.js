// ═══════════════════════════════════════════════════════════════════
// LAROSCO TECHNICS — App principale (v2 — facture + modal)
// ═══════════════════════════════════════════════════════════════════

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  prestations: [],
  editingDevisId: null,
  editingFactureId: null,
  currentDevis: { grille: 'B', lignes: [], pieces: 0, remise_pct: 0 },
  currentFacture: { grille: 'B', lignes: [], pieces: 0, remise_pct: 0, source_devis_id: null }
};

// ═══════════ NAVIGATION ═══════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-' + name);
  if (screen) screen.classList.add('active');
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const screenBtn = e.target.closest('[data-screen]');
  if (screenBtn) {
    const name = screenBtn.dataset.screen;
    if (name === 'new-devis') resetDevisForm();
    if (name === 'new-facture') resetFactureForm();
    showScreen(name);
    if (name === 'tarifs') renderTarifs();
    if (name === 'liste-devis') loadDevisList();
    if (name === 'liste-factures') loadFacturesList();
    if (name === 'clients') loadClientsList();
  }
  const backBtn = e.target.closest('[data-back]');
  if (backBtn) {
    showScreen(backBtn.dataset.back);
    if (backBtn.dataset.back === 'home') loadKPIs();
  }
});

// ═══════════ INIT ═══════════
async function init() {
  showScreen('home');
  await loadPrestations();
  await loadKPIs();
}
window.addEventListener('load', init);

// ═══════════ DATA ═══════════
async function loadPrestations() {
  const { data, error } = await sb.from('prestations').select('*').order('ref');
  if (error) { toast('Erreur chargement tarifs', 'error'); return; }
  state.prestations = data || [];
}

async function loadKPIs() {
  const start = new Date();
  start.setDate(1); start.setHours(0,0,0,0);
  const startISO = start.toISOString().split('T')[0];

  const { data: factures } = await sb.from('factures').select('total_ht, statut_paiement')
    .gte('date_emission', startISO);

  const ca = (factures || []).reduce((s, f) => s + (parseFloat(f.total_ht) || 0), 0);
  const impayees = (factures || []).filter(f => f.statut_paiement !== 'paye').length;

  const { count: nbDevis } = await sb.from('devis').select('*', { count: 'exact', head: true })
    .eq('statut', 'envoye');
  const { count: nbClients } = await sb.from('clients').select('*', { count: 'exact', head: true });

  document.getElementById('kpi-ca').textContent = formatEUR(ca);
  document.getElementById('kpi-devis').textContent = nbDevis || 0;
  document.getElementById('kpi-impaye').textContent = impayees;
  document.getElementById('kpi-clients').textContent = nbClients || 0;
}

// ═══════════ DEVIS — FORM ═══════════
function resetDevisForm() {
  state.currentDevis = { grille: 'B', lignes: [], pieces: 0, remise_pct: 0 };
  state.editingDevisId = null;
  document.getElementById('devis-title').textContent = 'Nouveau devis';
  document.querySelectorAll('#screen-new-devis input').forEach(i => {
    if (i.type === 'number') i.value = (i.id === 'd-remise' || i.id === 'd-pieces') ? 0 : '';
    else i.value = '';
  });
  document.querySelectorAll('#screen-new-devis .grille-btn').forEach(b => b.classList.toggle('active', b.dataset.grille === 'B'));
  document.querySelectorAll('#screen-new-devis .rem-btn').forEach(b => b.classList.toggle('active', b.dataset.rem === '0'));
  document.getElementById('prestations-list').innerHTML = '';
  addPrestationRow('d');
  updateTotals('d');
}

// Grille devis
document.querySelectorAll('#screen-new-devis .grille-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#screen-new-devis .grille-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentDevis.grille = btn.dataset.grille;
    document.querySelectorAll('#prestations-list .prestation-row').forEach(r => refreshPrestationRow(r, 'd'));
    updateTotals('d');
  });
});

// Remise devis
document.querySelectorAll('#screen-new-devis .rem-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#screen-new-devis .rem-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('d-remise').value = btn.dataset.rem;
    state.currentDevis.remise_pct = parseInt(btn.dataset.rem);
    updateTotals('d');
  });
});
document.getElementById('d-remise').addEventListener('input', e => {
  state.currentDevis.remise_pct = parseFloat(e.target.value) || 0;
  document.querySelectorAll('#screen-new-devis .rem-btn').forEach(b => b.classList.remove('active'));
  updateTotals('d');
});
document.getElementById('d-pieces').addEventListener('input', e => {
  state.currentDevis.pieces = parseFloat(e.target.value) || 0;
  updateTotals('d');
});

document.getElementById('btn-add-prestation').addEventListener('click', () => addPrestationRow('d'));

// ═══════════ FACTURE — FORM ═══════════
function resetFactureForm(prefillFromDevis = null) {
  state.currentFacture = { grille: 'B', lignes: [], pieces: 0, remise_pct: 0, source_devis_id: null };
  state.editingFactureId = null;
  document.getElementById('facture-title').textContent = 'Nouvelle facture';

  document.querySelectorAll('#screen-new-facture input').forEach(i => {
    if (i.type === 'number') i.value = (i.id === 'f-remise' || i.id === 'f-pieces') ? 0 : '';
    else if (i.type === 'date') i.value = new Date().toISOString().split('T')[0];
    else i.value = '';
  });
  document.getElementById('f-reglement').value = 'Espèces';
  document.querySelectorAll('#screen-new-facture .grille-btn').forEach(b => b.classList.toggle('active', b.dataset.grille === 'B'));
  document.querySelectorAll('#screen-new-facture .rem-btn').forEach(b => b.classList.toggle('active', b.dataset.rem === '0'));
  document.getElementById('prestations-list-f').innerHTML = '';
  document.getElementById('facture-from-devis-banner').style.display = 'none';

  // Échéance par défaut : aujourd'hui + 30 jours
  const ech = new Date();
  ech.setDate(ech.getDate() + 30);
  document.getElementById('f-echeance').value = ech.toISOString().split('T')[0];

  if (prefillFromDevis) {
    prefillFactureFromDevis(prefillFromDevis);
  } else {
    addPrestationRow('f');
  }
  updateTotals('f');
}

async function prefillFactureFromDevis(devis) {
  state.currentFacture.source_devis_id = devis.id;
  state.currentFacture.grille = devis.grille;
  state.currentFacture.pieces = parseFloat(devis.pieces) || 0;
  state.currentFacture.remise_pct = parseFloat(devis.remise_pct) || 0;

  // Banner
  document.getElementById('facture-from-devis-banner').style.display = 'flex';
  document.getElementById('facture-source-devis').textContent = devis.numero;

  // Charger client
  if (devis.client_id) {
    const { data: cl } = await sb.from('clients').select('*').eq('id', devis.client_id).maybeSingle();
    if (cl) {
      document.getElementById('f-client-nom').value = cl.nom || '';
      document.getElementById('f-client-tel').value = cl.telephone || '';
      document.getElementById('f-client-commune').value = cl.commune || '';
      document.getElementById('f-client-adresse').value = cl.adresse || '';
    }
  }

  // Véhicule (depuis colonnes du devis)
  document.getElementById('f-vehicule').value = devis.vehicule_nom || '';
  document.getElementById('f-immat').value = devis.vehicule_immat || '';
  document.getElementById('f-km').value = devis.vehicule_km || '';

  // Pieces / remise
  document.getElementById('f-pieces').value = state.currentFacture.pieces;
  document.getElementById('f-remise').value = state.currentFacture.remise_pct;

  // Marquer le bon bouton remise rapide actif
  document.querySelectorAll('#screen-new-facture .rem-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.rem) === state.currentFacture.remise_pct);
  });

  // Grille
  document.querySelectorAll('#screen-new-facture .grille-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.grille === devis.grille));

  // Vider les anciennes lignes puis ajouter celles du devis
  document.getElementById('prestations-list-f').innerHTML = '';
  for (const lig of (devis.lignes || [])) {
    addPrestationRow('f', lig);
  }

  // Date facture = aujourd'hui, échéance = +30j
  const today = new Date().toISOString().split('T')[0];
  const ech = new Date();
  ech.setDate(ech.getDate() + 30);
  document.getElementById('f-date').value = today;
  document.getElementById('f-echeance').value = ech.toISOString().split('T')[0];

  updateTotals('f');
  toast('Facture pré-remplie depuis ' + devis.numero, 'success');
}

document.querySelectorAll('#screen-new-facture .grille-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#screen-new-facture .grille-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFacture.grille = btn.dataset.grille;
    document.querySelectorAll('#prestations-list-f .prestation-row').forEach(r => refreshPrestationRow(r, 'f'));
    updateTotals('f');
  });
});
document.querySelectorAll('#screen-new-facture .rem-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#screen-new-facture .rem-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('f-remise').value = btn.dataset.rem;
    state.currentFacture.remise_pct = parseInt(btn.dataset.rem);
    updateTotals('f');
  });
});
document.getElementById('f-remise').addEventListener('input', e => {
  state.currentFacture.remise_pct = parseFloat(e.target.value) || 0;
  document.querySelectorAll('#screen-new-facture .rem-btn').forEach(b => b.classList.remove('active'));
  updateTotals('f');
});
document.getElementById('f-pieces').addEventListener('input', e => {
  state.currentFacture.pieces = parseFloat(e.target.value) || 0;
  updateTotals('f');
});
document.getElementById('btn-add-prestation-f').addEventListener('click', () => addPrestationRow('f'));
document.getElementById('btn-cancel-facture').addEventListener('click', () => showScreen('home'));

// ═══════════ PRESTATION ROW (générique d/f) ═══════════
function addPrestationRow(prefix, prefillData = null) {
  const list = document.getElementById(prefix === 'd' ? 'prestations-list' : 'prestations-list-f');
  const row = document.createElement('div');
  row.className = 'prestation-row';
  row.innerHTML = `
    <div class="prest-search-wrap">
      <input type="search" class="prest-search" placeholder="Rechercher référence ou désignation..." autocomplete="off">
      <div class="prest-suggestions"></div>
    </div>
    <div class="prest-meta">
      <div class="prest-ref-label" style="font-size:11px;color:var(--text-3)"></div>
      <input type="number" class="prest-qty" value="1" min="0" step="0.5">
      <div class="prest-total">0,00 €</div>
    </div>
    <button type="button" class="prest-remove">Supprimer</button>
  `;
  list.appendChild(row);

  const search = row.querySelector('.prest-search');
  const sugg = row.querySelector('.prest-suggestions');
  const qty = row.querySelector('.prest-qty');
  const stateRef = prefix === 'd' ? state.currentDevis : state.currentFacture;

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    if (q.length < 2) { sugg.classList.remove('open'); return; }
    const matches = state.prestations.filter(p =>
      p.ref.toLowerCase().includes(q) ||
      (p.designation || '').toLowerCase().includes(q)
    ).slice(0, 8);
    sugg.innerHTML = matches.map(p => {
      const prix = getPrice(p, stateRef.grille);
      return `<div class="suggestion-item" data-ref="${p.ref}">
        <span class="sugg-ref">${p.ref}</span>
        <span class="sugg-desig">${p.designation}</span>
        <span class="sugg-prix">${formatEUR(prix)} (grille ${getEffectiveGrille(p, stateRef.grille)})</span>
      </div>`;
    }).join('') || '<div style="padding:14px;text-align:center;color:var(--text-3)">Aucun résultat</div>';
    sugg.classList.add('open');
  });

  search.addEventListener('blur', () => setTimeout(() => sugg.classList.remove('open'), 200));

  sugg.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const p = state.prestations.find(x => x.ref === item.dataset.ref);
    if (!p) return;
    row.dataset.ref = p.ref;
    search.value = p.designation;
    row.querySelector('.prest-ref-label').textContent = p.ref;
    sugg.classList.remove('open');
    refreshPrestationRow(row, prefix);
    updateTotals(prefix);
  });

  qty.addEventListener('input', () => { refreshPrestationRow(row, prefix); updateTotals(prefix); });
  row.querySelector('.prest-remove').addEventListener('click', () => { row.remove(); updateTotals(prefix); });

  // Pré-remplir si donnée fournie
  if (prefillData) {
    const p = state.prestations.find(x => x.ref === prefillData.ref);
    if (p) {
      row.dataset.ref = p.ref;
      search.value = p.designation;
      row.querySelector('.prest-ref-label').textContent = p.ref;
      qty.value = prefillData.qte || 1;
      refreshPrestationRow(row, prefix);
    }
  }
}

function refreshPrestationRow(row, prefix) {
  const ref = row.dataset.ref;
  if (!ref) return;
  const p = state.prestations.find(x => x.ref === ref);
  if (!p) return;
  const stateRef = prefix === 'd' ? state.currentDevis : state.currentFacture;
  const prix = getPrice(p, stateRef.grille);
  const qty = parseFloat(row.querySelector('.prest-qty').value) || 0;
  const total = prix * qty;
  row.querySelector('.prest-total').textContent = formatEUR(total);
  row.dataset.pu = prix;
  row.dataset.total = total;
  row.dataset.designation = p.designation;
}

function getEffectiveGrille(presta, selected) {
  if (presta.ref.startsWith('BMW')) return 'D';
  return selected;
}
function getPrice(presta, grille) {
  const g = getEffectiveGrille(presta, grille);
  if (g === 'B') return parseFloat(presta.prix_b) || 0;
  if (g === 'C') return parseFloat(presta.prix_c) || 0;
  if (g === 'D') return parseFloat(presta.prix_d) || 0;
  return 0;
}

function updateTotals(prefix) {
  const listSel = prefix === 'd' ? '#prestations-list .prestation-row' : '#prestations-list-f .prestation-row';
  let totalMo = 0;
  document.querySelectorAll(listSel).forEach(row => { totalMo += parseFloat(row.dataset.total) || 0; });
  const stateRef = prefix === 'd' ? state.currentDevis : state.currentFacture;
  const pieces = stateRef.pieces;
  const remisePct = stateRef.remise_pct;

  const sousHt = totalMo + pieces;
  const tva = sousHt * 0.085;
  const ttcAvant = sousHt + tva;
  const remiseMontant = remisePct > 0 ? ttcAvant * remisePct / 100 : 0;
  const ttc = ttcAvant - remiseMontant;

  const p = prefix === 'd' ? '' : 'f';
  const id = (s) => p + 't-' + s;

  document.getElementById(id('mo')).textContent = formatEUR(totalMo);
  document.getElementById(id('pieces')).textContent = formatEUR(pieces);
  document.getElementById(id('ht')).textContent = formatEUR(sousHt);
  document.getElementById(id('tva')).textContent = formatEUR(tva);
  document.getElementById(id('ttc')).textContent = formatEUR(ttc);

  const remiseRow = document.getElementById(prefix === 'd' ? 'row-remise' : 'row-remise-f');
  if (remisePct > 0) {
    remiseRow.style.display = 'flex';
    document.getElementById(id('remise-pct')).textContent = remisePct + '%';
    document.getElementById(id('remise')).textContent = '-' + formatEUR(remiseMontant);
  } else {
    remiseRow.style.display = 'none';
  }
}

// ═══════════ GÉNÉRATION PDF DEVIS ═══════════
document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
  await generatePDF('devis');
});
document.getElementById('btn-generate-facture-pdf').addEventListener('click', async () => {
  await generatePDF('facture');
});

async function generatePDF(type) {
  const isFacture = type === 'facture';
  const prefix = isFacture ? 'f' : 'd';
  const stateRef = isFacture ? state.currentFacture : state.currentDevis;

  // Récupérer numéro
  const { data: numData, error: numErr } = await sb.rpc('prochain_numero', { type_doc: type });
  if (numErr) { toast('Erreur numéro', 'error'); return; }
  const numero = numData;

  // Lignes
  const lignes = [];
  const listSel = isFacture ? '#prestations-list-f .prestation-row' : '#prestations-list .prestation-row';
  document.querySelectorAll(listSel).forEach(row => {
    if (!row.dataset.ref) return;
    lignes.push({
      ref: row.dataset.ref,
      designation: row.dataset.designation,
      qte: parseFloat(row.querySelector('.prest-qty').value) || 0,
      pu: parseFloat(row.dataset.pu) || 0,
      montant: parseFloat(row.dataset.total) || 0
    });
  });
  if (lignes.length === 0) { toast('Ajoutez au moins une prestation', 'error'); return; }

  // Données client/véhicule
  const client = {
    nom: document.getElementById(prefix + '-client-nom').value || '',
    tel: document.getElementById(prefix + '-client-tel').value || '',
    commune: document.getElementById(prefix + '-client-commune').value || '',
    adresse: document.getElementById(prefix + '-client-adresse').value || ''
  };
  const vehicule = {
    nom: document.getElementById(prefix + '-vehicule').value || '',
    immat: document.getElementById(prefix + '-immat').value || '',
    km: document.getElementById(prefix + '-km').value || ''
  };

  let dateEmission = new Date().toISOString().split('T')[0];
  let dateEcheance = '';
  let modeReglement = '';
  let observations = '';
  if (isFacture) {
    dateEmission = document.getElementById('f-date').value || dateEmission;
    dateEcheance = document.getElementById('f-echeance').value || '';
    modeReglement = document.getElementById('f-reglement').value || '';
    observations = document.getElementById('f-observations').value || '';
  }

  const totalMo = lignes.reduce((s, l) => s + l.montant, 0);
  const pieces = stateRef.pieces;
  const sousHt = totalMo + pieces;
  const tva = sousHt * 0.085;
  const ttcAvant = sousHt + tva;
  const remisePct = stateRef.remise_pct;
  const remiseMontant = remisePct > 0 ? ttcAvant * remisePct / 100 : 0;
  const ttc = ttcAvant - remiseMontant;

  // PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;

  // HEADER NOIR
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, W, 35, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(20);
  doc.text('LAROSCOTECHNICS', M, 14);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(180, 180, 180);
  doc.text('Garage automobile · Case-Pilote · Martinique', M, 19);
  doc.text('Tel : 0696 28 11 05  |  laroscotechnics@gmail.com', M, 23);
  doc.setTextColor(232, 103, 10).setFont('helvetica', 'bold');
  doc.text('SIRET : 10128189700013  |  TVA 8,5% Art.296 CGI DOM', M, 28);

  // Bloc DEVIS / FACTURE à droite
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(22);
  doc.text(isFacture ? 'FACTURE' : 'DEVIS', W - M, 14, { align: 'right' });
  doc.setFontSize(10).setTextColor(232, 103, 10);
  doc.text(numero, W - M, 20, { align: 'right' });
  doc.setFontSize(8).setTextColor(180, 180, 180);
  doc.text('Date : ' + new Date(dateEmission).toLocaleDateString('fr-FR'), W - M, 25, { align: 'right' });
  doc.text('Grille : ' + stateRef.grille, W - M, 29, { align: 'right' });

  doc.setFillColor(192, 57, 43);
  doc.rect(0, 35, W, 2, 'F');

  let y = 45;

  // Bloc client/véhicule
  doc.setFillColor(17, 17, 17);
  doc.rect(M, y, (W - 2*M)/2 - 1, 7, 'F');
  doc.setFillColor(192, 57, 43);
  doc.rect(W/2 + 1, y, (W - 2*M)/2 - 1, 7, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(9);
  doc.text(isFacture ? 'FACTURÉ À' : 'DEVIS POUR', M + 3, y + 5);
  doc.text('VÉHICULE', W/2 + 4, y + 5);

  y += 7;
  const blocH = isFacture ? 28 : 22;
  doc.setFillColor(249, 249, 249);
  doc.rect(M, y, (W - 2*M)/2 - 1, blocH, 'F');
  doc.rect(W/2 + 1, y, (W - 2*M)/2 - 1, blocH, 'F');
  doc.setTextColor(17, 17, 17).setFont('helvetica', 'bold').setFontSize(10);
  doc.text(client.nom, M + 3, y + 5);
  doc.text(vehicule.nom, W/2 + 4, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  doc.text('Tél : ' + client.tel, M + 3, y + 11);
  doc.text('Immat : ' + vehicule.immat, W/2 + 4, y + 11);
  doc.text('Adresse : ' + client.adresse, M + 3, y + 16);
  doc.text('KM : ' + vehicule.km, W/2 + 4, y + 16);
  doc.text('Commune : ' + client.commune, M + 3, y + 21);
  if (isFacture) {
    doc.text('Échéance : ' + (dateEcheance ? new Date(dateEcheance).toLocaleDateString('fr-FR') : '—'), W/2 + 4, y + 16);
    doc.text('Règlement : ' + modeReglement, W/2 + 4, y + 21);
    doc.text('Observations : ' + observations, M + 3, y + 26);
  }

  y += blocH + 6;

  // Tableau prestations
  doc.autoTable({
    startY: y,
    head: [['Réf.', 'Désignation', 'Qté', 'PU HT', 'Montant HT']],
    body: lignes.map(l => [l.ref, l.designation, l.qte, formatEUR(l.pu), formatEUR(l.montant)]),
    headStyles: { fillColor: [17,17,17], textColor: [255,255,255], fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [244,246,247] },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', textColor: [26,58,92], cellWidth: 22 },
      1: { cellWidth: 80 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 30, fillColor: [235,245,251] }
    },
    margin: { left: M, right: M }
  });

  y = doc.lastAutoTable.finalY + 4;

  function totalRow(label, value, opts = {}) {
    const bgL = opts.bgL || [26, 58, 92];
    const bgV = opts.bgV || [235, 245, 251];
    const fgV = opts.fgV || [17, 17, 17];
    const h = opts.h || 7;
    doc.setFillColor(...bgL);
    doc.rect(M, y, W - 2*M - 30, h, 'F');
    doc.setFillColor(...bgV);
    doc.rect(W - M - 30, y, 30, h, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(9);
    doc.text(label, W - M - 32, y + h/2 + 1.5, { align: 'right' });
    doc.setTextColor(...fgV).setFont('helvetica', opts.bold ? 'bold' : 'normal').setFontSize(opts.size || 9);
    doc.text(value, W - M - 1.5, y + h/2 + 1.5, { align: 'right' });
    y += h;
  }

  totalRow('Total HT main d\'oeuvre', formatEUR(totalMo));
  totalRow('Pièces / Fournitures', formatEUR(pieces), { bgL: [68, 68, 68] });
  totalRow('Sous-total HT', formatEUR(sousHt), { bgL: [26, 58, 92], bold: true });
  totalRow('TVA 8,5% (Martinique)', formatEUR(tva), { bgL: [51, 51, 51] });

  const ttcLabel = remisePct > 0 ? 'TTC (avant remise)' : 'TOTAL TTC';
  doc.setFillColor(17, 17, 17);
  doc.rect(M, y, W - 2*M - 35, 10, 'F');
  doc.setFillColor(192, 57, 43);
  doc.rect(W - M - 35, y, 35, 10, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(12);
  doc.text(ttcLabel, W - M - 37, y + 7, { align: 'right' });
  doc.setFontSize(13);
  doc.text(formatEUR(ttcAvant), W - M - 2, y + 7, { align: 'right' });
  y += 12;

  if (remisePct > 0) {
    doc.setFillColor(125, 102, 8);
    doc.rect(M, y, W - 2*M - 30, 7, 'F');
    doc.setFillColor(254, 249, 231);
    doc.rect(W - M - 30, y, 30, 7, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(9);
    doc.text('REMISE ' + remisePct + '% APPLIQUÉE', W - M - 32, y + 5, { align: 'right' });
    doc.setTextColor(192, 57, 43);
    doc.text('-' + formatEUR(remiseMontant), W - M - 1.5, y + 5, { align: 'right' });
    y += 9;

    doc.setFillColor(125, 102, 8);
    doc.rect(M, y, W - 2*M - 35, 10, 'F');
    doc.setFillColor(39, 174, 96);
    doc.rect(W - M - 35, y, 35, 10, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(12);
    doc.text('TOTAL TTC APRÈS REMISE', W - M - 37, y + 7, { align: 'right' });
    doc.setFontSize(13);
    doc.text(formatEUR(ttc), W - M - 2, y + 7, { align: 'right' });
    y += 12;
  }

  y += 8;
  doc.setTextColor(120, 120, 120).setFont('helvetica', 'bold').setFontSize(8);
  doc.text('CONDITIONS', M, y); y += 4;
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  doc.text('Diagnostic obligatoire avant travaux — 50% déduit si réalisés.', M, y); y += 3.5;
  doc.text('Pièces fournies par le client (origine OE / équipementier / adaptable).', M, y); y += 3.5;
  doc.text('Garantie main d\'œuvre : 6 mois ou 10 000 km (premier atteint).', M, y); y += 3.5;
  doc.text('Paiement : espèces, chèque, virement bancaire, CB.', M, y); y += 3.5;
  if (!isFacture) {
    doc.text('Devis valable 30 jours.', M, y);
  } else if (dateEcheance) {
    doc.text('Échéance de paiement : ' + new Date(dateEcheance).toLocaleDateString('fr-FR'), M, y);
  }

  doc.setTextColor(150, 150, 150).setFontSize(7);
  doc.text(
    'LaroscoTechnics · Case-Pilote, Martinique · 0696 28 11 05 · laroscotechnics@gmail.com · SIRET 10128189700013 · TVA 8,5% Art. 296 CGI DOM',
    W/2, 287, { align: 'center' }
  );

  // Sauver dans Supabase
  let client_id = null;
  if (client.nom) {
    const { data: existing } = await sb.from('clients').select('id').ilike('nom', client.nom).maybeSingle();
    if (existing) {
      client_id = existing.id;
      await sb.from('clients').update({
        telephone: client.tel, adresse: client.adresse, commune: client.commune
      }).eq('id', client_id);
    } else {
      const { data: newCl } = await sb.from('clients').insert({
        nom: client.nom, telephone: client.tel, adresse: client.adresse, commune: client.commune
      }).select().single();
      if (newCl) client_id = newCl.id;
    }
  }

  if (isFacture) {
    if (state.editingFactureId) {
      const { error: errU } = await sb.from('factures').update({
        client_id, date_emission: dateEmission,
        date_echeance: dateEcheance || null,
        mode_reglement: modeReglement, observations,
        lignes, total_ht: sousHt, pieces,
        remise_pct: remisePct, remise_montant: remiseMontant,
        tva, total_ttc: ttc,
        vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
      }).eq('id', state.editingFactureId);
      if (errU) { console.error('Erreur update facture:', errU); toast('Erreur : ' + errU.message, 'error'); }
      state.editingFactureId = null;
    } else {
      const { error: errI } = await sb.from('factures').insert({
        numero, devis_id: state.currentFacture.source_devis_id, client_id,
        date_emission: dateEmission, date_echeance: dateEcheance || null,
        mode_reglement: modeReglement, observations,
        lignes, total_ht: sousHt, pieces,
        remise_pct: remisePct, remise_montant: remiseMontant,
        tva, total_ttc: ttc, statut_paiement: 'impaye',
        vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
      });
      if (errI) { console.error('Erreur insert facture:', errI); toast('Erreur : ' + errI.message, 'error'); }
    }
    // Si vient d'un devis, marquer celui-ci comme accepté
    if (state.currentFacture.source_devis_id) {
      await sb.from('devis').update({ statut: 'accepte' }).eq('id', state.currentFacture.source_devis_id);
    }
  } else {
    if (state.editingDevisId) {
      const { error: errUpd } = await sb.from('devis').update({
        client_id, date_emission: dateEmission,
        grille: state.currentDevis.grille, lignes,
        total_ht: sousHt, pieces, remise_pct: remisePct,
        remise_montant: remiseMontant, tva, total_ttc: ttc,
        vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
      }).eq('id', state.editingDevisId);
      if (errUpd) { console.error('Erreur update devis:', errUpd); toast('Erreur sauvegarde devis : ' + errUpd.message, 'error'); }
      state.editingDevisId = null;
    } else {
      const { error: errIns } = await sb.from('devis').insert({
        numero, client_id, date_emission: dateEmission,
        grille: state.currentDevis.grille, lignes,
        total_ht: sousHt, pieces, remise_pct: remisePct,
        remise_montant: remiseMontant, tva, total_ttc: ttc,
        statut: 'envoye',
        vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
      });
      if (errIns) { console.error('Erreur insert devis:', errIns); toast('Erreur enregistrement devis : ' + errIns.message, 'error'); }
    }
  }

  const safeName = (client.nom || 'client').replace(/[^a-z0-9]/gi, '_');
  const docTitle = isFacture ? 'Facture' : 'Devis';
  doc.save(`${docTitle}_${numero}_${safeName}_LaroscoTechnics.pdf`);

  toast(`${docTitle} ${numero} généré ✓`, 'success');
  setTimeout(() => { showScreen('home'); loadKPIs(); }, 1500);
}

// ═══════════ TARIFS ═══════════
function renderTarifs(filter = '') {
  const container = document.getElementById('tarifs-list-container');
  const q = filter.toLowerCase().trim();
  const filtered = q
    ? state.prestations.filter(p => p.ref.toLowerCase().includes(q) || (p.designation || '').toLowerCase().includes(q))
    : state.prestations;
  container.innerHTML = filtered.slice(0, 200).map(p => {
    const isBmw = p.ref.startsWith('BMW');
    return `<div class="tarif-item" data-tarif-id="${p.id}">
      <div class="tarif-info">
        <div class="tarif-ref ${isBmw ? 'bmw' : ''}">${p.ref}</div>
        <div class="tarif-desig">${p.designation}</div>
      </div>
      <div class="tarif-prix">
        ${isBmw
          ? `<div class="tarif-prix-row">D <strong>${formatEUR(p.prix_d)}</strong></div>`
          : `<div class="tarif-prix-row">B <strong>${formatEUR(p.prix_b)}</strong></div>
             <div class="tarif-prix-row">C <strong>${formatEUR(p.prix_c)}</strong></div>`}
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="text">Aucun résultat</div></div>';

  // Click sur un tarif = ouvrir édition
  container.querySelectorAll('.tarif-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.tarifId);
      const t = state.prestations.find(x => x.id === id);
      if (t) openTarifModal(t);
    });
  });
}
document.getElementById('tarifs-search').addEventListener('input', e => renderTarifs(e.target.value));

// ═══════════ MODAL TARIF (création / édition) ═══════════
let currentEditingTarif = null;

function openTarifModal(tarif = null) {
  currentEditingTarif = tarif;
  const isEdit = tarif !== null;

  document.getElementById('modal-tarif-title').textContent = isEdit ? 'Modifier tarif' : 'Nouveau tarif';
  document.getElementById('tarif-edit-actions').style.display = isEdit ? 'flex' : 'none';

  if (isEdit) {
    document.getElementById('tarif-marque').value = tarif.marque || 'Toutes Marques';
    document.getElementById('tarif-categorie').value = tarif.categorie || 'Entretien';
    document.getElementById('tarif-ref').value = tarif.ref;
    document.getElementById('tarif-ref').readOnly = true;
    document.getElementById('tarif-desig').value = tarif.designation || '';
    document.getElementById('tarif-prix-b').value = tarif.prix_b || '';
    document.getElementById('tarif-prix-c').value = tarif.prix_c || '';
    document.getElementById('tarif-prix-d').value = tarif.prix_d || '';
  } else {
    document.getElementById('tarif-marque').value = 'Toutes Marques';
    document.getElementById('tarif-categorie').value = 'Entretien';
    document.getElementById('tarif-ref').value = '';
    document.getElementById('tarif-ref').readOnly = false;
    document.getElementById('tarif-desig').value = '';
    document.getElementById('tarif-prix-b').value = '';
    document.getElementById('tarif-prix-c').value = '';
    document.getElementById('tarif-prix-d').value = '';
  }

  document.getElementById('modal-tarif').classList.add('show');
}

document.getElementById('btn-add-tarif').addEventListener('click', () => openTarifModal(null));
document.getElementById('modal-tarif-close').addEventListener('click', () => {
  document.getElementById('modal-tarif').classList.remove('show');
});
document.getElementById('btn-cancel-tarif').addEventListener('click', () => {
  document.getElementById('modal-tarif').classList.remove('show');
});
document.getElementById('modal-tarif').addEventListener('click', (e) => {
  if (e.target.id === 'modal-tarif') document.getElementById('modal-tarif').classList.remove('show');
});

// Auto-générer la référence quand catégorie change (si pas en édition)
function getCategoryPrefix(cat) {
  const map = {
    'Déplacement': 'DEP', 'Diagnostic': 'DIAG', 'Entretien': 'ENT',
    'Mécanique / Moteur': 'MEC', 'Transmission / Embrayage': 'TRA',
    'Freinage': 'FRN', 'Suspension': 'SUS', 'Climatisation': 'CLI',
    'Électrique': 'ELC', 'Vitrage / Carrosserie élec.': 'VIT',
    'Carrosserie / Optiques': 'CAR', 'Nettoyage auto': 'NET',
    'Entretien avancé': 'ENTA', 'Freinage avancé': 'FRNA',
    'Suspension avancée': 'SUSA', 'BMW Spécifique': 'SPE'
  };
  return map[cat] || 'AUT';
}

function generateNextRef(marque, categorie) {
  const marquePrefix = marque === 'BMW' ? 'BMW' : 'TM';
  const catPrefix = getCategoryPrefix(categorie);
  const pattern = `${marquePrefix}-${catPrefix}-`;
  let max = 0;
  state.prestations.forEach(p => {
    if (p.ref.startsWith(pattern)) {
      const num = parseInt(p.ref.split('-').pop()) || 0;
      if (num > max) max = num;
    }
  });
  return `${pattern}${String(max + 1).padStart(2, '0')}`;
}

// Sauvegarder tarif
document.getElementById('btn-save-tarif').addEventListener('click', async () => {
  const marque = document.getElementById('tarif-marque').value;
  const categorie = document.getElementById('tarif-categorie').value;
  let ref = document.getElementById('tarif-ref').value.trim().toUpperCase();
  const designation = document.getElementById('tarif-desig').value.trim();
  let prix_b = parseFloat(document.getElementById('tarif-prix-b').value) || null;
  let prix_c = parseFloat(document.getElementById('tarif-prix-c').value) || null;
  let prix_d = parseFloat(document.getElementById('tarif-prix-d').value) || null;

  if (!designation) { toast('Désignation obligatoire', 'error'); return; }

  // Auto-calculer prix_c si vide
  if (!prix_c && prix_b) {
    prix_c = Math.round(prix_b * 1.25 / 10) * 10;
  }

  // Validation
  if (marque === 'BMW' && !prix_d) { toast('Prix D obligatoire pour BMW', 'error'); return; }
  if (marque !== 'BMW' && !prix_b) { toast('Prix B obligatoire', 'error'); return; }

  // Génération auto de la ref si vide (mode création)
  if (!currentEditingTarif && !ref) {
    ref = generateNextRef(marque, categorie);
  }

  if (!ref) { toast('Référence obligatoire', 'error'); return; }

  // Vérifier doublon (sauf édition même ref)
  if (!currentEditingTarif || currentEditingTarif.ref !== ref) {
    if (state.prestations.find(p => p.ref === ref)) {
      toast('Cette référence existe déjà', 'error'); return;
    }
  }

  const data = { ref, marque, categorie, designation, prix_b, prix_c, prix_d };

  if (currentEditingTarif) {
    const { error } = await sb.from('prestations').update(data).eq('id', currentEditingTarif.id);
    if (error) { toast('Erreur : ' + error.message, 'error'); return; }
    toast('Tarif mis à jour ✓', 'success');
  } else {
    const { error } = await sb.from('prestations').insert(data);
    if (error) { toast('Erreur : ' + error.message, 'error'); return; }
    toast('Nouveau tarif ajouté ✓', 'success');
  }

  document.getElementById('modal-tarif').classList.remove('show');
  await loadPrestations();
  renderTarifs(document.getElementById('tarifs-search').value);
});

// Supprimer tarif
document.getElementById('btn-delete-tarif').addEventListener('click', async () => {
  if (!currentEditingTarif) return;
  if (!confirm(`Supprimer définitivement le tarif "${currentEditingTarif.ref} — ${currentEditingTarif.designation}" ?`)) return;
  const { error } = await sb.from('prestations').delete().eq('id', currentEditingTarif.id);
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast('Tarif supprimé ✓', 'success');
  document.getElementById('modal-tarif').classList.remove('show');
  await loadPrestations();
  renderTarifs(document.getElementById('tarifs-search').value);
});

// ═══════════ LISTES ═══════════
async function loadDevisList() {
  const c = document.getElementById('devis-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('devis').select('*, clients(nom)').order('created_at', { ascending: false }).limit(50);
  c.innerHTML = (data || []).map(d => {
    const statusClass = 'status-' + d.statut;
    const statusLabel = {brouillon:'Brouillon', envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé', expire:'Expiré'}[d.statut] || d.statut;
    return `<div class="doc-item" data-devis-id="${d.id}">
      <div>
        <div class="doc-num">${d.numero}</div>
        <div class="doc-client">${d.clients?.nom || '—'}</div>
        <div class="doc-date">${new Date(d.date_emission).toLocaleDateString('fr-FR')}</div>
        <span class="doc-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="doc-price">${formatEUR(d.total_ttc)}</div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="icon">📋</div><div class="text">Aucun devis pour le moment</div></div>';

  // Click → ouvrir modal détail
  c.querySelectorAll('.doc-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.devisId;
      const devis = (data || []).find(d => String(d.id) === id);
      if (devis) openDevisModal(devis);
    });
  });
}

async function loadFacturesList() {
  const c = document.getElementById('factures-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('factures').select('*, clients(nom)').order('created_at', { ascending: false }).limit(50);
  c.innerHTML = (data || []).map(f => {
    const statusClass = f.statut_paiement === 'paye' ? 'status-paye' : f.statut_paiement === 'partiel' ? 'status-attente' : 'status-impaye';
    const statusLabel = f.statut_paiement === 'paye' ? 'Payé' : f.statut_paiement === 'partiel' ? 'Partiel' : 'Impayé';
    return `<div class="doc-item" data-facture-id="${f.id}">
      <div>
        <div class="doc-num">${f.numero}</div>
        <div class="doc-client">${f.clients?.nom || '—'}</div>
        <div class="doc-date">${new Date(f.date_emission).toLocaleDateString('fr-FR')}</div>
        <span class="doc-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="doc-price">${formatEUR(f.total_ttc)}</div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="icon">🧾</div><div class="text">Aucune facture pour le moment</div></div>';

  // Click sur facture = ouvrir modal
  c.querySelectorAll('.doc-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.factureId);
      const f = (data || []).find(x => x.id === id);
      if (f && typeof openFactureModal === 'function') openFactureModal(f);
    });
  });
}

async function loadClientsList() {
  const c = document.getElementById('clients-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('clients').select('*').order('nom').limit(200);

  // Recherche
  const search = document.getElementById('clients-search');
  let allClients = data || [];

  function renderClients(filter = '') {
    const q = filter.toLowerCase().trim();
    const filtered = q
      ? allClients.filter(cl => (cl.nom || '').toLowerCase().includes(q) || (cl.telephone || '').includes(q) || (cl.commune || '').toLowerCase().includes(q))
      : allClients;
    c.innerHTML = filtered.map(cl => `
      <div class="doc-item" data-client-id="${cl.id}">
        <div style="flex:1">
          <div class="doc-num">${cl.nom}</div>
          <div class="doc-client">${cl.telephone || '—'} ${cl.commune ? '· ' + cl.commune : ''}</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    `).join('') || '<div class="empty-state"><div class="icon">👥</div><div class="text">Aucun client</div></div>';

    c.querySelectorAll('.doc-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.clientId);
        const cl = allClients.find(x => x.id === id);
        if (cl) openClientModal(cl);
      });
    });
  }

  renderClients();
  if (search) {
    search.value = '';
    search.oninput = (e) => renderClients(e.target.value);
  }
}

// ═══════════ MODAL CLIENT ═══════════
let currentModalClient = null;
let currentModalClientLastVehicle = null;

async function openClientModal(client) {
  currentModalClient = client;
  document.getElementById('modal-client-nom').textContent = client.nom;
  document.getElementById('modal-client-body').innerHTML = '<div class="empty-state">Chargement…</div>';
  document.getElementById('modal-client').classList.add('show');

  // Récupérer en parallèle : devis et factures du client
  const [devisRes, factRes] = await Promise.all([
    sb.from('devis').select('*').eq('client_id', client.id).order('date_emission', { ascending: false }),
    sb.from('factures').select('*').eq('client_id', client.id).order('date_emission', { ascending: false })
  ]);
  const devis = devisRes.data || [];
  const factures = factRes.data || [];

  // Statistiques
  const nbInterventions = factures.length;
  const caTotal = factures.reduce((s, f) => s + (parseFloat(f.total_ttc) || 0), 0);
  const panierMoyen = nbInterventions > 0 ? caTotal / nbInterventions : 0;
  const lastVisit = factures[0]?.date_emission || devis[0]?.date_emission;

  // Véhicules uniques (depuis devis + factures)
  const vehiculesMap = new Map();
  [...devis, ...factures].forEach(d => {
    if (d.vehicule_immat) {
      vehiculesMap.set(d.vehicule_immat, {
        nom: d.vehicule_nom,
        immat: d.vehicule_immat,
        km: d.vehicule_km,
        last_seen: d.date_emission
      });
    }
  });
  const vehicules = Array.from(vehiculesMap.values()).sort((a, b) =>
    new Date(b.last_seen) - new Date(a.last_seen)
  );

  // Garder le dernier véhicule pour pré-remplissage
  currentModalClientLastVehicle = vehicules[0] || null;

  // Construire le HTML
  let html = `
    <div class="modal-section">
      <div class="modal-label">Coordonnées</div>
      <div class="modal-value">📞 ${client.telephone || '—'}</div>
      <div class="modal-value" style="margin-top:4px">📍 ${client.adresse || '—'} ${client.commune ? '· ' + client.commune : ''}</div>
    </div>

    <div class="modal-section">
      <div class="modal-label">Statistiques</div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${nbInterventions}</div>
          <div class="stat-label">Interventions</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${formatEUR(caTotal)}</div>
          <div class="stat-label">CA total</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${formatEUR(panierMoyen)}</div>
          <div class="stat-label">Panier moyen</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="font-size:13px">${lastVisit ? new Date(lastVisit).toLocaleDateString('fr-FR') : '—'}</div>
          <div class="stat-label">Dernière visite</div>
        </div>
      </div>
    </div>
  `;

  // Véhicules
  if (vehicules.length > 0) {
    html += `
      <div class="modal-section">
        <div class="modal-label">Véhicules (${vehicules.length})</div>
        ${vehicules.map((v, idx) => `
          <div class="vehicle-item ${idx === 0 ? 'vehicle-active' : ''}" data-vehicle-idx="${idx}">
            <div>
              <div style="font-weight:600">${v.nom || '—'}</div>
              <div style="font-size:12px;color:var(--text-2)">${v.immat || '—'} ${v.km ? '· ' + v.km + ' km' : ''}</div>
            </div>
            ${idx === 0 ? '<span class="badge-dernier">DERNIER</span>' : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Historique devis
  if (devis.length > 0) {
    html += `
      <div class="modal-section">
        <div class="modal-label">Devis (${devis.length})</div>
        ${devis.slice(0, 10).map(d => `
          <div class="modal-prest-row">
            <div>
              <div class="ref">${d.numero}</div>
              <div class="desig">${new Date(d.date_emission).toLocaleDateString('fr-FR')} · <span class="status-mini status-${d.statut}">${d.statut}</span></div>
            </div>
            <div class="price">${formatEUR(d.total_ttc)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Historique factures
  if (factures.length > 0) {
    html += `
      <div class="modal-section">
        <div class="modal-label">Factures (${factures.length})</div>
        ${factures.slice(0, 10).map(f => {
          const stCls = f.statut_paiement === 'paye' ? 'status-paye' : 'status-impaye';
          return `<div class="modal-prest-row">
            <div>
              <div class="ref">${f.numero}</div>
              <div class="desig">${new Date(f.date_emission).toLocaleDateString('fr-FR')} · <span class="status-mini ${stCls}">${f.statut_paiement}</span></div>
            </div>
            <div class="price">${formatEUR(f.total_ttc)}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // Données vehicules cliquables
  document.getElementById('modal-client-body').innerHTML = html;

  // Click sur véhicule = le sélectionner
  document.querySelectorAll('.vehicle-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.vehicle-item').forEach(v => v.classList.remove('vehicle-active'));
      el.classList.add('vehicle-active');
      const idx = parseInt(el.dataset.vehicleIdx);
      currentModalClientLastVehicle = vehicules[idx];
    });
  });
}

document.getElementById('modal-client-close-btn').addEventListener('click', () => {
  document.getElementById('modal-client').classList.remove('show');
});
document.getElementById('modal-client').addEventListener('click', (e) => {
  if (e.target.id === 'modal-client') {
    document.getElementById('modal-client').classList.remove('show');
  }
});

// Bouton + Devis depuis fiche client
document.getElementById('btn-client-new-devis').addEventListener('click', () => {
  if (!currentModalClient) return;
  document.getElementById('modal-client').classList.remove('show');
  resetDevisForm();
  showScreen('new-devis');
  setTimeout(() => prefillFromClient('d'), 100);
});

// Bouton + Facture depuis fiche client
document.getElementById('btn-client-new-facture').addEventListener('click', () => {
  if (!currentModalClient) return;
  document.getElementById('modal-client').classList.remove('show');
  resetFactureForm();
  showScreen('new-facture');
  setTimeout(() => prefillFromClient('f'), 100);
});

function prefillFromClient(prefix) {
  const cl = currentModalClient;
  const v = currentModalClientLastVehicle;
  if (!cl) return;

  document.getElementById(prefix + '-client-nom').value = cl.nom || '';
  document.getElementById(prefix + '-client-tel').value = cl.telephone || '';
  document.getElementById(prefix + '-client-commune').value = cl.commune || '';
  document.getElementById(prefix + '-client-adresse').value = cl.adresse || '';

  if (v) {
    document.getElementById(prefix + '-vehicule').value = v.nom || '';
    document.getElementById(prefix + '-immat').value = v.immat || '';
    document.getElementById(prefix + '-km').value = v.km || '';
  }

  toast('Fiche ' + cl.nom + ' chargée', 'success');
}

// ═══════════ MODAL DEVIS ═══════════
let currentModalDevis = null;

function openDevisModal(devis) {
  currentModalDevis = devis;
  document.getElementById('modal-devis-num').textContent = devis.numero;
  document.getElementById('modal-devis-statut').value = devis.statut;

  const clientNom = devis.clients?.nom || '—';
  const lignesHtml = (devis.lignes || []).map(l => `
    <div class="modal-prest-row">
      <div>
        <div class="ref">${l.ref}</div>
        <div class="desig">${l.designation} × ${l.qte}</div>
      </div>
      <div class="price">${formatEUR(l.montant)}</div>
    </div>
  `).join('');

  document.getElementById('modal-devis-body').innerHTML = `
    <div class="modal-section">
      <div class="modal-label">Client</div>
      <div class="modal-value">${clientNom}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Véhicule</div>
      <div class="modal-value">${devis.vehicule_nom || '—'} ${devis.vehicule_immat ? '· ' + devis.vehicule_immat : ''} ${devis.vehicule_km ? '· ' + devis.vehicule_km + ' km' : ''}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Date · Grille</div>
      <div class="modal-value">${new Date(devis.date_emission).toLocaleDateString('fr-FR')} · ${devis.grille}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Prestations</div>
      ${lignesHtml}
    </div>
    <div class="modal-section">
      <div class="modal-label">Totaux</div>
      <div class="modal-value">HT ${formatEUR(devis.total_ht)} · TVA ${formatEUR(devis.tva)} · TTC <strong style="color:var(--accent)">${formatEUR(devis.total_ttc)}</strong></div>
      ${devis.remise_pct > 0 ? `<div class="modal-value" style="color:var(--red)">Remise ${devis.remise_pct}% : -${formatEUR(devis.remise_montant)}</div>` : ''}
    </div>
  `;

  document.getElementById('modal-devis').classList.add('show');
}

document.getElementById('modal-close-btn').addEventListener('click', () => {
  document.getElementById('modal-devis').classList.remove('show');
});
document.getElementById('modal-devis').addEventListener('click', (e) => {
  if (e.target.id === 'modal-devis') {
    document.getElementById('modal-devis').classList.remove('show');
  }
});

// Changer statut
document.getElementById('modal-devis-statut').addEventListener('change', async (e) => {
  if (!currentModalDevis) return;
  const newStatut = e.target.value;
  const { error } = await sb.from('devis').update({ statut: newStatut }).eq('id', currentModalDevis.id);
  if (error) { toast('Erreur mise à jour', 'error'); return; }
  currentModalDevis.statut = newStatut;
  toast('Statut mis à jour ✓', 'success');
  loadKPIs();
});

// Convertir en facture
document.getElementById('btn-convert-facture').addEventListener('click', () => {
  if (!currentModalDevis) return;
  const devis = currentModalDevis;
  document.getElementById('modal-devis').classList.remove('show');
  resetFactureForm();
  showScreen('new-facture');
  setTimeout(() => prefillFactureFromDevis(devis), 100);
});

// ═══════════ HELPERS ═══════════
function formatEUR(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3000);
}


// ═══════════════════════════════════════════════════════════════════
// ÉDITION & SUPPRESSION
// ═══════════════════════════════════════════════════════════════════

// ═══════════ SUPPRESSION CLIENT ═══════════
document.getElementById('btn-delete-client').addEventListener('click', async () => {
  if (!currentModalClient) return;
  if (!confirm(`Supprimer définitivement le client "${currentModalClient.nom}" ?\n\n⚠️ Ses devis et factures resteront mais ne seront plus liés à un client.`)) return;

  const { error } = await sb.from('clients').delete().eq('id', currentModalClient.id);
  if (error) { toast('Erreur suppression', 'error'); return; }
  toast('Client supprimé', 'success');
  document.getElementById('modal-client').classList.remove('show');
  loadClientsList();
  loadKPIs();
});

// ═══════════ ÉDITION CLIENT ═══════════
document.getElementById('btn-edit-client').addEventListener('click', () => {
  if (!currentModalClient) return;
  document.getElementById('edit-client-nom').value = currentModalClient.nom || '';
  document.getElementById('edit-client-tel').value = currentModalClient.telephone || '';
  document.getElementById('edit-client-adresse').value = currentModalClient.adresse || '';
  document.getElementById('edit-client-commune').value = currentModalClient.commune || '';
  document.getElementById('edit-client-email').value = currentModalClient.email || '';
  document.getElementById('modal-edit-client').classList.add('show');
});

document.getElementById('btn-cancel-edit-client').addEventListener('click', () => {
  document.getElementById('modal-edit-client').classList.remove('show');
});
document.getElementById('modal-edit-client-close').addEventListener('click', () => {
  document.getElementById('modal-edit-client').classList.remove('show');
});

document.getElementById('btn-save-edit-client').addEventListener('click', async () => {
  if (!currentModalClient) return;
  const updated = {
    nom: document.getElementById('edit-client-nom').value.trim(),
    telephone: document.getElementById('edit-client-tel').value.trim(),
    adresse: document.getElementById('edit-client-adresse').value.trim(),
    commune: document.getElementById('edit-client-commune').value.trim(),
    email: document.getElementById('edit-client-email').value.trim()
  };
  const { error } = await sb.from('clients').update(updated).eq('id', currentModalClient.id);
  if (error) { toast('Erreur', 'error'); return; }
  toast('Client mis à jour', 'success');
  document.getElementById('modal-edit-client').classList.remove('show');
  document.getElementById('modal-client').classList.remove('show');
  loadClientsList();
});

// ═══════════ SUPPRESSION DEVIS ═══════════
document.getElementById('btn-delete-devis').addEventListener('click', async () => {
  if (!currentModalDevis) return;
  if (!confirm(`Supprimer définitivement le devis ${currentModalDevis.numero} ?`)) return;

  const { error } = await sb.from('devis').delete().eq('id', currentModalDevis.id);
  if (error) { toast('Erreur suppression', 'error'); return; }
  toast('Devis supprimé', 'success');
  document.getElementById('modal-devis').classList.remove('show');
  loadDevisList();
  loadKPIs();
});

// ═══════════ ÉDITION DEVIS ═══════════
document.getElementById('btn-edit-devis').addEventListener('click', async () => {
  if (!currentModalDevis) return;
  const devis = currentModalDevis;

  document.getElementById('modal-devis').classList.remove('show');

  // Reset form puis pré-remplir avec le devis existant
  resetDevisForm();
  showScreen('new-devis');

  // Petit délai pour laisser le DOM se mettre à jour
  await new Promise(r => setTimeout(r, 100));

  // Mode édition
  state.editingDevisId = devis.id;
  state.editingDevisNumero = devis.numero;

  // Pré-remplir client
  if (devis.client_id) {
    const { data: cl } = await sb.from('clients').select('*').eq('id', devis.client_id).maybeSingle();
    if (cl) {
      document.getElementById('d-client-nom').value = cl.nom || '';
      document.getElementById('d-client-tel').value = cl.telephone || '';
      document.getElementById('d-client-commune').value = cl.commune || '';
      document.getElementById('d-client-adresse').value = cl.adresse || '';
    }
  }

  // Véhicule
  document.getElementById('d-vehicule').value = devis.vehicule_nom || '';
  document.getElementById('d-immat').value = devis.vehicule_immat || '';
  document.getElementById('d-km').value = devis.vehicule_km || '';

  // Pieces / remise
  state.currentDevis.pieces = parseFloat(devis.pieces) || 0;
  state.currentDevis.remise_pct = parseFloat(devis.remise_pct) || 0;
  state.currentDevis.grille = devis.grille;
  document.getElementById('d-pieces').value = state.currentDevis.pieces;
  document.getElementById('d-remise').value = state.currentDevis.remise_pct;

  // Boutons remise
  document.querySelectorAll('#screen-new-devis .rem-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.rem) === state.currentDevis.remise_pct);
  });

  // Grille
  document.querySelectorAll('#screen-new-devis .grille-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.grille === devis.grille));

  // Lignes
  document.getElementById('prestations-list').innerHTML = '';
  for (const lig of (devis.lignes || [])) {
    addPrestationRow('d', lig);
  }

  // Changer le titre
  document.getElementById('devis-title').textContent = `Modifier ${devis.numero}`;

  updateTotals('d');
  toast('Mode édition de ' + devis.numero, '');
});

// ═══════════ MODAL FACTURE ═══════════
let currentModalFacture = null;

async function openFactureModal(facture) {
  currentModalFacture = facture;
  document.getElementById('modal-facture-num').textContent = facture.numero;
  document.getElementById('modal-facture-statut').value = facture.statut_paiement;

  const clientNom = facture.clients?.nom || '—';
  const lignesHtml = (facture.lignes || []).map(l => `
    <div class="modal-prest-row">
      <div>
        <div class="ref">${l.ref}</div>
        <div class="desig">${l.designation} × ${l.qte}</div>
      </div>
      <div class="price">${formatEUR(l.montant)}</div>
    </div>
  `).join('');

  document.getElementById('modal-facture-body').innerHTML = `
    <div class="modal-section">
      <div class="modal-label">Client</div>
      <div class="modal-value">${clientNom}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Véhicule</div>
      <div class="modal-value">${facture.vehicule_nom || '—'} ${facture.vehicule_immat ? '· ' + facture.vehicule_immat : ''} ${facture.vehicule_km ? '· ' + facture.vehicule_km + ' km' : ''}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Date · Échéance · Règlement</div>
      <div class="modal-value">${new Date(facture.date_emission).toLocaleDateString('fr-FR')} · ${facture.date_echeance ? new Date(facture.date_echeance).toLocaleDateString('fr-FR') : '—'} · ${facture.mode_reglement || '—'}</div>
    </div>
    ${facture.observations ? `<div class="modal-section"><div class="modal-label">Observations</div><div class="modal-value">${facture.observations}</div></div>` : ''}
    <div class="modal-section">
      <div class="modal-label">Prestations</div>
      ${lignesHtml}
    </div>
    <div class="modal-section">
      <div class="modal-label">Totaux</div>
      <div class="modal-value">HT ${formatEUR(facture.total_ht)} · TVA ${formatEUR(facture.tva)} · TTC <strong style="color:var(--accent)">${formatEUR(facture.total_ttc)}</strong></div>
      ${facture.remise_pct > 0 ? `<div class="modal-value" style="color:var(--red)">Remise ${facture.remise_pct}% : -${formatEUR(facture.remise_montant)}</div>` : ''}
    </div>
  `;

  document.getElementById('modal-facture').classList.add('show');
}

document.getElementById('modal-facture-close-btn').addEventListener('click', () => {
  document.getElementById('modal-facture').classList.remove('show');
});
document.getElementById('modal-facture').addEventListener('click', (e) => {
  if (e.target.id === 'modal-facture') {
    document.getElementById('modal-facture').classList.remove('show');
  }
});

// Changer statut paiement
document.getElementById('modal-facture-statut').addEventListener('change', async (e) => {
  if (!currentModalFacture) return;
  const newStatut = e.target.value;
  const { error } = await sb.from('factures').update({ statut_paiement: newStatut }).eq('id', currentModalFacture.id);
  if (error) { toast('Erreur', 'error'); return; }
  currentModalFacture.statut_paiement = newStatut;
  toast('Statut paiement mis à jour', 'success');
  loadKPIs();
});

// Suppression facture
document.getElementById('btn-delete-facture').addEventListener('click', async () => {
  if (!currentModalFacture) return;
  if (!confirm(`Supprimer définitivement la facture ${currentModalFacture.numero} ?`)) return;
  const { error } = await sb.from('factures').delete().eq('id', currentModalFacture.id);
  if (error) { toast('Erreur', 'error'); return; }
  toast('Facture supprimée', 'success');
  document.getElementById('modal-facture').classList.remove('show');
  loadFacturesList();
  loadKPIs();
});

// Édition facture
document.getElementById('btn-edit-facture').addEventListener('click', async () => {
  if (!currentModalFacture) return;
  const facture = currentModalFacture;
  document.getElementById('modal-facture').classList.remove('show');

  resetFactureForm();
  showScreen('new-facture');
  await new Promise(r => setTimeout(r, 100));

  state.editingFactureId = facture.id;
  state.editingFactureNumero = facture.numero;

  if (facture.client_id) {
    const { data: cl } = await sb.from('clients').select('*').eq('id', facture.client_id).maybeSingle();
    if (cl) {
      document.getElementById('f-client-nom').value = cl.nom || '';
      document.getElementById('f-client-tel').value = cl.telephone || '';
      document.getElementById('f-client-commune').value = cl.commune || '';
      document.getElementById('f-client-adresse').value = cl.adresse || '';
    }
  }

  document.getElementById('f-vehicule').value = facture.vehicule_nom || '';
  document.getElementById('f-immat').value = facture.vehicule_immat || '';
  document.getElementById('f-km').value = facture.vehicule_km || '';
  document.getElementById('f-date').value = facture.date_emission || '';
  document.getElementById('f-echeance').value = facture.date_echeance || '';
  document.getElementById('f-reglement').value = facture.mode_reglement || 'Espèces';
  document.getElementById('f-observations').value = facture.observations || '';

  state.currentFacture.pieces = parseFloat(facture.pieces) || 0;
  state.currentFacture.remise_pct = parseFloat(facture.remise_pct) || 0;
  state.currentFacture.grille = facture.grille || 'B';
  document.getElementById('f-pieces').value = state.currentFacture.pieces;
  document.getElementById('f-remise').value = state.currentFacture.remise_pct;

  document.querySelectorAll('#screen-new-facture .rem-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.rem) === state.currentFacture.remise_pct);
  });

  document.getElementById('prestations-list-f').innerHTML = '';
  for (const lig of (facture.lignes || [])) {
    addPrestationRow('f', lig);
  }

  document.getElementById('facture-title').textContent = `Modifier ${facture.numero}`;
  updateTotals('f');
  toast('Mode édition de ' + facture.numero, '');
});




// ═══════════════════════════════════════════════════════════════════
// BROUILLONS — Sauvegarde sans générer le PDF
// ═══════════════════════════════════════════════════════════════════

async function saveAsDraft() {
  const btn = document.getElementById('btn-save-draft');
  if (btn.disabled) return; // Empêcher double-clic
  btn.disabled = true;
  const oldTxt = btn.textContent;
  btn.textContent = 'Enregistrement...';

  try {
    // Récupérer prochain numéro si nouveau, sinon garder l'existant
    let numero = state.editingDevisId
      ? (state.editingDevisNumero || null)
      : null;

    if (!numero) {
      const { data: numData, error: numErr } = await sb.rpc('prochain_numero', { type_doc: 'devis' });
      if (numErr) { toast('Erreur numéro', 'error'); btn.disabled = false; btn.textContent = oldTxt; return; }
      numero = numData;
    }

  // Lignes
  const lignes = [];
  document.querySelectorAll('#prestations-list .prestation-row').forEach(row => {
    if (!row.dataset.ref) return;
    lignes.push({
      ref: row.dataset.ref,
      designation: row.dataset.designation,
      qte: parseFloat(row.querySelector('.prest-qty').value) || 0,
      pu: parseFloat(row.dataset.pu) || 0,
      montant: parseFloat(row.dataset.total) || 0
    });
  });

  // Données
  const client = {
    nom: document.getElementById('d-client-nom').value || '',
    tel: document.getElementById('d-client-tel').value || '',
    commune: document.getElementById('d-client-commune').value || '',
    adresse: document.getElementById('d-client-adresse').value || ''
  };
  const vehicule = {
    nom: document.getElementById('d-vehicule').value || '',
    immat: document.getElementById('d-immat').value || '',
    km: document.getElementById('d-km').value || ''
  };

  // Au moins un nom client OU une ligne pour pouvoir enregistrer
  if (!client.nom && lignes.length === 0) {
    toast('Renseigne au moins le nom du client ou une prestation', 'error');
    return;
  }

  const totalMo = lignes.reduce((s, l) => s + l.montant, 0);
  const pieces = state.currentDevis.pieces;
  const sousHt = totalMo + pieces;
  const tva = sousHt * 0.085;
  const ttcAvant = sousHt + tva;
  const remisePct = state.currentDevis.remise_pct;
  const remiseMontant = remisePct > 0 ? ttcAvant * remisePct / 100 : 0;
  const ttc = ttcAvant - remiseMontant;

  // Gérer client : trouver ou créer
  let client_id = null;
  if (client.nom) {
    const { data: existing } = await sb.from('clients').select('id').ilike('nom', client.nom).maybeSingle();
    if (existing) {
      client_id = existing.id;
      await sb.from('clients').update({
        telephone: client.tel, adresse: client.adresse, commune: client.commune
      }).eq('id', client_id);
    } else {
      const { data: newCl } = await sb.from('clients').insert({
        nom: client.nom, telephone: client.tel, adresse: client.adresse, commune: client.commune
      }).select().single();
      if (newCl) client_id = newCl.id;
    }
  }

  // Sauvegarde
  if (state.editingDevisId) {
    const { error } = await sb.from('devis').update({
      client_id, grille: state.currentDevis.grille, lignes,
      total_ht: sousHt, pieces, remise_pct: remisePct,
      remise_montant: remiseMontant, tva, total_ttc: ttc,
      statut: 'brouillon',
      vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
    }).eq('id', state.editingDevisId);
    if (error) { toast('Erreur : ' + error.message, 'error'); return; }
    toast('Brouillon mis à jour ✓', 'success');
  } else {
    const { error } = await sb.from('devis').insert({
      numero, client_id, date_emission: new Date().toISOString().split('T')[0],
      grille: state.currentDevis.grille, lignes,
      total_ht: sousHt, pieces, remise_pct: remisePct,
      remise_montant: remiseMontant, tva, total_ttc: ttc,
      statut: 'brouillon',
      vehicule_nom: vehicule.nom, vehicule_immat: vehicule.immat, vehicule_km: vehicule.km
    });
    if (error) { 
      toast('Erreur : ' + error.message, 'error');
      btn.disabled = false; btn.textContent = oldTxt;
      return;
    }
    toast('Brouillon ' + numero + ' enregistré ✓', 'success');
  }

    btn.disabled = false;
    btn.textContent = oldTxt;
    setTimeout(() => { showScreen('home'); loadKPIs(); }, 1200);
  } catch (e) {
    console.error('Erreur saveAsDraft:', e);
    toast('Erreur : ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = oldTxt;
  }
}

// Brancher le bouton "Enregistrer brouillon" qui existait déjà dans HTML
const btnSaveDraft = document.getElementById('btn-save-draft');
if (btnSaveDraft) btnSaveDraft.addEventListener('click', saveAsDraft);
