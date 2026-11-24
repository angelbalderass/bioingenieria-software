import { S, $, $$, esc, toEmail, toast, authErr, avisoFijo, cerrarSheet, setRender, esStaff, avisarCercaCita,
  initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, onSnapshot, query, where, runTransaction } from './core.js';
import { hoyStr, debeAvisarCita, minutosHora } from './util.js';
import { firebaseConfig } from './firebase-config.js';
import { renderAgenda } from './agenda.js';
import { renderConsultorios, setTabAgenda } from './consultorios.js';
import { renderDentistas } from './dentistas.js';
import { renderPacientes } from './pacientes.js';
import { renderResumen, renderReportes } from './reportes.js';
import { renderCuenta } from './cuenta.js';

const TABS = {
  admin: [['resumen', 'Resumen'], ['agenda', 'Agenda'], ['pacientes', 'Pacientes'], ['dentistas', 'Dentistas'], ['consultorios', 'Consultorios'], ['reportes', 'Reportes'], ['cuenta', 'Cuenta']],
  recepcion: [['agenda', 'Agenda'], ['pacientes', 'Pacientes'], ['dentistas', 'Dentistas'], ['consultorios', 'Consultorios'], ['cuenta', 'Cuenta']],
  dentista: [['agenda', 'Mi agenda'], ['pacientes', 'Pacientes'], ['consultorios', 'Mis consultorios'], ['cuenta', 'Cuenta']]
};
const ROLES = { admin: 'Administrador', recepcion: 'Recepción', dentista: 'Dentista' };
const VISTAS = { resumen: renderResumen, agenda: renderAgenda, consultorios: renderConsultorios, dentistas: renderDentistas, pacientes: renderPacientes, reportes: renderReportes, cuenta: renderCuenta };
const CFG_OK = !!(firebaseConfig && firebaseConfig.apiKey && !/^PEGA|^TU_/i.test(String(firebaseConfig.apiKey)));

