import { S, $, esc, norm, esAdmin, esStaff, esDentista, toast, errTxt, abrirSheet, cerrarSheet, confirmarClic, renderAll,
  doc, collection, query, where, getDocs, writeBatch, nomCons, pacientesOrdenados } from './core.js';
import { ESTADOS_CITA, fmtCorta, fmtHora12, edad, linkTel, digitos } from './util.js';
import { formCita } from './agenda.js';

const MAX = 150;   // para no pintar miles de filas: más allá de esto se usa el buscador

export function renderPacientes(root) {
  const todos = pacientesOrdenados(), q = norm(S.busquedaPac || ''), qd = digitos(S.busquedaPac || '');
  const lista = q ? todos.filter(p => norm(p.nombre).includes(q) || (qd.length >= 3 && digitos(p.tel).includes(qd)) || norm(p.correo).includes(q)) : todos;
  const visibles = lista.slice(0, MAX), staff = esStaff();
  root.innerHTML = `
    <div class="toolbar">
      <input id="pa_buscar" type="search" placeholder="Buscar por nombre, teléfono o correo" aria-label="Buscar paciente" value="${esc(S.busquedaPac || '')}" style="flex:1 1 240px">
      ${staff ? '<button class="btn" type="button" id="pa_nuevo">+ Nuevo paciente</button>' : ''}
    </div>
    <p class="hint" style="margin:0 0 12px">${!S.cargado.pacientes ? 'Cargando…' : `${todos.length} ${todos.length === 1 ? 'paciente' : 'pacientes'}${q ? ` · ${lista.length} coinciden` : ''}${lista.length > MAX ? ` · mostrando los primeros ${MAX}; escribe para buscar` : ''}`}</p>
    ${S.cargado.pacientes && !todos.length ? `<p class="vacio">${staff ? 'Aún no hay pacientes. Usa “Nuevo paciente”, o se guardan solos al agendar una cita con un nombre nuevo.' : 'Aún no hay pacientes en el directorio.'}</p>` : ''}
    <div class="plist">${visibles.map(p => {
      const e = edad(p.nacimiento);
      return `<button type="button" class="prow" data-id="${esc(p.id)}"><span class="badge" aria-hidden="true">${esc((p.nombre || '?').charAt(0).toUpperCase())}</span>
        <span class="pnom"><b>${esc(p.nombre)}</b><span class="sub">${esc([p.tel, e !== null ? e + ' años' : ''].filter(Boolean).join(' · ') || 'Sin teléfono')}</span></span>${p.ejemplo ? '<span class="tag">Ejemplo</span>' : ''}</button>`;
    }).join('')}</div>`;
  const b = $('#pa_buscar', root);
  b.oninput = e => { S.busquedaPac = e.target.value; const pos = e.target.selectionStart; renderAll(); const n = $('#pa_buscar'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  root.onclick = ev => {
    if (ev.target.closest('#pa_nuevo')) return formPaciente(null);
    const r = ev.target.closest('.prow'); if (r) fichaPaciente(r.dataset.id);
  };
}

const citasLocales = p => [...S.citas.values(), ...S.citasExtra.values()].filter(c => c.pacienteId === p.id || (!c.pacienteId && norm(c.paciente) === norm(p.nombre)));
function filasHistorial(cs) {
  const s = [...new Map(cs.map(c => [c.id, c])).values()].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  return s.length ? `<div class="scrollx"><table><thead><tr><th>Día</th><th>Consultorio</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>${s.map(c =>
    `<tr><td>${esc(fmtCorta(c.fecha))}<div class="hint">${esc(fmtHora12(c.hora))}</div></td><td>${esc(nomCons(S.consultorios.get(c.consultorioId)))}</td><td>${esc(c.motivo || '')}</td><td><span class="pill est-${esc(c.estado)}">${esc(ESTADOS_CITA[c.estado] || c.estado)}</span></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Sin citas registradas en el período cargado.</p>';
}

function fichaPaciente(id) {
  const p = S.pacientes.get(id); if (!p) return;
  const staff = esStaff(), e = edad(p.nacimiento), tel = linkTel(p.tel);
  abrirSheet(p.nombre, `
    <section class="card"><dl class="det">
      <dt>Teléfono</dt><dd>${p.tel ? (tel ? `<a href="${esc(tel)}">${esc(p.tel)}</a>` : esc(p.tel)) : '<span class="muted">—</span>'}</dd>
      <dt>Correo</dt><dd>${p.correo ? esc(p.correo) : '<span class="muted">—</span>'}</dd>
      <dt>Nacimiento</dt><dd>${p.nacimiento ? `${esc(fmtCorta(p.nacimiento))} ${esc(p.nacimiento.slice(0, 4))}${e !== null ? ` · ${e} años` : ''}` : '<span class="muted">—</span>'}</dd>
      <dt>Notas</dt><dd>${p.notas ? esc(p.notas) : '<span class="muted">—</span>'}</dd></dl>
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="pf_cita">Agendar cita</button>
        ${staff ? '<button class="btn sec" type="button" id="pf_edit">Editar datos</button>' : ''}</div></section>
    <section class="card"><h3>Historial de citas</h3><div id="pf_hist">${filasHistorial(citasLocales(p))}</div>
      <div class="row" style="margin-top:12px"><button class="btn sec sm" type="button" id="pf_todo">Ver historial completo</button></div></section>`);
  $('#pf_cita').onclick = () => { cerrarSheet(); formCita(null, { paciente: p.nombre, pacienteId: p.id, tel: p.tel || '' }); };
  const ed = $('#pf_edit'); if (ed) ed.onclick = () => formPaciente(id);
  $('#pf_todo').onclick = async ev => {
    const btn = ev.target; btn.disabled = true;
    try {
      const f = [where('pacienteId', '==', p.id), ...(esDentista() ? [where('dentistaId', '==', S.perfil.dentistaId)] : [])];
      const sn = await getDocs(query(collection(S.db, 'citas'), ...f));
      $('#pf_hist').innerHTML = filasHistorial([...citasLocales(p), ...sn.docs.map(d => ({ ...d.data(), id: d.id }))]); btn.hidden = true;
    } catch (er) { toast(errTxt(er), true); btn.disabled = false; }
  };
}

/* ===== Alta / edición (recepción y administración) ===== */
export function formPaciente(id) {
  if (!esStaff()) return;
  const p = id ? S.pacientes.get(id) : null, adm = esAdmin();
  abrirSheet(p ? 'Editar paciente' : 'Nuevo paciente', `<form class="card" id="formP" autocomplete="off"><div class="fgrid">
      <div class="field full"><label for="p_nom">Nombre completo</label><input id="p_nom" required maxlength="120" value="${esc(p ? p.nombre : '')}"></div>
      <div class="field"><label for="p_tel">Teléfono (celular)</label><input id="p_tel" type="tel" inputmode="tel" maxlength="20" value="${esc(p ? p.tel || '' : '')}"></div>
      <div class="field"><label for="p_nac">Fecha de nacimiento</label><input id="p_nac" type="date" value="${esc(p ? p.nacimiento || '' : '')}"></div>
      <div class="field full"><label for="p_cor">Correo</label><input id="p_cor" type="email" maxlength="80" value="${esc(p ? p.correo || '' : '')}"></div>
      <div class="field full"><label for="p_not">Notas (alergias, observaciones)</label><textarea id="p_not" maxlength="500">${esc(p ? p.notas || '' : '')}</textarea></div>
    </div>
    <p class="hint err" id="p_err" role="alert" style="min-height:1.4em;margin:10px 0 0"></p>
    <div class="row" style="margin-top:8px"><button class="btn" type="submit" id="p_guardar">Guardar</button><button class="btn sec" type="button" id="p_cancel">Cerrar</button>
      ${p && adm ? '<button class="btn sec" type="button" id="p_borrar" style="margin-left:auto">Eliminar</button>' : ''}</div></form>`);
  $('#p_cancel').onclick = cerrarSheet;
  const borrar = $('#p_borrar');
  if (borrar) borrar.onclick = () => confirmarClic(borrar, '¿Eliminar paciente?', async () => {
    try { const b = writeBatch(S.db); b.delete(doc(S.db, 'pacientes', id)); await b.commit(); toast('Paciente eliminado (sus citas se conservan).'); cerrarSheet(); } catch (e) { toast(errTxt(e), true); }
  });
  $('#formP').onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#p_err'), btn = $('#p_guardar'); err.textContent = '';
    const nombre = $('#p_nom').value.trim();
    if (!nombre) { err.textContent = 'Escribe el nombre del paciente.'; return; }
    if (pacientesOrdenados().some(x => x.id !== id && norm(x.nombre) === norm(nombre))) { err.textContent = 'Ya hay un paciente con ese nombre. Agrega un apellido o dato que los distinga.'; return; }
    btn.disabled = true;
    try {
      const b = writeBatch(S.db), ref = id ? doc(S.db, 'pacientes', id) : doc(collection(S.db, 'pacientes'));
      const { id: _omitir, ...resto } = p || {};
      b.set(ref, { ...(p ? resto : { creado: new Date().toISOString(), creadoPor: S.user.uid }), nombre, tel: $('#p_tel').value.trim(), nacimiento: $('#p_nac').value, correo: $('#p_cor').value.trim(), notas: $('#p_not').value.trim() });
      await b.commit(); toast('Paciente guardado.'); cerrarSheet(); renderAll();
    } catch (e) { err.textContent = errTxt(e); btn.disabled = false; }
  };
}
