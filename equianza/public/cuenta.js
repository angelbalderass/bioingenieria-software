import { S, $, esc, esAdmin, esDentista, toast, errTxt, authErr, toEmail, confirmarClic,
  initializeApp, deleteApp, getAuth, createUserWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  doc, collection, setDoc, updateDoc, writeBatch, dentistasOrdenados, ntfy } from './core.js';
import { hoyStr, sumaDias, temaNuevo } from './util.js';
import { firebaseConfig } from './firebase-config.js';

const ROLES = { admin: 'Administrador', recepcion: 'Recepción', dentista: 'Dentista' };

export function renderCuenta(root) {
  const p = S.perfil, adm = esAdmin();
  const d = esDentista() ? S.dentistas.get(p.dentistaId) : null;
  const n = S.notif || {}, t = S.clinica || {};
  root.innerHTML = `<div class="cols2">
    <section class="card"><h3>Mi cuenta</h3>
      <p style="margin-bottom:14px">Sesión de <b>${esc(p.nombre || p.usuario)}</b> · usuario <b>${esc(p.usuario)}</b> · ${esc(ROLES[p.rol] || p.rol)}</p>
      <form id="formPass" autocomplete="off" class="fgrid">
        <div class="field full"><label for="c_actual">Contraseña actual</label><input id="c_actual" type="password" autocomplete="current-password" required></div>
        <div class="field full"><label for="c_nueva">Contraseña nueva (mínimo 6 caracteres)</label><input id="c_nueva" type="password" autocomplete="new-password" minlength="6" required></div>
        <div class="full"><button class="btn" type="submit" id="c_guardar">Cambiar contraseña</button></div>
      </form></section>
    ${d ? `<section class="card"><h3>Avisos en mi celular</h3>
      <p class="hint" style="margin-bottom:12px">Recibirás un aviso cuando llegue un paciente tuyo y poco antes de cada cita. Usa la app gratuita <b>ntfy</b>.</p>
      <ol class="hint pasos"><li>Instala <b>ntfy</b> (Play Store o App Store).</li><li>Ábrela, toca <b>+</b> y escribe este tema (servidor ntfy.sh).</li><li>Pulsa “Enviar prueba”.</li></ol>
      <div class="field"><label for="dn_tema">Tu tema (es tu clave: no lo compartas)</label><input id="dn_tema" readonly value="${esc(d.ntfyTema || '')}"></div>
      <div class="row" style="margin-top:12px"><button class="btn sec" type="button" id="dn_prueba"${d.ntfyTema ? '' : ' disabled'}>Enviar prueba</button></div></section>` : ''}
    ${adm ? `
    <section class="card"><h3>Usuarios del sistema</h3>
      <div class="scrollx"><table><thead><tr><th>Usuario</th><th>Rol</th><th></th></tr></thead><tbody>
        ${S.usuarios.length ? [...S.usuarios].sort((a, b) => String(a.usuario).localeCompare(String(b.usuario))).map(u => { const yo = u.id === S.user.uid;
          return `<tr><td>${esc(u.usuario)}<div class="hint">${esc(u.nombre || '')}${u.dentistaId && S.dentistas.get(u.dentistaId) ? ' · ' + esc(S.dentistas.get(u.dentistaId).nombre) : ''}${yo ? ' · (tú)' : ''}${u.activo === false ? ' · <b>desactivado</b>' : ''}</div></td><td>${esc(ROLES[u.rol] || u.rol)}</td>
          <td>${yo ? '' : `<button class="btn sec sm" type="button" data-uid="${esc(u.id)}" data-act="${u.activo === false ? '1' : '0'}">${u.activo === false ? 'Activar' : 'Desactivar'}</button>`}</td></tr>`; }).join('') : '<tr><td colspan="3" class="muted">Cargando…</td></tr>'}
      </tbody></table></div>
      <form id="formUsuario" autocomplete="off" class="fgrid" style="margin-top:16px">
        <div class="field"><label for="u_nombre">Nombre</label><input id="u_nombre" required></div>
        <div class="field"><label for="u_user">Usuario</label><input id="u_user" autocapitalize="none" spellcheck="false" required><span class="hint">Minúsculas, sin espacios</span></div>
        <div class="field"><label for="u_pass">Contraseña (mínimo 6)</label><input id="u_pass" type="text" minlength="6" autocomplete="off" required></div>
        <div class="field"><label for="u_rol">Rol</label><select id="u_rol"><option value="recepcion">Recepción</option><option value="dentista">Dentista</option><option value="admin">Administrador</option></select></div>
        <div class="field full" id="u_dw" hidden><label for="u_dent">Dentista de este usuario</label><select id="u_dent"><option value="">— Elige —</option>${dentistasOrdenados().map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></div>
        <div class="full"><button class="btn" type="submit" id="u_guardar">Crear usuario</button></div>
      </form>
      <p class="hint" style="margin-top:12px">Desactivar un usuario le quita el acceso al instante. Si alguien olvida su contraseña, crea otro usuario para esa persona.</p></section>
    <section class="card"><h3>Avisos del administrador</h3>
      <p class="hint" style="margin-bottom:12px">Tu celular recibe un aviso cada vez que recepción marca la llegada de un paciente. Instala <b>ntfy</b>, toca <b>+</b> y escribe el tema (servidor ntfy.sh).</p>
      <form id="formNotif" autocomplete="off" class="fgrid">
        <div class="field full"><label for="n_tema">Tema (es tu clave: no lo compartas)</label><input id="n_tema" spellcheck="false" readonly value="${esc(n.tema || '')}"></div>
        <div class="field"><label for="n_activo">Avisos (para todos)</label><select id="n_activo"><option value="1"${n.activo !== false ? ' selected' : ''}>Activados</option><option value="0"${n.activo === false ? ' selected' : ''}>Apagados</option></select></div>
        <div class="field"><label for="n_llegadas">Avisarme las llegadas</label><select id="n_llegadas"><option value="1"${n.avisarLlegadas !== false ? ' selected' : ''}>Sí</option><option value="0"${n.avisarLlegadas === false ? ' selected' : ''}>No</option></select></div>
        <div class="field"><label for="n_min">Aviso previo al dentista (minutos antes)</label><input id="n_min" type="number" min="5" max="120" step="5" value="${esc(n.minutosAntes || 15)}"></div>
        <div class="full row"><button class="btn" type="submit" id="n_guardar">Guardar</button><button class="btn sec" type="button" id="n_prueba">Enviar prueba</button><button class="btn sec" type="button" id="n_gen">Generar tema nuevo</button></div>
      </form></section>
    <section class="card"><h3>Datos de la clínica</h3>
      <form id="formClinica" autocomplete="off" class="fgrid">
        <div class="field"><label for="t_nom">Nombre</label><input id="t_nom" required maxlength="60" value="${esc(t.nombre || 'Equianza')}"></div>
        <div class="field"><label for="t_ciu">Ciudad</label><input id="t_ciu" maxlength="60" value="${esc(t.ciudad || '')}"></div>
        <div class="full"><button class="btn" type="submit" id="t_guardar">Guardar</button></div>
      </form></section>
    <section class="card"><h3>Datos de ejemplo</h3>
      <p class="hint" style="margin-bottom:12px">Carga 3 consultorios, 3 dentistas, pacientes y citas de muestra para conocer la app. Después puedes borrarlos con un clic (no toca lo que tú hayas capturado).</p>
      <div class="row"><button class="btn sec" type="button" id="ej_cargar">Cargar ejemplos</button><button class="btn sec" type="button" id="ej_borrar">Borrar ejemplos</button></div></section>` : ''}
  </div>`;
  bind(root);
}

function bind(root) {
  const $r = s => $(s, root);
  $r('#formPass').onsubmit = async ev => {
    ev.preventDefault(); const btn = $r('#c_guardar'); btn.disabled = true;
    try {
      const u = S.auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, $r('#c_actual').value));
      await updatePassword(u, $r('#c_nueva').value);
      $r('#formPass').reset(); toast('Contraseña cambiada.');
    } catch (e) { toast(authErr(e), true); } finally { btn.disabled = false; }
  };
  const dp = $r('#dn_prueba');
  if (dp) dp.onclick = async () => { await ntfy($r('#dn_tema').value, 'Equianza · Prueba', 'Así te llegarán los avisos de pacientes.', 3, ['white_check_mark']); toast('Prueba enviada. Revisa tu celular.'); };
  if (!esAdmin()) return;

  root.querySelectorAll('button[data-uid]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await updateDoc(doc(S.db, 'usuarios', b.dataset.uid), { activo: b.dataset.act === '1' }); toast(b.dataset.act === '1' ? 'Usuario activado.' : 'Usuario desactivado.'); }
    catch (e) { toast(errTxt(e), true); b.disabled = false; }
  });
  const rol = $r('#u_rol'); rol.onchange = () => { $r('#u_dw').hidden = rol.value !== 'dentista'; };
  $r('#formUsuario').onsubmit = crearUsuario;

  const fn = $r('#formNotif');
  $r('#n_gen').onclick = () => { $r('#n_tema').value = temaNuevo('equianza-admin'); };
  fn.onsubmit = async ev => {
    ev.preventDefault(); const btn = $r('#n_guardar'); btn.disabled = true;
    try {
      if (!$r('#n_tema').value) $r('#n_tema').value = temaNuevo('equianza-admin');
      await setDoc(doc(S.db, 'config', 'notificaciones'), { tema: $r('#n_tema').value, activo: $r('#n_activo').value === '1', avisarLlegadas: $r('#n_llegadas').value === '1', minutosAntes: Math.min(120, Math.max(5, Number($r('#n_min').value) || 15)) });
      toast('Avisos guardados.');
    } catch (e) { toast(errTxt(e), true); } finally { btn.disabled = false; }
  };
  $r('#n_prueba').onclick = async () => {
    const tema = $r('#n_tema').value; if (!tema) { toast('Primero pulsa “Guardar” para crear el tema.', true); return; }
    await ntfy(tema, 'Equianza · Prueba', 'Así te llegará el aviso cuando llegue un paciente.', 3, ['white_check_mark']); toast('Prueba enviada. Revisa tu celular.');
  };
  $r('#formClinica').onsubmit = async ev => {
    ev.preventDefault(); const btn = $r('#t_guardar'); btn.disabled = true;
    try { await setDoc(doc(S.db, 'config', 'clinica'), { nombre: $r('#t_nom').value.trim() || 'Equianza', ciudad: $r('#t_ciu').value.trim() }); toast('Datos guardados.'); }
    catch (e) { toast(errTxt(e), true); } finally { btn.disabled = false; }
  };
  $r('#ej_cargar').onclick = cargarEjemplos;
  const eb = $r('#ej_borrar'); eb.onclick = () => confirmarClic(eb, '¿Borrar ejemplos?', borrarEjemplos);
}

