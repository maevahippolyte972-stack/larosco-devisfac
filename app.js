// ═══════════════════════════════════════════════════════════════════
// LAROSCO TECHNICS — App principale
// ═══════════════════════════════════════════════════════════════════

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// État global
const state = {
  user: null,
  prestations: [],
  currentDevis: {
    grille: 'B',
    lignes: [],
    pieces: 0,
    remise_pct: 0
  }
};

// ═══════════ NAVIGATION ÉCRANS ═══════════
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

// ═══════════ AUTH ═══════════
async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    showScreen('home');
    await loadPrestations();
    await loadKPIs();
  } else {
    showScreen('login');
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Connexion…';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Se connecter';

  if (error) {
    errEl.textContent = 'Email ou mot de passe incorrect';
    return;
  }

  state.user = data.user;
  showScreen('home');
  await loadPrestations();
  await loadKPIs();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  state.user = null;
  showScreen('login');
});

// ═══════════ CHARGEMENT DONNÉES ═══════════
async function loadPrestations() {
  const { data, error } = await sb.from('prestations').select('*').order('ref');
  if (error) { toast('Erreur chargement tarifs', 'error'); return; }
  state.prestations = data || [];
}

async function loadKPIs() {
  // CA du mois
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

// ═══════════ NOUVEAU DEVIS ═══════════
function resetDevisForm() {
  state.currentDevis = { grille: 'B', lignes: [], pieces: 0, remise_pct: 0 };
  document.querySelectorAll('#screen-new-devis input').forEach(i => {
    if (i.type === 'number') i.value = i.id === 'd-remise' || i.id === 'd-pieces' ? 0 : '';
    else i.value = '';
  });
  document.querySelectorAll('.grille-btn').forEach(b => b.classList.toggle('active', b.dataset.grille === 'B'));
  document.querySelectorAll('.rem-btn').forEach(b => b.classList.toggle('active', b.dataset.rem === '0'));
  document.getElementById('prestations-list').innerHTML = '';
  addPrestationRow();
  updateTotals();
}

// Sélection grille
document.querySelectorAll('.grille-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.grille-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentDevis.grille = btn.dataset.grille;
    // Recalculer prix de toutes les lignes
    document.querySelectorAll('.prestation-row').forEach(refreshPrestationRow);
    updateTotals();
  });
});

// Remise rapide
document.querySelectorAll('.rem-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rem-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('d-remise').value = btn.dataset.rem;
    state.currentDevis.remise_pct = parseInt(btn.dataset.rem);
    updateTotals();
  });
});
document.getElementById('d-remise').addEventListener('input', e => {
  state.currentDevis.remise_pct = parseFloat(e.target.value) || 0;
  document.querySelectorAll('.rem-btn').forEach(b => b.classList.remove('active'));
  updateTotals();
});
document.getElementById('d-pieces').addEventListener('input', e => {
  state.currentDevis.pieces = parseFloat(e.target.value) || 0;
  updateTotals();
});

// Ajouter ligne prestation
document.getElementById('btn-add-prestation').addEventListener('click', addPrestationRow);

