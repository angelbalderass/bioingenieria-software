import { S, $, $$, esc, esAdmin, esStaff, esDentista, toast, errTxt, abrirSheet, cerrarSheet, confirmarClic, renderAll, norm,
  doc, collection, query, where, getDocs, updateDoc, deleteDoc, writeBatch, nomCons, consultoriosOrdenados, pacientesOrdenados, avisarLlegada } from './core.js';
import { ESTADOS_CITA, buscarTraslape, hoyStr, sumaDias, sumaMeses, mesDe, semanasDelMes, fmtDiaLargo, fmtMes, fmtHora12, minutosHora, horaDeMinutos, linkWhatsApp, linkTel } from './util.js';

const INACTIVAS = ['cancelada', 'no_vino'];
export const kClase = id => 'k' + (Math.max(0, consultoriosOrdenados().findIndex(k => k.id === id)) % 4);   // color de cada consultorio (4 colores del logo)
const getCita = id => S.citas.get(id) || S.citasExtra.get(id);
const todasLasCitas = () => [...S.citas.values(), ...S.citasExtra.values()];
const citasDelDia = f => todasLasCitas().filter(c => c.fecha === f);

/* Días anteriores a lo que se carga en vivo (mes pasado): se piden una sola vez al abrirlos. */
function asegurarDia(f) {
  if (!S.corte || f >= S.corte || S.diasCargados.has(f)) return;
  S.diasCargados.add(f);
  const filtros = [where('fecha', '==', f), ...(esDentista() ? [where('dentistaId', '==', S.perfil.dentistaId)] : [])];
  getDocs(query(collection(S.db, 'citas'), ...filtros))
    .then(sn => { sn.docs.forEach(d => S.citasExtra.set(d.id, { ...d.data(), id: d.id })); renderAll(true); })
    .catch(e => { S.diasCargados.delete(f); toast(errTxt(e), true); });
}
function recargarDia(f) {   // tras editar una cita de un día "viejo"
  if (f < (S.corte || '')) { S.diasCargados.delete(f); [...S.citasExtra].forEach(([id, c]) => { if (c.fecha === f) S.citasExtra.delete(id); }); }
}