async function crearUsuario(ev) {
  ev.preventDefault();
  if (!esAdmin()) return;
  const nombre = $('#u_nombre').value.trim(), user = $('#u_user').value.trim().toLowerCase(), pass = $('#u_pass').value, rol = $('#u_rol').value, dentistaId = $('#u_dent').value;
  if (!/^[a-z0-9._-]{3,30}$/.test(user)) { toast('El usuario va en minúsculas, sin espacios (3 a 30 letras, números, punto o guion).', true); return; }
  if (rol === 'dentista' && !dentistaId) { toast('Elige a qué dentista pertenece este usuario.', true); return; }
  const btn = $('#u_guardar'); btn.disabled = true;
  const sec = initializeApp(firebaseConfig, 'sec' + Date.now());   // segunda conexión: no cierra tu sesión
  try {
    const a = getAuth(sec);
    const cred = await createUserWithEmailAndPassword(a, toEmail(user), pass);
    try {
      await setDoc(doc(S.db, 'usuarios', cred.user.uid), { usuario: user, nombre, rol, activo: true, creado: new Date().toISOString(), ...(rol === 'dentista' ? { dentistaId } : {}) });
    } catch (e) { toast('Se creó la cuenta pero no su perfil. Intenta con otro usuario.', true); return; }
    await signOut(a);
    $('#formUsuario').reset(); toast(`Usuario ${user} creado.`);
  } catch (e) { toast(authErr(e), true); }
  finally { btn.disabled = false; deleteApp(sec).catch(() => {}); }
}