function addPrestationRow() {
  const list = document.getElementById('prestations-list');
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'prestation-row';
  row.dataset.idx = idx;
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

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    if (q.length < 2) { sugg.classList.remove('open'); return; }
    const matches = state.prestations.filter(p =>
      p.ref.toLowerCase().includes(q) ||
      (p.designation || '').toLowerCase().includes(q)
    ).slice(0, 8);

    sugg.innerHTML = matches.map(p => {
      const prix = getPrice(p, state.currentDevis.grille);
      return `<div class="suggestion-item" data-ref="${p.ref}">
        <span class="sugg-ref">${p.ref}</span>
        <span class="sugg-desig">${p.designation}</span>
        <span class="sugg-prix">${formatEUR(prix)} (grille ${getEffectiveGrille(p, state.currentDevis.grille)})</span>
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
    refreshPrestationRow(row);
    updateTotals();
  });

  qty.addEventListener('input', () => { refreshPrestationRow(row); updateTotals(); });

  row.querySelector('.prest-remove').addEventListener('click', () => {
    row.remove();
    updateTotals();
  });
}

function refreshPrestationRow(row) {
  const ref = row.dataset.ref;
  if (!ref) return;
  const p = state.prestations.find(x => x.ref === ref);
  if (!p) return;
  const prix = getPrice(p, state.currentDevis.grille);
  const qty = parseFloat(row.querySelector('.prest-qty').value) || 0;
  const total = prix * qty;
  row.querySelector('.prest-total').textContent = formatEUR(total);
  row.dataset.pu = prix;
  row.dataset.total = total;
  row.dataset.designation = p.designation;
}

// Prix selon grille (BMW = toujours D)
function getEffectiveGrille(presta, selected) {
  if (presta.ref.startsWith('BMW')) return 'D';
  return selected;
}
function getPrice(presta, grilleSelected) {
  const g = getEffectiveGrille(presta, grilleSelected);
  if (g === 'B') return parseFloat(presta.prix_b) || 0;
  if (g === 'C') return parseFloat(presta.prix_c) || 0;
  if (g === 'D') return parseFloat(presta.prix_d) || 0;
  return 0;
}

// Calcul totaux
function updateTotals() {
  let totalMo = 0;
  document.querySelectorAll('.prestation-row').forEach(row => {
    totalMo += parseFloat(row.dataset.total) || 0;
  });
  const pieces = state.currentDevis.pieces;
  const remisePct = state.currentDevis.remise_pct;

  const sousHt = totalMo + pieces;
  const tva = sousHt * 0.085;
  const ttcAvant = sousHt + tva;
  const remiseMontant = remisePct > 0 ? ttcAvant * remisePct / 100 : 0;
  const ttc = ttcAvant - remiseMontant;

  document.getElementById('t-mo').textContent = formatEUR(totalMo);
  document.getElementById('t-pieces').textContent = formatEUR(pieces);
  document.getElementById('t-ht').textContent = formatEUR(sousHt);
  document.getElementById('t-tva').textContent = formatEUR(tva);
  document.getElementById('t-ttc').textContent = formatEUR(ttc);

  const remiseRow = document.getElementById('row-remise');
  if (remisePct > 0) {
    remiseRow.style.display = 'flex';
    document.getElementById('t-remise-pct').textContent = remisePct + '%';
    document.getElementById('t-remise').textContent = '-' + formatEUR(remiseMontant);
  } else {
    remiseRow.style.display = 'none';
  }
}

// ═══════════ GÉNÉRATION PDF ═══════════
document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
  await generateDevisPDF();
});

async function generateDevisPDF() {
  // Récupérer le prochain numéro
  const { data: numData, error: numErr } = await sb.rpc('prochain_numero', { type_doc: 'devis' });
  if (numErr) { toast('Erreur numéro devis', 'error'); return; }
  const numero = numData;

  // Lignes
  const lignes = [];
  document.querySelectorAll('.prestation-row').forEach(row => {
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

  // Calculs
  const totalMo = lignes.reduce((s, l) => s + l.montant, 0);
  const pieces = state.currentDevis.pieces;
  const sousHt = totalMo + pieces;
  const tva = sousHt * 0.085;
  const ttcAvant = sousHt + tva;
  const remisePct = state.currentDevis.remise_pct;
  const remiseMontant = remisePct > 0 ? ttcAvant * remisePct / 100 : 0;
  const ttc = ttcAvant - remiseMontant;

  // PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;

  // Header
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, W, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(20);
  doc.text('LAROSCOTECHNICS', M, 14);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('Garage automobile · Case-Pilote · Martinique', M, 19);
  doc.text('Tel : 0696 28 11 05  |  laroscotechnics@gmail.com', M, 23);
  doc.setTextColor(232, 103, 10);
  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text('SIRET : 10128189700013  |  TVA 8,5% Art.296 CGI DOM', M, 28);

  // Bloc DEVIS à droite
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(22);
  doc.text('DEVIS', W - M, 14, { align: 'right' });
  doc.setFontSize(10).setTextColor(232, 103, 10);
  doc.text(numero, W - M, 20, { align: 'right' });
  doc.setFontSize(8).setTextColor(180, 180, 180);
  doc.text('Date : ' + new Date().toLocaleDateString('fr-FR'), W - M, 25, { align: 'right' });
  doc.text('Grille : ' + state.currentDevis.grille, W - M, 29, { align: 'right' });

  // Trait rouge
  doc.setFillColor(192, 57, 43);
  doc.rect(0, 35, W, 2, 'F');

  let y = 45;

  // Bloc client / véhicule
  doc.setFillColor(17, 17, 17);
  doc.rect(M, y, (W - 2*M)/2 - 1, 7, 'F');
  doc.setFillColor(192, 57, 43);
  doc.rect(W/2 + 1, y, (W - 2*M)/2 - 1, 7, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(9);
  doc.text('FACTURÉ À', M + 3, y + 5);
  doc.text('VÉHICULE', W/2 + 4, y + 5);

  y += 7;
  doc.setFillColor(249, 249, 249);
  doc.rect(M, y, (W - 2*M)/2 - 1, 22, 'F');
  doc.rect(W/2 + 1, y, (W - 2*M)/2 - 1, 22, 'F');
  doc.setTextColor(17, 17, 17).setFont('helvetica', 'bold').setFontSize(10);
  doc.text(client.nom, M + 3, y + 5);
  doc.text(vehicule.nom, W/2 + 4, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  doc.text('Tél : ' + client.tel, M + 3, y + 11);
  doc.text('Immat : ' + vehicule.immat, W/2 + 4, y + 11);
  doc.text('Adresse : ' + client.adresse, M + 3, y + 16);
  doc.text('KM : ' + vehicule.km, W/2 + 4, y + 16);
  doc.text('Commune : ' + client.commune, M + 3, y + 21);

  y += 28;

  // Tableau prestations
  doc.autoTable({
    startY: y,
    head: [['Réf.', 'Désignation', 'Qté', 'PU HT', 'Montant HT']],
    body: lignes.map(l => [
      l.ref,
      l.designation,
      l.qte,
      formatEUR(l.pu),
      formatEUR(l.montant)
    ]),
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: [255, 255, 255],
      fontSize: 9,
      halign: 'center'
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [244, 246, 247] },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', textColor: [26, 58, 92], cellWidth: 22 },
      1: { cellWidth: 80 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 30, fillColor: [235, 245, 251] }
    },
    margin: { left: M, right: M }
  });

  y = doc.lastAutoTable.finalY + 4;

  // Totaux
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

  // TTC final
  const ttcFinalLabel = remisePct > 0 ? 'TTC (avant remise)' : 'TOTAL TTC';
  doc.setFillColor(17, 17, 17);
  doc.rect(M, y, W - 2*M - 35, 10, 'F');
  doc.setFillColor(192, 57, 43);
  doc.rect(W - M - 35, y, 35, 10, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(12);
  doc.text(ttcFinalLabel, W - M - 37, y + 7, { align: 'right' });
  doc.setFontSize(13);
  doc.text(formatEUR(ttcAvant), W - M - 2, y + 7, { align: 'right' });
  y += 12;

  // Si remise appliquée
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

    // Nouveau TTC
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

  // Conditions
  y += 8;
  doc.setTextColor(120, 120, 120).setFont('helvetica', 'bold').setFontSize(8);
  doc.text('CONDITIONS', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  doc.text('Diagnostic obligatoire avant travaux — 50% déduit si réalisés.', M, y); y += 3.5;
  doc.text('Pièces fournies par le client (origine OE / équipementier / adaptable).', M, y); y += 3.5;
  doc.text('Garantie main d\'œuvre : 6 mois ou 10 000 km (premier atteint).', M, y); y += 3.5;
  doc.text('Paiement : espèces, chèque, virement bancaire, CB.', M, y); y += 3.5;
  doc.text('Devis valable 30 jours à compter du ' + new Date().toLocaleDateString('fr-FR') + '.', M, y);

  // Footer
  doc.setTextColor(150, 150, 150).setFontSize(7);
  doc.text(
    'LaroscoTechnics · Case-Pilote, Martinique · 0696 28 11 05 · laroscotechnics@gmail.com · SIRET 10128189700013 · TVA 8,5% Art. 296 CGI DOM',
    W/2, 287, { align: 'center' }
  );

  // Sauver dans Supabase d'abord
  // Créer client si nouveau
  let client_id = null;
  if (client.nom) {
    const { data: existingClient } = await sb.from('clients').select('id').ilike('nom', client.nom).maybeSingle();
    if (existingClient) {
      client_id = existingClient.id;
    } else {
      const { data: newClient } = await sb.from('clients').insert({
        nom: client.nom,
        telephone: client.tel,
        adresse: client.adresse,
        commune: client.commune
      }).select().single();
      if (newClient) client_id = newClient.id;
    }
  }

  // Insert devis
  await sb.from('devis').insert({
    numero,
    client_id,
    date_emission: new Date().toISOString().split('T')[0],
    grille: state.currentDevis.grille,
    lignes,
    total_ht: sousHt,
    pieces,
    remise_pct: remisePct,
    remise_montant: remiseMontant,
    tva,
    total_ttc: ttc,
    statut: 'envoye'
  });

  // Télécharger PDF
  const safeName = (client.nom || 'client').replace(/[^a-z0-9]/gi, '_');
  doc.save(`Devis_${numero}_${safeName}_LaroscoTechnics.pdf`);

  toast('Devis ' + numero + ' généré ✓', 'success');
  setTimeout(() => { showScreen('home'); loadKPIs(); }, 1500);
}

// ═══════════ TARIFS ═══════════
function renderTarifs(filter = '') {
  const container = document.getElementById('tarifs-list-container');
  const q = filter.toLowerCase().trim();
  const filtered = q
    ? state.prestations.filter(p => p.ref.toLowerCase().includes(q) || (p.designation || '').toLowerCase().includes(q))
    : state.prestations;

  container.innerHTML = filtered.slice(0, 100).map(p => {
    const isBmw = p.ref.startsWith('BMW');
    return `<div class="tarif-item">
      <div class="tarif-info">
        <div class="tarif-ref ${isBmw ? 'bmw' : ''}">${p.ref}</div>
        <div class="tarif-desig">${p.designation}</div>
      </div>
      <div class="tarif-prix">
        ${isBmw
          ? `<div class="tarif-prix-row">D <strong>${formatEUR(p.prix_d)}</strong></div>`
          : `<div class="tarif-prix-row">B <strong>${formatEUR(p.prix_b)}</strong></div>
             <div class="tarif-prix-row">C <strong>${formatEUR(p.prix_c)}</strong></div>`
        }
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="text">Aucun résultat</div></div>';
}
document.getElementById('tarifs-search').addEventListener('input', e => renderTarifs(e.target.value));

// ═══════════ LISTES DEVIS / FACTURES / CLIENTS ═══════════
async function loadDevisList() {
  const c = document.getElementById('devis-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('devis')
    .select('*, clients(nom)')
    .order('created_at', { ascending: false })
    .limit(50);
  c.innerHTML = (data || []).map(d => `
    <div class="doc-item">
      <div>
        <div class="doc-num">${d.numero}</div>
        <div class="doc-client">${d.clients?.nom || '—'}</div>
        <div class="doc-date">${new Date(d.date_emission).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="doc-price">${formatEUR(d.total_ttc)}</div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">📋</div><div class="text">Aucun devis pour le moment</div></div>';
}

async function loadFacturesList() {
  const c = document.getElementById('factures-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('factures')
    .select('*, clients(nom)')
    .order('created_at', { ascending: false })
    .limit(50);
  c.innerHTML = (data || []).map(f => {
    const statusClass = f.statut_paiement === 'paye' ? 'status-paye' :
                       f.statut_paiement === 'partiel' ? 'status-attente' : 'status-impaye';
    const statusLabel = f.statut_paiement === 'paye' ? 'Payé' :
                       f.statut_paiement === 'partiel' ? 'Partiel' : 'Impayé';
    return `<div class="doc-item">
      <div>
        <div class="doc-num">${f.numero}</div>
        <div class="doc-client">${f.clients?.nom || '—'}</div>
        <div class="doc-date">${new Date(f.date_emission).toLocaleDateString('fr-FR')}</div>
        <span class="doc-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="doc-price">${formatEUR(f.total_ttc)}</div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="icon">🧾</div><div class="text">Aucune facture pour le moment</div></div>';
}

async function loadClientsList() {
  const c = document.getElementById('clients-list-container');
  c.innerHTML = '<div class="empty-state">Chargement…</div>';
  const { data } = await sb.from('clients').select('*').order('nom').limit(100);
  c.innerHTML = (data || []).map(cl => `
    <div class="doc-item">
      <div>
        <div class="doc-num">${cl.nom}</div>
        <div class="doc-client">${cl.telephone || '—'} ${cl.commune ? '· ' + cl.commune : ''}</div>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">👥</div><div class="text">Aucun client</div></div>';
}

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

// ═══════════ FACTURE (placeholder pour étape suivante) ═══════════
// On intégrera la génération de facture similaire au devis
// Pour l'instant le bouton "Nouvelle facture" reste désactivé
document.querySelector('[data-screen="new-facture"]').addEventListener('click', e => {
  e.stopPropagation();
  toast('Module facturation : prochaine étape', '');
}, true);

// ═══════════ INIT ═══════════
window.addEventListener('load', checkAuth);
