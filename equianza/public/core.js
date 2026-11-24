// Núcleo compartido: Firebase por CDN, estado de la app, avisos en pantalla, ventana lateral y avisos al celular (ntfy).
export { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
export { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, collection, doc, onSnapshot, query, where, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, runTransaction } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { esc, norm } from './util.js';
export { esc, norm };

export const DOMINIO = 'equianza.app';           // los usuarios cortos se convierten en usuario@equianza.app
export const toEmail = u => { const x = String(u || '').trim().toLowerCase(); return x.includes('@') ? x : x + '@' + DOMINIO; };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const S = {
  app: null, auth: null, db: null, user: null, perfil: null, rol: null,
  consultorios: new Map(), dentistas: new Map(), pacientes: new Map(), citas: new Map(), citasExtra: new Map(), diasCargados: new Set(),
  usuarios: [], clinica: { nombre: 'Equianza', ciudad: '' }, notif: null, corte: null,
  cargado: {}, subs: [], tab: null, fecha: null, filtroCons: '', vista: 'dia', mesCal: null, mesReporte: null, citasMes: new Map()
};
export const esAdmin = () => S.rol === 'admin';
export const esStaff = () => S.rol === 'admin' || S.rol === 'recepcion';
export const esDentista = () => S.rol === 'dentista';

/* Quien se encarga de volver a pintar la pantalla (lo registra app.js) */
let _render = () => {};
export const setRender = fn => { _render = fn; };
export const renderAll = pasivo => _render(!!pasivo);

/* ===== Avisos en pantalla ===== */
let _tt;
export function toast(txt, err) {
  const t = $('#toast'), s = t.firstElementChild;
  s.textContent = txt; s.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(_tt); _tt = setTimeout(() => { t.hidden = true; }, 5000);
}
export function errTxt(e) {
  const c = e && e.code;
  if (c === 'permission-denied') return 'Tu usuario no tiene permiso para esto.';
  if (c === 'unavailable') return 'Sin conexión con los datos. Intenta de nuevo.';
  if (c === 'failed-precondition') return 'La base de datos aún se está preparando (índice). Espera unos minutos e intenta de nuevo.';
  if (c === 'resource-exhausted') return 'Se llenó la cuota gratuita de hoy. Intenta mañana.';
  return 'No se pudo guardar. Intenta de nuevo.';
}
export function authErr(e) {
  switch (e && e.code) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-email': return 'Usuario o contraseña incorrectos.';
    case 'auth/too-many-requests': return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    case 'auth/network-request-failed': return 'Sin conexión a internet.';
    case 'auth/user-disabled': return 'Este usuario está deshabilitado.';
    case 'auth/email-already-in-use': return 'Ese nombre de usuario ya existe.';
    case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/requires-recent-login': return 'Vuelve a iniciar sesión e intenta de nuevo.';
    case 'permission-denied': return 'Tu usuario no tiene permiso para esto.';
    default: return 'No se pudo completar. Intenta de nuevo.';
  }
}
export function avisoFijo(txt, mal) {
  const a = $('#aviso'); a.hidden = !txt; a.className = 'aviso' + (mal ? ' mal' : ''); a.textContent = txt || '';
}

/* ===== Ventana lateral ===== */
let _opener = null;
export function abrirSheet(titulo, html, alMontar) {
  _opener = document.activeElement;
  $('#sheetTitle').textContent = titulo;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  if (alMontar) alMontar($('#sheetBody'));
  const f = $('#sheetBody').querySelector('input:not([type=hidden]),select,textarea');
  if (f && matchMedia('(pointer:fine)').matches) f.focus();
}
export function cerrarSheet() {
  $('#sheet').hidden = true; $('#sheetBody').innerHTML = '';
  if (_opener && _opener.focus) { try { _opener.focus(); } catch { /* nada */ } }
}

/* Botón de dos pasos: el primer clic pide confirmar, el segundo ejecuta. */
export function confirmarClic(btn, textoConfirmar, accion) {
  if (btn.dataset.conf === '1') { clearTimeout(btn._t); btn.dataset.conf = ''; return accion(); }
  const orig = btn.textContent; btn.dataset.conf = '1'; btn.textContent = textoConfirmar; btn.classList.add('red');
  btn._t = setTimeout(() => { btn.dataset.conf = ''; btn.textContent = orig; btn.classList.remove('red'); }, 4000);
}

/* ===== Nombres cortos ===== */
export const nomCons = c => c ? `Consultorio ${c.numero}` : '—';
export const consultoriosDe = dentistaId => consultoriosOrdenados().filter(c => c.dentistaId === dentistaId);
export const pacientesOrdenados = () => [...S.pacientes.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
export const dentistasOrdenados = () => [...S.dentistas.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
export const consultoriosOrdenados = () => [...S.consultorios.values()].sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));

/* ===== Avisos al celular con ntfy.sh =====
   Se manda un mensaje al "tema" de cada persona; ella lo recibe en la app gratuita ntfy. */
export function ntfy(tema, titulo, mensaje, prioridad = 3, tags = []) {
  if (!tema) return Promise.resolve();
  const body = { topic: tema, title: titulo, message: mensaje, priority: prioridad, tags };
  return fetch('https://ntfy.sh', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
}
const avisosActivos = () => !(S.notif && S.notif.activo === false);
function temasDe(cita, incluirAdmin) {
  const d = S.dentistas.get(cita.dentistaId), set = new Set();
  if (d && d.ntfyTema) set.add(d.ntfyTema);
  if (incluirAdmin && S.notif && S.notif.tema && S.notif.avisarLlegadas !== false) set.add(S.notif.tema);
  return [...set];
}
export function avisarLlegada(c) {
  if (!avisosActivos()) return;
  const k = S.consultorios.get(c.consultorioId);
  const msg = `${c.paciente} ya llegó (cita de las ${c.hora}) · ${nomCons(k)}`;
  temasDe(c, true).forEach(t => ntfy(t, 'Equianza · Llegó un paciente', msg, 4, ['bell']));
}
export function avisarCercaCita(c, minutos) {
  if (!avisosActivos()) return;
  const k = S.consultorios.get(c.consultorioId);
  const msg = `Cita de ${c.paciente} a las ${c.hora} · ${nomCons(k)}${c.motivo ? ' · ' + c.motivo : ''}`;
  temasDe(c, false).forEach(t => ntfy(t, `Equianza · Cita en ${minutos} min`, msg, 3, ['alarm_clock']));
}

/* Descarga un archivo de texto (CSV) desde el navegador */
export function descargar(nombre, texto) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