/* ===== Datos de ejemplo ===== */
async function cargarEjemplos() {
  try {
    const hoy = hoyStr(), b = writeBatch(S.db), ej = { ejemplo: true };
    const D = [['ej-d1', 'Dra. Valeria Ríos', 'Ortodoncia', '55 5550 0101'], ['ej-d2', 'Dr. Andrés Salgado', 'Endodoncia', '55 5550 0102'], ['ej-d3', 'Dra. Mariana Cuevas', 'Odontopediatría', '55 5550 0103']];
    D.forEach(([id, nombre, especialidad, tel]) => b.set(doc(S.db, 'dentistas', id), { nombre, especialidad, tel, correo: '', cedula: '', activo: true, ntfyTema: temaNuevo('equianza'), ...ej }));
    const K = [['ej-k1', '1', '1', 'ej-d1'], ['ej-k2', '2', '1', 'ej-d2'], ['ej-k3', '3', '2', 'ej-d3']];
    K.forEach(([id, numero, piso, dentistaId], i) => b.set(doc(S.db, 'consultorios', id), { numero, piso, especialidad: D[i][2], estado: 'ocupado', dentistaId, ...ej }));
    const P = [['ej-p1', 'Laura Martínez', '55 5551 0001', '1991-04-12'], ['ej-p2', 'Pedro Aguilar', '55 5551 0002', '1985-09-30'], ['ej-p3', 'Sofía Navarro', '55 5551 0003', '1978-01-22'],
      ['ej-p4', 'Mateo Herrera (6 años)', '55 5551 0004', '2020-06-15'], ['ej-p5', 'Daniela Ortiz', '55 5551 0005', '2001-11-03'], ['ej-p6', 'Héctor Ramos', '55 5551 0006', '1969-07-08'],
      ['ej-p7', 'Ximena Lara', '55 5551 0007', '1996-02-19'], ['ej-p8', 'Raúl Peña', '55 5551 0008', '1982-12-01']];
    P.forEach(([id, nombre, tel, nacimiento]) => b.set(doc(S.db, 'pacientes', id), { nombre, tel, nacimiento, correo: '', notas: '', creado: new Date().toISOString(), ...ej }));
    const nom = id => P.find(x => x[0] === id)[1], tel = id => P.find(x => x[0] === id)[2];
    const C = [[0, '09:00', 60, 'ej-k1', 'ej-p1', 'Revisión de brackets', 'programada'], [0, '11:00', 30, 'ej-k1', 'ej-p2', 'Ajuste mensual', 'llego'],
      [0, '10:00', 60, 'ej-k2', 'ej-p3', 'Tratamiento de conducto', 'programada'], [0, '12:30', 45, 'ej-k3', 'ej-p4', 'Revisión y flúor', 'programada'],
      [1, '09:30', 45, 'ej-k1', 'ej-p5', 'Colocación de brackets', 'programada'], [1, '16:00', 60, 'ej-k2', 'ej-p6', 'Endodoncia molar', 'programada'],
      [-1, '10:00', 60, 'ej-k1', 'ej-p7', 'Ajuste mensual', 'atendida'], [-1, '12:00', 60, 'ej-k2', 'ej-p8', 'Conducto', 'atendida'], [-2, '17:00', 30, 'ej-k3', 'ej-p4', 'Limpieza', 'no_vino']];
    C.forEach(([off, hora, duracion, cid, pid, motivo, estado]) => {
      const k = K.find(x => x[0] === cid);
      b.set(doc(collection(S.db, 'citas')), { fecha: sumaDias(hoy, off), hora, duracion, consultorioId: cid, dentistaId: k[3], paciente: nom(pid), pacienteId: pid, tel: tel(pid), motivo, notas: '', estado, avisoPrevio: false, creada: new Date().toISOString(), creadaPor: S.user.uid, ...ej });
    });
    await b.commit(); toast('Datos de ejemplo cargados.');
  } catch (e) { toast(errTxt(e), true); }
}
async function borrarEjemplos() {
  try {
    const b = writeBatch(S.db);
    S.consultorios.forEach(k => { if (k.ejemplo) b.delete(doc(S.db, 'consultorios', k.id)); });
    S.dentistas.forEach(d => { if (d.ejemplo) b.delete(doc(S.db, 'dentistas', d.id)); });
    S.pacientes.forEach(p => { if (p.ejemplo) b.delete(doc(S.db, 'pacientes', p.id)); });
    S.citas.forEach(c => { if (c.ejemplo) b.delete(doc(S.db, 'citas', c.id)); });
    await b.commit(); toast('Ejemplos borrados.');
  } catch (e) { toast(errTxt(e), true); }
}