/* ===== Pintar pantalla ===== */
let pendiente = false;
function render(pasivo) {
  if (!S.perfil) return;
  const v = $('#view'), a = document.activeElement;
  // Si la persona está escribiendo en un campo, no le borramos lo que lleva; se repinta al salir del campo.
  if (pasivo && v.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { pendiente = true; return; }
  pendiente = false;
  $('#clinicaNom').textContent = S.clinica.nombre || 'Equianza';
  $('#clinicaSub').textContent = 'Clínica dental' + (S.clinica.ciudad ? ' · ' + S.clinica.ciudad : '');
  const fn = VISTAS[S.tab]; if (fn) fn(v);
}
setRender(render);
document.addEventListener('focusout', () => setTimeout(() => { if (pendiente && !$('#view').contains(document.activeElement)) render(false); }, 0));

function pintarTabs() {
  const tabs = TABS[S.rol] || [];
  $('#tabs').innerHTML = tabs.map(([k, t]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === S.tab}">${t}</button>`).join('');
}
function setTab(t) {
  S.tab = t;
  $$('#tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  render(false); window.scrollTo(0, 0);
}
setTabAgenda(() => { S.vista = 'dia'; setTab('agenda'); });
$('#tabs').addEventListener('click', ev => { const b = ev.target.closest('.tab'); if (b) setTab(b.dataset.tab); });

/* ===== Datos en vivo ===== */
const errSub = e => {
  if (e && e.code === 'permission-denied') avisoFijo('Tu usuario no tiene permiso para leer estos datos.', true);
  else if (e && e.code === 'failed-precondition') avisoFijo('La base de datos está preparando un índice (tarda unos minutos tras publicar). Recarga en un momento.', true);
  else avisoFijo('No se pudieron leer los datos. Revisa tu conexión.', true);
};
const mapa = sn => new Map(sn.docs.map(d => [d.id, { ...d.data(), id: d.id }]));
function suscribir() {
  const db = S.db, rol = S.rol, me = S.perfil.dentistaId;
  const d1 = new Date(); d1.setDate(1); d1.setMonth(d1.getMonth() - 1);
  const corte = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-01`;   // desde el mes pasado
  S.corte = corte;
  const on = (ref, fn, flag) => S.subs.push(onSnapshot(ref, sn => { fn(sn); if (flag) S.cargado[flag] = true; avisoFijo(''); render(true); }, errSub));
  on(doc(db, 'config', 'clinica'), sn => { S.clinica = sn.exists() ? sn.data() : { nombre: 'Equianza', ciudad: '' }; });
  on(collection(db, 'pacientes'), sn => { S.pacientes = mapa(sn); }, 'pacientes');
  if (rol === 'dentista') {
    const mio = ref => query(collection(db, ref), where('dentistaId', '==', me));
    on(doc(db, 'dentistas', me), sn => { S.dentistas = sn.exists() ? new Map([[sn.id, { ...sn.data(), id: sn.id }]]) : new Map(); }, 'dentistas');
    on(mio('consultorios'), sn => { S.consultorios = mapa(sn); }, 'consultorios');
    on(query(collection(db, 'citas'), where('dentistaId', '==', me), where('fecha', '>=', corte)), sn => { S.citas = mapa(sn); }, 'citas');
  } else {
    on(collection(db, 'consultorios'), sn => { S.consultorios = mapa(sn); }, 'consultorios');
    on(collection(db, 'dentistas'), sn => { S.dentistas = mapa(sn); }, 'dentistas');
    on(query(collection(db, 'citas'), where('fecha', '>=', corte)), sn => { S.citas = mapa(sn); }, 'citas');
    S.subs.push(onSnapshot(doc(db, 'config', 'notificaciones'), sn => { S.notif = sn.exists() ? sn.data() : null; render(true); }, () => {}));
    if (rol === 'admin') {
      on(collection(db, 'usuarios'), sn => { S.usuarios = [...mapa(sn).values()]; }, 'usuarios');
    }
  }
}
function detener() {
  S.subs.forEach(f => { try { f(); } catch { /* nada */ } }); S.subs = [];
  if (S.unsubPerfil) { try { S.unsubPerfil(); } catch { /* nada */ } S.unsubPerfil = null; }
  clearTimeout(S.tm);
  Object.assign(S, { perfil: null, user: null, rol: null, consultorios: new Map(), dentistas: new Map(), pacientes: new Map(), citas: new Map(), citasExtra: new Map(), diasCargados: new Set(), citasMes: new Map(), usuarios: [], notif: null, cargado: {}, tab: null, filtroCons: '', vista: 'dia', mesCal: null, mesReporte: null });
  cerrarSheet(); avisoFijo('');
}

/* ===== Entrada / salida ===== */
function pantalla(modo) {
  $('#login').hidden = modo !== 'login'; $('#app').hidden = modo !== 'app';
}
function denegar(msg) {
  detener(); pantalla('login');
  $('#loginMsg').hidden = true; $('#formLogin').hidden = false; $('#l_err').textContent = msg;
  signOut(S.auth).catch(() => {});
}
function entrar(user) {
  S.user = user;
  $('#loginMsg').hidden = false; $('#loginMsg').textContent = 'Entrando…'; $('#formLogin').hidden = true;
  let arrancado = false;
  S.unsubPerfil = onSnapshot(doc(S.db, 'usuarios', user.uid), sn => {
    if (!sn.exists() && sn.metadata.fromCache && !arrancado) return;   // sin red: esperar al servidor
    const p = sn.exists() ? sn.data() : null;
    if (!p || p.activo !== true) { denegar(p ? 'Este usuario está desactivado.' : 'Este usuario no tiene acceso. Pide al administrador que lo dé de alta.'); return; }
    if (!TABS[p.rol]) { denegar('Este usuario no tiene un rol válido.'); return; }
    if (p.rol === 'dentista' && !p.dentistaId) { denegar('Este usuario de dentista no está vinculado a un dentista. Avisa al administrador.'); return; }
    const cambioRol = arrancado && S.rol !== p.rol;
    S.perfil = p; S.rol = p.rol;
    if (!arrancado) {
      arrancado = true; S.fecha = hoyStr();
      pantalla('app');
      $('#rolPill').textContent = ROLES[p.rol];
      pintarTabs(); S.tab = TABS[p.rol][0][0]; pintarTabs();
      suscribir(); render(false);
      S.tm = setTimeout(() => { if (!S.cargado.consultorios) avisoFijo('Tardando en conectar con los datos…'); }, 10000);
    } else if (cambioRol) { denegar('Tu rol cambió. Vuelve a entrar.'); }
    else render(true);
  }, e => denegar(authErr(e)));
}
$('#formLogin').addEventListener('submit', async ev => {
  ev.preventDefault(); const btn = $('#l_btn'); btn.disabled = true; $('#l_err').textContent = '';
  try { await signInWithEmailAndPassword(S.auth, toEmail($('#l_user').value), $('#l_pass').value); $('#l_pass').value = ''; }
  catch (e) { $('#l_err').textContent = authErr(e); }
  finally { btn.disabled = false; }
});
$('#btnSalir').addEventListener('click', () => { signOut(S.auth).catch(() => {}); });
$('#sheetClose').addEventListener('click', cerrarSheet);
$('#sheetBg').addEventListener('click', cerrarSheet);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#sheet').hidden) cerrarSheet(); });

/* ===== Recordatorio "cita cerca" =====
   Lo envía la computadora de recepción/administración mientras la app está abierta (el plan gratuito no tiene servidor). */
async function tickAvisos() {
  if (!S.perfil || !esStaff() || !S.cargado.citas || S.perfil.activo !== true) return;
  if (S.notif && S.notif.activo === false) return;
  const min = (S.notif && S.notif.minutosAntes) || 15, ahora = new Date(), hoy = hoyStr(ahora), am = ahora.getHours() * 60 + ahora.getMinutes();
  for (const c of [...S.citas.values()]) {
    if (c.fecha !== hoy || !debeAvisarCita(c, am, min)) continue;
    const d = S.dentistas.get(c.dentistaId); if (!d || !d.ntfyTema) continue;
    try {
      const ref = doc(S.db, 'citas', c.id);
      const ok = await runTransaction(S.db, async tx => {       // solo una computadora "reclama" el aviso
        const s = await tx.get(ref);
        if (!s.exists() || s.data().avisoPrevio || s.data().estado !== 'programada') return false;
        tx.update(ref, { avisoPrevio: true }); return true;
      });
      if (ok) avisarCercaCita(c, Math.max(0, minutosHora(c.hora) - am));
    } catch { /* sin red: se reintenta en el siguiente ciclo */ }
  }
}

/* ===== Arranque ===== */
function main() {
  let dia = hoyStr();
  setInterval(() => { if (hoyStr() !== dia) { dia = hoyStr(); if (S.perfil) { S.fecha = dia; render(true); } } tickAvisos(); }, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!CFG_OK) { $('#loginMsg').hidden = false; $('#formLogin').hidden = true; $('#loginMsg').textContent = 'Falta configurar Firebase: pega tus datos en public/firebase-config.js (mira el README).'; return; }
  const app = initializeApp(firebaseConfig);
  S.app = app; S.auth = getAuth(app);
  try { S.db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch { S.db = getFirestore(app); }
  onAuthStateChanged(S.auth, u => {
    if (u) entrar(u);
    else { detener(); pantalla('login'); $('#loginMsg').hidden = true; $('#formLogin').hidden = false; }
  });
}
main();
