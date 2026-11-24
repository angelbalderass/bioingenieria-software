import { S, $, esc, renderAll, toast, errTxt, descargar, collection, query, where, getDocs, nomCons, consultoriosOrdenados, dentistasOrdenados } from './core.js';
import { hoyStr, mesDe, fmtMes, fmtHora12, fmtDiaLargo, ESTADOS_CITA, aCSV } from './util.js';
import { kClase } from './agenda.js';
import { irAAgenda } from './consultorios.js';

const INACT = ['cancelada', 'no_vino'];
const PILL = { programada: 'Programada', llego: 'En sala', en_consulta: 'En consulta', atendida: 'Atendida', cancelada: 'Cancelada', no_vino: 'No asistió' };

/* ===== Resumen: lo primero que ve el dentista principal (administración) ===== */
export function renderResumen(root) {
  const hoy = hoyStr(), ks = consultoriosOrdenados();
  const hoyCitas = [...S.citas.values()].filter(c => c.fecha === hoy).sort((a, b) => a.hora.localeCompare(b.hora));
  const activas = hoyCitas.filter(c => !INACT.includes(c.estado)), enSala = activas.filter(c => c.estado === 'llego').length;
  const proxima = activas.find(c => c.estado === 'programada' && c.hora >= new Date().toTimeString().slice(0, 5));
  root.innerHTML = `
    <h2 class="diatit">${esc(fmtDiaLargo(hoy))} <span class="chiphoy">Hoy</span></h2>
    <div class="stats" style="margin-top:14px">
      <div class="stat"><span>Citas hoy</span><b>${S.cargado.citas ? activas.length : '…'}${enSala ? `<small> · ${enSala} en sala</small>` : ''}</b></div>
      <div class="stat"><span>Próxima cita</span><b>${proxima ? esc(fmtHora12(proxima.hora)) : '—'}${proxima ? `<small> · ${esc(proxima.paciente)}</small>` : ''}</b></div>
      <div class="stat"><span>Consultorios en uso</span><b>${ks.filter(k => k.estado === 'ocupado').length} <small>de ${ks.length}</small></b></div>
      <div class="stat"><span>Pacientes en el directorio</span><b>${S.cargado.pacientes ? S.pacientes.size : '…'}</b></div>
    </div>
    <div class="cols">${ks.map(k => {
      const d = S.dentistas.get(k.dentistaId), items = hoyCitas.filter(c => c.consultorioId === k.id);
      return `<section class="col ${kClase(k.id)}"><header><h3>${esc(nomCons(k))}</h3><p>${esc([d?.nombre, k.especialidad || d?.especialidad].filter(Boolean).join(' · ') || 'Sin dentista asignado')}</p></header>
        ${items.length ? items.slice(0, 6).map(c => `<div class="mini st-${esc(c.estado)}"><b class="hh">${esc(fmtHora12(c.hora))}</b><span>${esc(c.paciente)}</span><span class="pill est-${esc(c.estado)}">${esc(PILL[c.estado] || c.estado)}</span></div>`).join('')
          + (items.length > 6 ? `<p class="hint">y ${items.length - 6} más</p>` : '') : `<p class="vacio">${S.cargado.citas ? 'Sin citas hoy' : 'Cargando…'}</p>`}
        <button class="btn sm sec" type="button" data-agenda="${esc(k.id)}">Ver agenda completa</button></section>`;
    }).join('')}</div>`;
  root.onclick = ev => { const b = ev.target.closest('[data-agenda]'); if (b) irAAgenda(b.dataset.agenda); };
}

/* ===== Reportes del mes (citas, no dinero) ===== */
function citasDeMes(mes) {
  if (mes >= mesDe(S.corte || hoyStr())) return [...S.citas.values()].filter(c => mesDe(c.fecha) === mes);   // ya están cargadas en vivo
  if (S.citasMes.has(mes)) return S.citasMes.get(mes);
  if (!S.citasMes.has('cargando:' + mes)) {
    S.citasMes.set('cargando:' + mes, true);
    getDocs(query(collection(S.db, 'citas'), where('fecha', '>=', mes + '-01'), where('fecha', '<=', mes + '-31')))
      .then(sn => { S.citasMes.set(mes, sn.docs.map(d => ({ ...d.data(), id: d.id }))); renderAll(true); })
      .catch(e => { S.citasMes.delete('cargando:' + mes); toast(errTxt(e), true); });
  }
  return null;
}

