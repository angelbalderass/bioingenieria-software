import { S, $, esc, esAdmin, esStaff, esDentista, toast, errTxt, abrirSheet, cerrarSheet, confirmarClic, renderAll,
  doc, collection, writeBatch, nomCons, consultoriosOrdenados, dentistasOrdenados } from './core.js';

const ESTADOS = { ocupado: 'En uso', libre: 'Sin dentista', mantenimiento: 'En mantenimiento' };
export const setTabAgenda = fn => { irAgenda = fn; };
let irAgenda = () => {};

export function renderConsultorios(root) {
  const lista = consultoriosOrdenados(), adm = esAdmin();
  root.innerHTML = `
    ${adm ? '<div class="toolbar"><button class="btn" type="button" id="k_nuevo" style="margin-left:auto">+ Nuevo consultorio</button></div>' : ''}
    ${!S.cargado.consultorios ? '<p class="vacio">Cargando…</p>' : !lista.length ? `<p class="vacio">${adm ? 'Aún no hay consultorios. Usa “Nuevo consultorio” (o carga los datos de ejemplo desde Cuenta).' : esDentista() ? 'Todavía no tienes un consultorio asignado. Habla con la administración.' : 'Aún no hay consultorios.'}</p>` : ''}
    <div class="kgrid">${lista.map(k => {
      const d = S.dentistas.get(k.dentistaId);
      return `<article class="kcard est-${esc(k.estado)}">
        <header><span class="badge" aria-hidden="true">${esc(k.numero)}</span>
          <div><h3>${esc(nomCons(k))}</h3><p>${esc([k.piso ? 'Piso ' + k.piso : '', k.especialidad || d?.especialidad].filter(Boolean).join(' · ') || '—')}</p></div>
          <span class="pill k-${esc(k.estado)}">${esc(ESTADOS[k.estado] || k.estado)}</span></header>
        <p class="dent">${d ? `<b>${esc(d.nombre)}</b>${d.especialidad ? ' · ' + esc(d.especialidad) : ''}${d.tel && esStaff() ? `<br><span class="muted">${esc(d.tel)}</span>` : ''}` : '<span class="muted">Sin dentista asignado</span>'}</p>
        <div class="row" style="margin-top:6px"><button class="btn sm" type="button" data-agenda="${esc(k.id)}">Ver agenda</button>
          ${adm ? `<button class="btn sm sec" type="button" data-edit="${esc(k.id)}">Editar</button>` : ''}</div>
      </article>`;
    }).join('')}</div>`;
  root.onclick = ev => {
    if (ev.target.closest('#k_nuevo')) return formConsultorio(null);
    const e = ev.target.closest('[data-edit]'); if (e) return formConsultorio(e.dataset.edit);
    const a = ev.target.closest('[data-agenda]'); if (a) { S.filtroCons = a.dataset.agenda; irAgenda(); }
  };
}

/* ===== Alta / edición (solo administración) ===== */
function formConsultorio(id) {
  const k = id ? S.consultorios.get(id) : null;
  const dent = dentistasOrdenados().filter(d => d.activo !== false || (k && k.dentistaId === d.id));
  abrirSheet(k ? `Editar ${nomCons(k)}` : 'Nuevo consultorio', `<form class="card" id="formK" autocomplete="off">
    <div class="fgrid">
      <div class="field"><label for="k_num">Número</label><input id="k_num" required maxlength="6" value="${esc(k ? k.numero : '')}"></div>
      <div class="field"><label for="k_piso">Piso</label><input id="k_piso" maxlength="6" value="${esc(k ? k.piso || '' : '')}"></div>
      <div class="field full"><label for="k_esp">Especialidad del consultorio</label><input id="k_esp" maxlength="60" placeholder="Ortodoncia, Endodoncia…" value="${esc(k ? k.especialidad || '' : '')}"></div>
      <div class="field"><label for="k_estado">Estado</label><select id="k_estado">${Object.entries(ESTADOS).map(([v, t]) => `<option value="${v}"${(k ? k.estado : 'libre') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="k_dent">Dentista asignado</label><select id="k_dent"><option value="">— Sin asignar —</option>${dent.map(d => `<option value="${esc(d.id)}"${k && k.dentistaId === d.id ? ' selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
        <span class="hint">Un mismo dentista puede atender en varios consultorios.</span></div>
    </div>
    <p class="hint err" id="k_err" role="alert" style="min-height:1.4em;margin:10px 0 0"></p>
    <div class="row" style="margin-top:8px"><button class="btn" type="submit" id="k_guardar">Guardar</button><button class="btn sec" type="button" id="k_cancel">Cerrar</button>
      ${k ? '<button class="btn sec" type="button" id="k_borrar" style="margin-left:auto">Eliminar</button>' : ''}</div>
  </form>`);
  $('#k_cancel').onclick = cerrarSheet;
  const sel = $('#k_dent'), est = $('#k_estado');
  sel.onchange = () => { if (sel.value && est.value === 'libre') est.value = 'ocupado'; if (!sel.value && est.value === 'ocupado') est.value = 'libre'; };
  const borrar = $('#k_borrar');
  if (borrar) borrar.onclick = () => confirmarClic(borrar, '¿Eliminar consultorio?', async () => {
    try { const b = writeBatch(S.db); b.delete(doc(S.db, 'consultorios', id)); await b.commit(); toast('Consultorio eliminado.'); cerrarSheet(); } catch (e) { toast(errTxt(e), true); }
  });
  $('#formK').onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#k_err'), btn = $('#k_guardar'); err.textContent = '';
    const numero = $('#k_num').value.trim(), dentistaIn = sel.value, estado = est.value;
    if (!numero) { err.textContent = 'Escribe el número del consultorio.'; return; }
    if ([...S.consultorios.values()].some(x => x.id !== id && String(x.numero) === numero)) { err.textContent = `Ya existe el consultorio ${numero}.`; return; }
    if (estado === 'ocupado' && !dentistaIn) { err.textContent = 'Para marcarlo “en uso” elige un dentista (o cambia el estado).'; return; }
    const dentistaId = estado === 'libre' ? '' : dentistaIn;
    const ref = id ? doc(S.db, 'consultorios', id) : doc(collection(S.db, 'consultorios'));
    btn.disabled = true;
    try {
      const b = writeBatch(S.db);
      b.set(ref, { numero, piso: $('#k_piso').value.trim(), especialidad: $('#k_esp').value.trim(), estado, dentistaId, ...(k && k.ejemplo ? { ejemplo: true } : {}) });
      await b.commit();
      toast('Consultorio guardado.'); cerrarSheet(); renderAll();
    } catch (e) { err.textContent = errTxt(e); btn.disabled = false; }
  };
}

/* Abre la agenda (opcionalmente filtrada por un consultorio) desde otras secciones */
export const irAAgenda = id => { S.filtroCons = id || ''; irAgenda(); };