export function renderAgenda(root) {
  const f = S.fecha, hoy = hoyStr(), esHoy = f === hoy, vista = S.vista === 'mes' ? 'mes' : 'dia';
  const ks = consultoriosOrdenados(), multi = ks.length > 1;
  if (S.filtroCons && !S.consultorios.has(S.filtroCons)) S.filtroCons = '';
  if (!S.mesCal) S.mesCal = mesDe(f);
  asegurarDia(f);

  let citas = citasDelDia(f);
  if (S.filtroCons) citas = citas.filter(c => c.consultorioId === S.filtroCons);
  citas.sort((a, b) => a.hora.localeCompare(b.hora));
  const cols = ks.filter(k => !S.filtroCons || k.id === S.filtroCons).map(k => ({
    cls: kClase(k.id), titulo: nomCons(k),
    sub: [S.dentistas.get(k.dentistaId)?.nombre, k.especialidad || S.dentistas.get(k.dentistaId)?.especialidad].filter(Boolean).join(' · ') || 'Sin dentista asignado',
    items: citas.filter(c => c.consultorioId === k.id)
  }));
  const conocidos = new Set(cols.flatMap(c => c.items.map(i => i.id)));
  const otros = citas.filter(c => !conocidos.has(c.id));
  if (otros.length) cols.push({ cls: 'k0', titulo: 'Otras citas', sub: 'Consultorio ya no existe', items: otros });
  const activas = citas.filter(c => !INACTIVAS.includes(c.estado)), enSala = citas.filter(c => c.estado === 'llego').length;
  const cargando = !S.cargado.citas;
  const mesMin = mesDe(S.corte || f);

  root.innerHTML = `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Tipo de vista">
        <button type="button" class="segb" data-vista="dia" aria-pressed="${vista === 'dia'}">Día</button>
        <button type="button" class="segb" data-vista="mes" aria-pressed="${vista === 'mes'}">Calendario</button>
      </div>
      <div class="datenav">
        ${vista === 'dia' ? `
        <button class="btn sec sm" type="button" data-nav="-1" aria-label="Día anterior">‹</button>
        <input id="ag_fecha" type="date" value="${esc(f)}" aria-label="Día de la agenda">
        <button class="btn sec sm" type="button" data-nav="1" aria-label="Día siguiente">›</button>`
        : `
        <button class="btn sec sm" type="button" data-nav="-1" aria-label="Mes anterior"${S.mesCal <= mesMin ? ' disabled' : ''}>‹</button>
        <b class="mesnom" id="ag_mes">${esc(fmtMes(S.mesCal))}</b>
        <button class="btn sec sm" type="button" data-nav="1" aria-label="Mes siguiente">›</button>`}
        <button class="btn sec sm" type="button" data-nav="0"${esHoy && (vista === 'dia' || S.mesCal === mesDe(hoy)) ? ' disabled' : ''}>Hoy</button>
      </div>
      <button class="btn btn-nueva" type="button" id="ag_nueva">+ Nueva cita</button>
    </div>
    ${multi ? `<div class="chips" role="group" aria-label="Filtrar por consultorio">
      <button type="button" class="chip" data-cons="" aria-pressed="${!S.filtroCons}">Todos</button>
      ${ks.map(k => `<button type="button" class="chip" data-cons="${esc(k.id)}" aria-pressed="${S.filtroCons === k.id}"><i class="kdot ${kClase(k.id)}"></i>${esc(nomCons(k))}</button>`).join('')}</div>` : ''}
    ${vista === 'mes' ? calendarioHTML(ks) : ''}
    <h2 class="diatit" id="ag_titulo">${esc(fmtDiaLargo(f))}${esHoy ? ' <span class="chiphoy">Hoy</span>' : ''}</h2>
    <p class="hint" style="margin:0 0 16px">${cargando ? 'Cargando citas…' : `${activas.length} ${activas.length === 1 ? 'cita' : 'citas'}${enSala ? ` · <b>${enSala} en sala de espera</b>` : ''}`}</p>
    <div class="cols">${cols.map(c => `
      <section class="col ${c.cls}"><header><h3>${esc(c.titulo)}</h3><p>${esc(c.sub)}</p></header>
        ${c.items.length ? c.items.map(citaHTML).join('') : '<p class="vacio">Sin citas</p>'}
      </section>`).join('')}</div>
    <button class="fab" type="button" id="ag_fab">+ Nueva cita</button>`;

  root.onclick = ev => {
    const v = ev.target.closest('[data-vista]');
    if (v) { S.vista = v.dataset.vista; S.mesCal = mesDe(S.fecha); renderAll(); return; }
    const ch = ev.target.closest('[data-cons]');
    if (ch) { S.filtroCons = ch.dataset.cons; renderAll(); return; }
    const dia = ev.target.closest('[data-dia]');
    if (dia) { S.fecha = dia.dataset.dia; S.mesCal = mesDe(S.fecha); renderAll(); setTimeout(() => { const t = $('#ag_titulo'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); return; }
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      const n = Number(nav.dataset.nav);
      if (S.vista === 'mes') { S.mesCal = n === 0 ? mesDe(hoy) : sumaMeses(S.mesCal, n); S.fecha = n === 0 ? hoy : (S.mesCal === mesDe(hoy) ? hoy : S.mesCal + '-01'); }
      else { S.fecha = n === 0 ? hoy : sumaDias(S.fecha, n); S.mesCal = mesDe(S.fecha); }
      renderAll(); return;
    }
    if (ev.target.closest('#ag_nueva, #ag_fab')) { formCita(null); return; }
    const b = ev.target.closest('button[data-act]');
    if (b) accion(b.dataset.id, b.dataset.act, b);
  };
  const inp = $('#ag_fecha', root); if (inp) inp.onchange = e => { if (e.target.value) { S.fecha = e.target.value; S.mesCal = mesDe(S.fecha); renderAll(); } };
}

/* ===== Calendario del mes: puntos de color por consultorio y total de citas de cada día ===== */
function calendarioHTML(ks) {
  const mes = S.mesCal, hoy = hoyStr(), conteo = new Map();
  for (const c of S.citas.values()) {
    if (INACTIVAS.includes(c.estado) || (S.filtroCons && c.consultorioId !== S.filtroCons)) continue;
    const m = conteo.get(c.fecha) || new Map(); m.set(c.consultorioId, (m.get(c.consultorioId) || 0) + 1); conteo.set(c.fecha, m);
  }
  const dias = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  return `<section class="cal" aria-label="Calendario de ${esc(fmtMes(mes))}">
    <div class="cal-h" aria-hidden="true">${dias.map(d => `<span>${d}</span>`).join('')}</div>
    ${semanasDelMes(mes).map(sem => `<div class="cal-w">${sem.map(({ f, dentro }) => {
      const m = conteo.get(f), total = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
      const dots = m ? [...m.keys()].map(id => `<i class="kdot ${kClase(id)}"></i>`).join('') : '';
      return `<button type="button" class="cal-d${dentro ? '' : ' fuera'}${f === hoy ? ' hoy' : ''}${f === S.fecha ? ' sel' : ''}" data-dia="${f}" aria-label="${esc(fmtDiaLargo(f))}: ${total} ${total === 1 ? 'cita' : 'citas'}"${f === S.fecha ? ' aria-current="date"' : ''}>
        <span class="cal-num">${Number(f.slice(8))}</span><span class="cal-dots">${dots}</span>${total ? `<span class="cal-n">${total}</span>` : ''}</button>`;
    }).join('')}</div>`).join('')}
    ${ks.length > 1 ? `<p class="cal-leyenda">${ks.map(k => `<span><i class="kdot ${kClase(k.id)}"></i>${esc(nomCons(k))}</span>`).join('')}</p>` : ''}
  </section>`;
}

function citaHTML(c) {
  const st = c.estado || 'programada', staff = esStaff(), adm = esAdmin(), den = esDentista();
  const btn = (act, txt, cls = '') => `<button class="btn sm ${cls}" type="button" data-act="${act}" data-id="${esc(c.id)}">${txt}</button>`;
  const a = [];
  if (st === 'programada') {
    if (staff) a.push(btn('llego', 'Llegó'));
    if (den || adm) a.push(btn('iniciar', 'Iniciar consulta', staff ? 'sec' : ''));
    a.push(btn('novino', 'No asistió', 'sec'));
    if (staff) a.push(btn('cancelar', 'Cancelar', 'sec'));
  } else if (st === 'llego') {
    if (den || adm) a.push(btn('iniciar', 'Iniciar consulta'));
    if (staff) a.push(btn('cancelar', 'Cancelar', 'sec'));
  } else if (st === 'en_consulta') {
    if (den || adm) a.push(btn('terminar', 'Terminar consulta'));
  }
  if (staff) a.push(btn('editar', 'Editar', 'sec'));
  const wa = staff && st === 'programada' ? linkWhatsApp(c.tel, `Hola ${String(c.paciente).split(' ')[0]}, le recordamos su cita en ${S.clinica.nombre || 'Equianza'} el ${fmtDiaLargo(c.fecha)} a las ${fmtHora12(c.hora)}. ¡Le esperamos!`) : '';
  if (wa) a.push(`<a class="btn sm sec" href="${esc(wa)}" target="_blank" rel="noopener">Recordar por WhatsApp</a>`);
  const fin = minutosHora(c.hora) + Number(c.duracion || 30), tel = linkTel(c.tel);
  return `<article class="cita st-${esc(st)}">
    <div class="hora"><b>${esc(fmtHora12(c.hora))}</b><small>a ${esc(fmtHora12(horaDeMinutos(fin)))}</small></div>
    <div class="cuerpo"><b class="pac">${esc(c.paciente)}</b>
      <span class="sub">${esc(c.motivo || '')}${c.motivo && c.tel ? ' · ' : ''}${c.tel ? (tel ? `<a href="${esc(tel)}">${esc(c.tel)}</a>` : esc(c.tel)) : ''}</span>
      ${c.notas ? `<span class="sub nota">${esc(c.notas)}</span>` : ''}
      <span class="pill est-${esc(st)}">${esc(ESTADOS_CITA[st] || st)}</span>${c.avisoPrevio ? ' <span class="tag">Recordatorio enviado</span>' : ''}</div>
    <div class="acc">${a.join('')}</div></article>`;
}

async function accion(id, act, btn) {
  const c = getCita(id); if (!c) return;
  const ref = doc(S.db, 'citas', id), ahora = new Date().toISOString();
  const run = async upd => { btn.disabled = true; try { await updateDoc(ref, upd); recargarDia(c.fecha); return true; } catch (e) { toast(errTxt(e), true); btn.disabled = false; return false; } };
  if (act === 'editar') return formCita(id);
  if (act === 'cancelar') return confirmarClic(btn, '¿Cancelar cita?', async () => { if (await run({ estado: 'cancelada' })) toast('Cita cancelada.'); });
  if (act === 'novino') return confirmarClic(btn, '¿No asistió?', async () => { if (await run({ estado: 'no_vino' })) toast('Marcada como no asistió.'); });
  if (act === 'llego') { if (await run({ estado: 'llego', llegoEn: ahora })) { avisarLlegada(c); toast(`Llegada de ${c.paciente} registrada. Se avisó al celular.`); } return; }
  if (act === 'iniciar') { await run({ estado: 'en_consulta' }); return; }
  if (act === 'terminar') { if (await run({ estado: 'atendida', atendidaEn: ahora })) toast('Consulta terminada.'); }
}

/* ===== Formulario de cita (también se abre desde la ficha del paciente: pre = { paciente, pacienteId, tel }) ===== */
export function formCita(id, pre = {}) {
  const c = id ? getCita(id) : null, staff = esStaff();
  const ocup = consultoriosOrdenados().filter(k => k.dentistaId && S.dentistas.get(k.dentistaId));
  if (!ocup.length) { toast(staff ? 'Primero asigna un dentista a un consultorio.' : 'Aún no tienes un consultorio asignado.', true); return; }
  const ah = new Date(), mm = Math.ceil(ah.getMinutes() / 30) * 30;
  const horaDef = c ? c.hora : horaDeMinutos(Math.min(ah.getHours() * 60 + mm, 20 * 60));
  const consSel = c ? c.consultorioId : (S.filtroCons && ocup.find(k => k.id === S.filtroCons) ? S.filtroCons : ocup[0].id);
  const verCons = staff || ocup.length > 1;
  const opts = ocup.map(k => `<option value="${esc(k.id)}"${k.id === consSel ? ' selected' : ''}>${esc(nomCons(k))} · ${esc(S.dentistas.get(k.dentistaId).nombre)}</option>`).join('');
  let pacienteId = c ? c.pacienteId || '' : pre.pacienteId || '';
  abrirSheet(c ? 'Editar cita' : 'Nueva cita', `<form class="card" id="formCita" autocomplete="off">
    <div class="fgrid">
      <div class="field full"><label for="c_pac">Paciente (escribe para buscar en el directorio)</label>
        <input id="c_pac" list="dl_pac" required maxlength="80" autocomplete="off" value="${esc(c ? c.paciente : pre.paciente || '')}">
        <datalist id="dl_pac">${pacientesOrdenados().map(p => `<option value="${esc(p.nombre)}">${esc(p.tel || '')}</option>`).join('')}</datalist>
        <span class="hint" id="c_pachint"></span></div>
      <div class="field"><label for="c_tel">Teléfono</label><input id="c_tel" type="tel" inputmode="tel" maxlength="20" value="${esc(c ? c.tel || '' : pre.tel || '')}"></div>
      <div class="field"><label for="c_mot">Motivo</label><input id="c_mot" maxlength="80" placeholder="Limpieza, revisión…" value="${esc(c ? c.motivo || '' : '')}"></div>
      ${verCons ? `<div class="field full"><label for="c_cons">Consultorio y dentista</label><select id="c_cons">${opts}</select></div>` : ''}
      <div class="field"><label for="c_fecha">Día</label><input id="c_fecha" type="date" required value="${esc(c ? c.fecha : S.fecha)}"></div>
      <div class="field"><label for="c_hora">Hora</label><input id="c_hora" type="time" step="900" required value="${esc(horaDef)}"></div>
      <div class="field"><label for="c_dur">Duración</label><select id="c_dur">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}"${m === Number(c ? c.duracion : 30) ? ' selected' : ''}>${m} min</option>`).join('')}</select></div>
      ${c ? `<div class="field"><label for="c_est">Estado</label><select id="c_est">${Object.entries(ESTADOS_CITA).map(([k, v]) => `<option value="${k}"${k === c.estado ? ' selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
      <div class="field full"><label for="c_not">Notas</label><textarea id="c_not" maxlength="300">${esc(c ? c.notas || '' : '')}</textarea></div>
      ${staff ? '<label class="chk full" id="c_guardarw" hidden><input type="checkbox" id="c_guardarpac" checked> Guardar a este paciente en el directorio</label>' : ''}
    </div>
    <p class="hint err" id="c_err" role="alert" style="min-height:1.4em;margin:10px 0 0"></p>
    <div class="row" style="margin-top:8px"><button class="btn" type="submit" id="c_guardar">${c ? 'Guardar cambios' : 'Guardar cita'}</button><button class="btn sec" type="button" id="c_cancel">Cerrar</button>
      ${c && esAdmin() ? '<button class="btn sec" type="button" id="c_borrar" style="margin-left:auto">Borrar</button>' : ''}</div>
  </form>`);
  $('#c_cancel').onclick = cerrarSheet;

  // Ligar con el directorio: si el nombre coincide con un paciente guardado, se usa su ficha.
  const vincular = () => {
    const n = norm($('#c_pac').value.trim()), p = n ? pacientesOrdenados().find(x => norm(x.nombre) === n) : null;
    pacienteId = p ? p.id : '';
    if (p && !$('#c_tel').value && p.tel) $('#c_tel').value = p.tel;
    $('#c_pachint').textContent = p ? '✔ Paciente del directorio' : n ? 'Paciente nuevo (no está en el directorio)' : '';
    const w = $('#c_guardarw'); if (w) w.hidden = !!p || !n;
  };
  $('#c_pac').addEventListener('input', vincular); $('#c_pac').addEventListener('change', vincular); vincular();
  const borrar = $('#c_borrar');
  if (borrar) borrar.onclick = () => confirmarClic(borrar, '¿Borrar para siempre?', async () => { try { await deleteDoc(doc(S.db, 'citas', id)); recargarDia(c.fecha); toast('Cita borrada.'); cerrarSheet(); renderAll(); } catch (e) { toast(errTxt(e), true); } });

  $('#formCita').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#c_guardar'), err = $('#c_err'); err.textContent = '';
    const consultorioId = verCons ? $('#c_cons').value : (c ? c.consultorioId : ocup[0].id);
    const k = S.consultorios.get(consultorioId), dentistaId = staff ? k.dentistaId : S.perfil.dentistaId;
    const datos = { fecha: $('#c_fecha').value, hora: $('#c_hora').value, duracion: Number($('#c_dur').value), consultorioId, dentistaId,
      paciente: $('#c_pac').value.trim(), pacienteId, tel: $('#c_tel').value.trim(), motivo: $('#c_mot').value.trim(), notas: $('#c_not').value.trim() };
    if (!datos.paciente) { err.textContent = 'Escribe el nombre del paciente.'; return; }
    if (!datos.fecha || !datos.hora) { err.textContent = 'Elige el día y la hora.'; return; }
    const estado = c ? $('#c_est').value : 'programada';
    if (!INACTIVAS.includes(estado)) {
      const choque = buscarTraslape(todasLasCitas(), datos, id);
      if (choque) { err.textContent = `Ese horario se cruza con la cita de ${choque.paciente} (${fmtHora12(choque.hora)}). Elige otra hora.`; return; }
    }
    btn.disabled = true;
    try {
      const b = writeBatch(S.db), g = $('#c_guardarpac');
      if (staff && !pacienteId && g && g.checked && !$('#c_guardarw').hidden) {   // paciente nuevo → directorio
        const pref = doc(collection(S.db, 'pacientes'));
        b.set(pref, { nombre: datos.paciente, tel: datos.tel, correo: '', nacimiento: '', notas: '', creado: new Date().toISOString(), creadoPor: S.user.uid });
        datos.pacienteId = pref.id;
      }
      if (c) {
        const cambioHora = c.fecha !== datos.fecha || c.hora !== datos.hora;
        b.update(doc(S.db, 'citas', id), { ...datos, estado, ...(cambioHora || estado === 'programada' && c.estado !== 'programada' ? { avisoPrevio: false } : {}) });
      } else {
        b.set(doc(collection(S.db, 'citas')), { ...datos, estado, avisoPrevio: false, creada: new Date().toISOString(), creadaPor: S.user.uid });
      }
      await b.commit();
      recargarDia(datos.fecha); if (c) recargarDia(c.fecha);
      toast(c ? 'Cita actualizada.' : 'Cita guardada.');
      S.fecha = datos.fecha; S.mesCal = mesDe(S.fecha); cerrarSheet(); renderAll();
    } catch (e) { err.textContent = errTxt(e); btn.disabled = false; }
  };
}