export function renderReportes(root) {
  const mes = S.mesReporte || hoyStr().slice(0, 7), cs = citasDeMes(mes), ks = consultoriosOrdenados();
  const cuenta = (arr, est) => arr.filter(c => c.estado === est).length;
  const filas = cs ? ks.map(k => {
    const a = cs.filter(c => c.consultorioId === k.id), d = S.dentistas.get(k.dentistaId);
    const horas = a.filter(c => !INACT.includes(c.estado)).reduce((s, c) => s + (Number(c.duracion) || 30), 0) / 60;
    return { k, d, tot: a.length, ate: cuenta(a, 'atendida'), nov: cuenta(a, 'no_vino'), can: cuenta(a, 'cancelada'), horas };
  }) : [];
  const max = Math.max(1, ...filas.map(f => f.tot));
  const nuevos = [...S.pacientes.values()].filter(p => String(p.creado || '').startsWith(mes)).length;
  const mantenimiento = ks.filter(k => k.estado === 'mantenimiento').length;
  root.innerHTML = `
    <div class="toolbar"><div class="field" style="width:auto"><label for="rp_mes">Mes del reporte</label><input id="rp_mes" type="month" value="${esc(mes)}"></div>
      <button class="btn sec sm" type="button" id="rp_csv" style="margin-left:auto"${cs ? '' : ' disabled'}>Descargar citas del mes (CSV)</button></div>
    ${!cs ? '<p class="vacio">Cargando citas de ese mes…</p>' : `
    <div class="stats">
      <div class="stat"><span>Citas en ${esc(fmtMes(mes))}</span><b>${cs.length}</b></div>
      <div class="stat"><span>Atendidas</span><b>${cuenta(cs, 'atendida')}</b></div>
      <div class="stat ${cuenta(cs, 'no_vino') ? 'rojo' : ''}"><span>No asistieron</span><b>${cuenta(cs, 'no_vino')}</b></div>
      <div class="stat"><span>Canceladas</span><b>${cuenta(cs, 'cancelada')}</b></div>
      <div class="stat"><span>Pacientes nuevos</span><b>${nuevos}</b></div>
    </div>
    <div class="cols2">
      <section class="card"><h3>Citas por consultorio</h3>
        ${filas.length ? filas.map(f => `<div class="hbar"><span class="hn">${esc(nomCons(f.k))}</span><span class="hb"><i class="${kClase(f.k.id)}" style="width:${Math.round(f.tot / max * 100)}%"></i></span><b>${f.tot}</b></div>`).join('') : '<p class="muted">Sin consultorios.</p>'}
      </section>
      <section class="card"><h3>Uso de los consultorios</h3>
        <p>${ks.filter(k => k.estado === 'ocupado').length} de ${ks.length} con dentista asignado${mantenimiento ? ` · ${mantenimiento} en mantenimiento` : ''}.</p>
        <p class="hint" style="margin-top:6px">Horas agendadas en el mes (sin contar canceladas ni inasistencias): ${filas.map(f => `${esc(nomCons(f.k))} <b>${f.horas.toLocaleString('es-MX', { maximumFractionDigits: 1 })} h</b>`).join(' · ')}</p>
      </section>
    </div>
    <section class="card scrollx" style="margin-top:18px"><h3>Por consultorio y dentista · ${esc(fmtMes(mes))}</h3>
      <table><thead><tr><th>Consultorio</th><th>Dentista</th><th class="num">Citas</th><th class="num">Atendidas</th><th class="num">No asistió</th><th class="num">Canceladas</th><th class="num">Horas</th></tr></thead><tbody>
      ${filas.length ? filas.map(f => `<tr><td>${esc(nomCons(f.k))}</td><td><b>${esc(f.d ? f.d.nombre : '—')}</b><div class="hint">${esc(f.d?.especialidad || f.k.especialidad || '')}</div></td><td class="num">${f.tot}</td><td class="num">${f.ate}</td><td class="num">${f.nov}</td><td class="num">${f.can}</td><td class="num">${f.horas.toLocaleString('es-MX', { maximumFractionDigits: 1 })}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">Sin consultorios.</td></tr>'}
      </tbody></table></section>`}`;
  $('#rp_mes', root).onchange = e => { S.mesReporte = e.target.value || null; renderAll(); };
  const csv = $('#rp_csv', root);
  if (csv && cs) csv.onclick = () => descargar(`citas-${mes}.csv`, aCSV([['Fecha', 'Hora', 'Consultorio', 'Dentista', 'Paciente', 'Teléfono', 'Motivo', 'Estado'],
    ...[...cs].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map(c => [c.fecha, c.hora, nomCons(S.consultorios.get(c.consultorioId)), S.dentistas.get(c.dentistaId)?.nombre || '', c.paciente, c.tel || '', c.motivo || '', ESTADOS_CITA[c.estado] || c.estado])]));
}
