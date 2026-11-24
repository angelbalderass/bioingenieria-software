// Funciones puras (sin Firebase ni pantalla). Se prueban con Node en pruebas/util.test.mjs
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyStr = (now = new Date()) => ymd(now);
export const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const sumaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diasDelMes = (y, m0) => new Date(y, m0 + 1, 0).getDate();

// Meses ('AAAA-MM'): sumar, y semanas de un mes (lunes a domingo) para el calendario.
export const mesDe = f => String(f).slice(0, 7);
export const sumaMeses = (mes, n) => { const [y, m] = mes.split('-').map(Number); return ymd(new Date(y, m - 1 + n, 1)).slice(0, 7); };
export function semanasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const filas = Math.ceil((off + diasDelMes(y, m - 1)) / 7), semanas = [];
  for (let w = 0; w < filas; w++) {
    const fila = [];
    for (let i = 0; i < 7; i++) { const d = new Date(y, m - 1, 1 - off + w * 7 + i); fila.push({ f: ymd(d), dentro: d.getMonth() === m - 1 }); }
    semanas.push(fila);
  }
  return semanas;
}

export const minutosHora = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
export const horaDeMinutos = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/* ===== Citas ===== */
export const ESTADOS_CITA = {
  programada: 'Programada', llego: 'En sala de espera', en_consulta: 'En consulta',
  atendida: 'Atendida', cancelada: 'Cancelada', no_vino: 'No asistió'
};
const INACTIVAS = ['cancelada', 'no_vino'];
export function buscarTraslape(citas, nueva, ignorarId) {
  const s = minutosHora(nueva.hora), e = s + Number(nueva.duracion || 30);
  for (const c of citas) {
    if (c.id === ignorarId || c.fecha !== nueva.fecha || INACTIVAS.includes(c.estado)) continue;
    if (c.consultorioId !== nueva.consultorioId && c.dentistaId !== nueva.dentistaId) continue;
    const cs = minutosHora(c.hora), ce = cs + Number(c.duracion || 30);
    if (s < ce && cs < e) return c;
  }
  return null;
}
// ¿Toca avisar que la cita está cerca? (de "minutosAntes" antes hasta 5 min después de la hora)
export function debeAvisarCita(c, ahoraMin, minutosAntes) {
  if (c.estado !== 'programada' || c.avisoPrevio) return false;
  const falta = minutosHora(c.hora) - ahoraMin;
  return falta <= minutosAntes && falta >= -5;
}

/* ===== Formato ===== */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const fmtFecha = s => s ? parse(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtCorta = s => s ? parse(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';
export const fmtDiaLargo = s => parse(s).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtMes = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); };
export const fmtHora12 = h => { const m = minutosHora(h); const hh = Math.floor(m / 60); return `${(hh % 12) || 12}:${pad(m % 60)} ${hh < 12 ? 'a. m.' : 'p. m.'}`; };

export const digitos = s => String(s || '').replace(/\D/g, '');
// Enlace de WhatsApp para recordar la cita al paciente (10 dígitos = número de México).
export function linkWhatsApp(tel, texto) {
  let d = digitos(tel); if (d.length === 10) d = '52' + d;
  return d.length >= 11 ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : '';
}
export const linkTel = tel => { const d = digitos(tel); return d.length >= 7 ? 'tel:+' + (d.length === 10 ? '52' + d : d) : ''; };
export function edad(nac, hoy = hoyStr()) {
  if (!nac) return null; const n = parse(nac), h = parse(hoy);
  let e = h.getFullYear() - n.getFullYear(); if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e >= 0 && e < 130 ? e : null;
}

export function temaNuevo(prefijo) {
  const a = new Uint8Array(12);
  (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(a);
  return prefijo + '-' + [...a].map(x => (x % 36).toString(36)).join('');
}
export function aCSV(filas) {
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + filas.map(f => f.map(q).join(',')).join('\r\n');
}
