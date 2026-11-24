import { S, $, esc, esAdmin, esStaff, toast, errTxt, abrirSheet, cerrarSheet, doc, collection, writeBatch,
  nomCons, consultoriosDe, dentistasOrdenados } from './core.js';
import { temaNuevo } from './util.js';

export function renderDentistas(root) {
  const lista = dentistasOrdenados(), adm = esAdmin();
  root.innerHTML = `
    ${adm ? '<div class="toolbar"><button class="btn" type="button" id="d_nuevo" style="margin-left:auto">+ Nuevo dentista</button></div>' : ''}
    ${!S.cargado.dentistas ? '<p class="vacio">Cargando…</p>' : !lista.length ? '<p class="vacio">Aún no hay dentistas registrados.</p>' : ''}
    <div class="kgrid">${lista.map(d => {
      const ks = consultoriosDe(d.id), us = S.usuarios.filter(u => u.dentistaId === d.id);
      return `<article class="kcard${d.activo === false ? ' inactivo' : ''}">
        <header><span class="badge" aria-hidden="true">${esc((d.nombre || '?').replace(/^(dra?\.?)\s+/i, '').charAt(0).toUpperCase())}</span>
          <div><h3>${esc(d.nombre)}</h3><p>${esc(d.especialidad || 'Sin especialidad')}</p></div>
          ${d.activo === false ? '<span class="pill k-mantenimiento">Inactivo</span>' : ''}</header>
        <dl class="det"><dt>${ks.length > 1 ? 'Consultorios' : 'Consultorio'}</dt><dd>${ks.length ? ks.map(k => esc(nomCons(k)) + (k.piso ? ` (piso ${esc(k.piso)})` : '')).join(', ') : '<span class="muted">Sin consultorio</span>'}</dd>
          ${esStaff() && d.tel ? `<dt>Teléfono</dt><dd>${esc(d.tel)}</dd>` : ''}
          ${esStaff() && d.correo ? `<dt>Correo</dt><dd>${esc(d.correo)}</dd>` : ''}
          ${d.cedula ? `<dt>Cédula</dt><dd>${esc(d.cedula)}</dd>` : ''}
          ${adm ? `<dt>Acceso a la app</dt><dd>${us.length ? us.map(u => esc(u.usuario) + (u.activo === false ? ' (desactivado)' : '')).join(', ') : '<span class="muted">Sin usuario — créalo en Cuenta</span>'}</dd>` : ''}</dl>
        ${adm ? `<div class="row" style="margin-top:12px"><button class="btn sm sec" type="button" data-edit="${esc(d.id)}">Editar</button></div>` : ''}
      </article>`;
    }).join('')}</div>`;
  root.onclick = ev => {
    if (ev.target.closest('#d_nuevo')) return formDentista(null);
    const e = ev.target.closest('[data-edit]'); if (e) formDentista(e.dataset.edit);
  };
}

function formDentista(id) {
  const d = id ? S.dentistas.get(id) : null;
  abrirSheet(d ? 'Editar dentista' : 'Nuevo dentista', `<form class="card" id="formD" autocomplete="off">
    <div class="fgrid">
      <div class="field full"><label for="d_nom">Nombre completo</label><input id="d_nom" required maxlength="80" value="${esc(d ? d.nombre : '')}"></div>
      <div class="field full"><label for="d_esp">Especialidad</label><input id="d_esp" maxlength="60" placeholder="Ortodoncia, Endodoncia…" value="${esc(d ? d.especialidad || '' : '')}"></div>
      <div class="field"><label for="d_tel">Teléfono</label><input id="d_tel" type="tel" inputmode="tel" maxlength="20" value="${esc(d ? d.tel || '' : '')}"></div>
      <div class="field"><label for="d_ced">Cédula profesional</label><input id="d_ced" maxlength="20" value="${esc(d ? d.cedula || '' : '')}"></div>
      <div class="field full"><label for="d_cor">Correo</label><input id="d_cor" type="email" maxlength="80" value="${esc(d ? d.correo || '' : '')}"></div>
      ${d ? `<div class="field full"><label for="d_tema">Tema de avisos al celular (clave privada del dentista)</label><input id="d_tema" readonly value="${esc(d.ntfyTema || '')}"><span class="hint">El dentista lo ve también en su pestaña Cuenta.</span></div>
      <div class="field full"><label for="d_act">Estado</label><select id="d_act"><option value="1"${d.activo !== false ? ' selected' : ''}>Activo</option><option value="0"${d.activo === false ? ' selected' : ''}>Inactivo (también desactiva su usuario)</option></select></div>` : ''}
    </div>
    <p class="hint err" id="d_err" role="alert" style="min-height:1.4em;margin:10px 0 0"></p>
    <div class="row" style="margin-top:8px"><button class="btn" type="submit" id="d_guardar">Guardar</button><button class="btn sec" type="button" id="d_cancel">Cerrar</button>
      ${d ? '<button class="btn sec" type="button" id="d_gen" style="margin-left:auto">Generar tema nuevo</button>' : ''}</div>
  </form>`);
  $('#d_cancel').onclick = cerrarSheet;
  const gen = $('#d_gen'); if (gen) gen.onclick = () => { $('#d_tema').value = temaNuevo('equianza'); };
  $('#formD').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#d_guardar'); btn.disabled = true;
    const activo = d ? $('#d_act').value === '1' : true;
    const datos = { nombre: $('#d_nom').value.trim(), especialidad: $('#d_esp').value.trim(), tel: $('#d_tel').value.trim(), cedula: $('#d_ced').value.trim(),
      correo: $('#d_cor').value.trim(), activo, ntfyTema: d ? ($('#d_tema').value || temaNuevo('equianza')) : temaNuevo('equianza'), ...(d && d.ejemplo ? { ejemplo: true } : {}) };
    try {
      const b = writeBatch(S.db), ref = id ? doc(S.db, 'dentistas', id) : doc(collection(S.db, 'dentistas'));
      b.set(ref, datos);
      if (d && !activo) S.usuarios.filter(u => u.dentistaId === id && u.activo !== false).forEach(u => b.update(doc(S.db, 'usuarios', u.id), { activo: false }));
      await b.commit(); toast('Dentista guardado.'); cerrarSheet();
    } catch (e) { $('#d_err').textContent = errTxt(e); btn.disabled = false; }
  };
}
