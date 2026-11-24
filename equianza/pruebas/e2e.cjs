// Prueba de punta a punta con Chromium (Playwright) + Firebase SIMULADO (ver firebase-mock.js).
// Uso:  node pruebas/e2e.cjs      (guarda capturas en pruebas/capturas/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUBLIC = path.resolve(__dirname, '../public'), SHOTS = path.resolve(__dirname, 'capturas');
fs.mkdirSync(SHOTS, { recursive: true });
const MOCK = fs.readFileSync(path.join(__dirname, 'firebase-mock.js'), 'utf8');
const INDEXES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firestore.indexes.json'), 'utf8')).indexes;
const FAKE_CFG = 'export const firebaseConfig={apiKey:"TEST-KEY",authDomain:"t",projectId:"t",appId:"t"};';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FALLA:', msg); } };
const num = s => Number(String(s).replace(/[^0-9]/g, ''));

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/firebase-config.js') { res.writeHead(200, { 'content-type': MIME['.js'] }); return res.end(FAKE_CFG); }
    const f = path.join(PUBLIC, p);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: 'America/Mexico_City', locale: 'es-MX', serviceWorkers: 'block' });
  const seed = { users: [{ email: 'dueno@equianza.app', password: 'admin123', uid: 'u-admin' }], store: [['usuarios/u-admin', { usuario: 'dueno', nombre: 'Dueño', rol: 'admin', activo: true }]] };
  await ctx.addInitScript(({ seed, idx }) => { if (!localStorage.getItem('__mockseed')) localStorage.setItem('__mockseed', JSON.stringify(seed)); localStorage.setItem('__mockindexes', JSON.stringify(idx)); }, { seed, idx: INDEXES });
  await ctx.route('https://www.gstatic.com/firebasejs/10.14.1/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: MOCK }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const ntfy = [];
  await ctx.route(/^https:\/\/ntfy\.sh\/?$/, r => { ntfy.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{}' }); });

  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  const hoyReal = new Date(); const HOY = ymd(hoyReal);
  const a = (h, m, s = 0) => new Date(hoyReal.getFullYear(), hoyReal.getMonth(), hoyReal.getDate(), h, m, s);
  await page.clock.install({ time: a(8, 0) });

  const M = fn => page.evaluate(fn);
  const tabs = async () => (await page.locator('#tabs .tab').allInnerTexts()).map(s => s.trim());
  const toast = async () => (await page.locator('#toast span').innerText().catch(() => '')).trim();
  const esperaToast = async re => { await page.waitForFunction(re => { const t = document.querySelector('#toast'); return t && !t.hidden && new RegExp(re, 'i').test(t.textContent); }, re.source || re, { timeout: 8000 }); };
  const irTab = async t => { await page.locator('#tabs .tab', { hasText: new RegExp('^' + t + '$') }).click(); };
  const login = async (u, p) => { await page.fill('#l_user', u); await page.fill('#l_pass', p); await page.click('#l_btn'); };
  const salir = async () => { await page.click('#btnSalir'); await page.waitForSelector('#login:not([hidden])'); };
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const store = path => page.evaluate(p => globalThis.__MOCK.store.get(p), path);
  const denegados = () => page.evaluate(() => globalThis.__MOCK.log.denied.length);


  const sumaDias = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
  const MANANA = sumaDias(HOY, 1), D_OLD = sumaDias(HOY, -75);
  const cols = () => page.locator('#view .cols .col');
  const vista = () => page.locator('#view').innerText();
  const sinScrollH = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  /* ---------- 1. Entrar ---------- */
  console.log('\n1. Pantalla de entrada');
  await page.goto(URL);
  await page.waitForSelector('#formLogin:not([hidden])');
  ok(await page.title() === 'Equianza · Clínica dental', 'título de la página dice "Clínica dental"');
  ok(!/torre/i.test(await page.locator('body').innerText()), 'ya no aparece la palabra "torre"');
  await shot('01-login');
  await login('dueno', 'mala');
  await page.waitForFunction(() => document.querySelector('#l_err').textContent.length > 0);
  ok(/incorrectos/.test(await page.locator('#l_err').innerText()), 'contraseña incorrecta muestra aviso');

  /* ---------- 2. Administrador (dentista principal) ---------- */
  console.log('\n2. Administrador: datos de ejemplo y avisos');
  await login('dueno', 'admin123');
  await page.waitForSelector('#app:not([hidden])');
  ok(JSON.stringify(await tabs()) === JSON.stringify(['Resumen', 'Agenda', 'Pacientes', 'Dentistas', 'Consultorios', 'Reportes', 'Cuenta']), 'pestañas del administrador (sin Cobros)');
  ok((await page.locator('#rolPill').textContent()) === 'Administrador', 'etiqueta de rol');
  ok(/Clínica dental/i.test(await page.locator('#clinicaSub').innerText()), 'subtítulo "Clínica dental"');
  await irTab('Consultorios');
  ok(/Aún no hay consultorios/.test(await vista()), 'sin datos: mensaje vacío claro');
  await irTab('Cuenta');
  ok(/Datos de la clínica/.test(await vista()), 'Cuenta: "Datos de la clínica"');
  await page.click('#ej_cargar'); await esperaToast(/ejemplo/);
  const cuenta = pref => page.evaluate(p => [...__MOCK.store.keys()].filter(k => k.startsWith(p)).length, pref);
  ok(await cuenta('consultorios/') === 3 && await cuenta('dentistas/') === 3 && await cuenta('pacientes/') === 8 && await cuenta('citas/') === 9, 'ejemplos: 3 consultorios, 3 dentistas, 8 pacientes, 9 citas');
  ok(await cuenta('rentas/') === 0 && await cuenta('pagos/') === 0, 'no se crea nada de rentas ni pagos');
  await page.click('#n_gen'); await page.click('#n_guardar'); await esperaToast(/guardados/);
  const cfgN = await store('config/notificaciones');
  ok(cfgN && /^equianza-admin-/.test(cfgN.tema) && cfgN.minutosAntes === 15, 'tema de avisos del administrador guardado');
  await page.click('#n_prueba'); await page.waitForTimeout(150);
  ok(ntfy.some(n => n.topic === cfgN.tema && /Prueba/.test(n.title)), 'aviso de prueba llega al tema del administrador');
  await page.fill('#t_nom', 'Equianza Dental'); await page.fill('#t_ciu', 'Guadalajara'); await page.click('#t_guardar'); await esperaToast(/guardados/);
  ok((await store('config/clinica')).ciudad === 'Guadalajara', 'datos de la clínica guardados en config/clinica');
  ok(/Equianza Dental/.test(await page.locator('#clinicaNom').innerText()) && /Guadalajara/i.test(await page.locator('#clinicaSub').innerText()), 'encabezado muestra nombre y ciudad de la clínica');

  /* ---------- 3. Consultorios (sin renta) ---------- */
  console.log('\n3. Consultorios');
  await irTab('Consultorios');
  const kt = await page.locator('.kcard').allInnerTexts();
  ok(kt.length === 3, 'se ven 3 consultorios');
  ok(/Ortodoncia/.test(kt[0]) && /Valeria/.test(kt[0]) && /Ver agenda/.test(kt[0]), 'Consultorio 1: especialidad, dentista y "Ver agenda"');
  ok(!/renta|\$|pago|vence/i.test(await vista()), 'ninguna mención de renta, pagos ni dinero');
  await page.locator('.kcard', { hasText: 'Consultorio 1' }).locator('[data-edit]').click();
  ok(await page.locator('#k_monto').count() === 0 && await page.locator('#k_dia').count() === 0, 'el formulario ya no pide monto de renta');
  await page.click('#k_cancel');
  // un mismo dentista puede atender en dos consultorios (caso del dentista principal)
  await page.click('#k_nuevo');
  await page.fill('#k_num', '4'); await page.fill('#k_piso', '2'); await page.fill('#k_esp', 'Ortodoncia');
  ok(await page.locator('#k_dent option:disabled').count() === 0, 'ningún dentista aparece bloqueado por tener otro consultorio');
  await page.selectOption('#k_dent', 'ej-d1');
  ok(await page.locator('#k_estado').inputValue() === 'ocupado', 'al asignar dentista el estado pasa a "en uso"');
  await page.click('#k_guardar'); await esperaToast(/guardado/);
  ok(await page.locator('.kcard').count() === 4, 'ahora hay 4 consultorios; la Dra. Ríos atiende en 2');
  await shot('03-consultorios');

  /* ---------- 4. Resumen del día ---------- */
  console.log('\n4. Resumen del día (vista del dentista principal)');
  await irTab('Resumen');
  const rt = await vista();
  ok(/Citas hoy\s*4/.test(rt.replace(/\n+/g, ' ')) && /1 en sala/.test(rt), 'Resumen: 4 citas hoy, 1 en sala');
  ok(await cols().count() === 4, 'Resumen: una columna por consultorio');
  ok(/Laura Martínez/.test(rt) && /Sofía Navarro/.test(rt) && /Mateo/.test(rt), 'Resumen: citas de hoy de los tres consultorios');
  ok(!/renta|adeudo|\$/i.test(rt), 'Resumen sin alertas de renta');
  await shot('04-resumen');
  await page.locator('.col', { hasText: 'Consultorio 2' }).locator('[data-agenda]').click();
  ok(await page.locator('.chip[data-cons="ej-k2"][aria-pressed="true"]').count() === 1 && await cols().count() === 1, '"Ver agenda completa" abre la agenda filtrada a ese consultorio');

  /* ---------- 5. Pacientes ---------- */
  console.log('\n5. Directorio de pacientes');
  await irTab('Pacientes');
  ok(await page.locator('.prow').count() === 8, 'lista de 8 pacientes');
  await page.fill('#pa_buscar', 'sofia');
  ok(await page.locator('.prow').count() === 1 && /Sofía Navarro/.test(await page.locator('.prow').innerText()), 'buscar sin acentos encuentra "Sofía"');
  await page.fill('#pa_buscar', '5551 0006');
  ok(await page.locator('.prow').count() === 1 && /Héctor/.test(await page.locator('.prow').innerText()), 'buscar por teléfono');
  await page.locator('.prow').click();
  const ficha = await page.locator('#sheetBody').innerText();
  ok(/Héctor Ramos/.test(await page.locator('#sheetTitle').innerText()) && /Endodoncia molar/.test(ficha), 'ficha con historial de citas ligado (cita de mañana)');
  await page.click('#pf_cita');
  ok(await page.inputValue('#c_pac') === 'Héctor Ramos' && /Paciente del directorio/.test(await page.locator('#c_pachint').innerText()), '"Agendar cita" desde la ficha: paciente ya escrito y ligado');
  await page.click('#c_cancel');
  await page.fill('#pa_buscar', '');
  await page.click('#pa_nuevo');
  await page.fill('#p_nom', 'Carlos Duarte'); await page.fill('#p_tel', '5555551234'); await page.fill('#p_not', 'Alérgico a la penicilina');
  await page.click('#p_guardar'); await esperaToast(/guardado/);
  ok(await page.locator('.prow').count() === 9, 'paciente nuevo en la lista (9)');
  await page.click('#pa_nuevo'); await page.fill('#p_nom', 'carlos duarte'); await page.click('#p_guardar');
  ok(/Ya hay un paciente/.test(await page.locator('#p_err').innerText()), 'no deja repetir el mismo nombre');
  await page.click('#p_cancel');
  await shot('05-pacientes');

  /* ---------- 6. Agenda: columnas, filtro y calendario ---------- */
  console.log('\n6. Agenda y calendario');
  await irTab('Agenda');
  await page.click('.chip[data-cons=""]');
  ok(await cols().count() === 4, 'día: una columna por consultorio (4)');
  ok(await page.locator('.chip').count() === 5, 'chips: Todos + 4 consultorios');
  await page.click('.chip[data-cons="ej-k1"]');
  ok(await cols().count() === 1 && /Laura Martínez/.test(await vista()) && !/Sofía Navarro/.test(await vista()), 'chip de un consultorio muestra solo su agenda');
  await page.click('.chip[data-cons=""]');
  await page.click('[data-nav="1"]');
  ok(/Daniela Ortiz/.test(await vista()) && /Héctor Ramos/.test(await vista()), 'día siguiente: citas de mañana');
  await page.click('[data-nav="0"]');
  await page.click('.segb[data-vista="mes"]');
  ok(await page.locator('.cal').count() === 1 && await page.locator('.cal-d').count() >= 28, 'vista Calendario: cuadrícula del mes');
  ok(await page.locator('.cal-d.hoy .cal-n').innerText() === '4', 'hoy marca 4 citas en el calendario');
  ok(await page.locator('.cal-d.hoy .kdot').count() === 3, 'hoy: 3 puntos de color (3 consultorios con citas)');
  await shot('06-calendario');
  if (await page.locator(`.cal-d[data-dia="${MANANA}"]`).count()) {
    ok(await page.locator(`.cal-d[data-dia="${MANANA}"] .cal-n`).innerText() === '2', 'mañana marca 2 citas');
    await page.click(`.cal-d[data-dia="${MANANA}"]`);
    ok(/Daniela Ortiz/.test(await vista()) && await page.locator(`.cal-d.sel[data-dia="${MANANA}"]`).count() === 1, 'tocar un día del calendario muestra sus citas debajo');
  } else ok(true, '(mañana cae fuera del mes mostrado; se omite)');
  await page.click('.chip[data-cons="ej-k2"]');
  const total2 = await page.locator('.cal-n').allInnerTexts();
  ok(total2.length >= 1 && total2.every(n => Number(n) <= 2), 'el calendario también se filtra por consultorio');
  await page.click('.chip[data-cons=""]');
  await page.click('[data-nav="-1"]');
  ok(await page.locator('[data-nav="-1"]').isDisabled(), 'meses anteriores al mes pasado: la flecha se desactiva (solo se cargan 2 meses)');
  await page.click('[data-nav="0"]');
  await page.click('.segb[data-vista="dia"]');
  // días antiguos se consultan al abrirlos
  await page.evaluate(([f]) => __MOCK.store.set('citas/viejo1', { fecha: f, hora: '10:00', duracion: 30, consultorioId: 'ej-k1', dentistaId: 'ej-d1', paciente: 'Paciente Antiguo', pacienteId: '', tel: '', motivo: 'Limpieza', notas: '', estado: 'atendida', avisoPrevio: false }), [D_OLD]);
  await page.fill('#ag_fecha', D_OLD);
  await page.waitForFunction(() => /Paciente Antiguo/.test(document.querySelector('#view').innerText), null, { timeout: 8000 });
  ok(true, 'un día de hace más de 2 meses se carga al abrirlo');
  await page.click('[data-nav="0"]');

  /* ---------- 7. Agendar ---------- */
  console.log('\n7. Agendar citas');
  await page.click('#ag_nueva');
  await page.fill('#c_pac', 'Mariana Solís');
  ok(/Paciente nuevo/.test(await page.locator('#c_pachint').innerText()) && await page.locator('#c_guardarw').isVisible(), 'nombre nuevo: avisa y ofrece guardarlo en el directorio');
  await page.fill('#c_pac', 'Laura Martínez');
  ok(/Paciente del directorio/.test(await page.locator('#c_pachint').innerText()) && await page.inputValue('#c_tel') === '55 5551 0001' && !(await page.locator('#c_guardarw').isVisible()), 'nombre del directorio: se liga y completa el teléfono');
  await page.fill('#c_pac', 'Mariana Solís'); await page.fill('#c_tel', '5551112233'); await page.fill('#c_mot', 'Limpieza');
  await page.selectOption('#c_cons', 'ej-k2'); await page.fill('#c_fecha', HOY); await page.fill('#c_hora', '15:00'); await page.selectOption('#c_dur', '60');
  await page.click('#c_guardar'); await esperaToast(/guardada/);
  const nuevaCita = await page.evaluate(() => [...__MOCK.store.entries()].find(([k, v]) => k.startsWith('citas/') && v.paciente === 'Mariana Solís'));
  ok(nuevaCita && nuevaCita[1].dentistaId === 'ej-d2' && nuevaCita[1].pacienteId, 'cita guardada con el dentista del consultorio y ligada a un paciente nuevo');
  ok(await page.evaluate(() => [...__MOCK.store.values()].some(v => v.nombre === 'Mariana Solís' && v.tel === '5551112233')), 'el paciente nuevo quedó en el directorio');
  await page.click('#ag_nueva');
  await page.fill('#c_pac', 'Otra Persona'); await page.selectOption('#c_cons', 'ej-k2'); await page.fill('#c_fecha', HOY); await page.fill('#c_hora', '15:30');
  await page.click('#c_guardar');
  ok(/se cruza con la cita de Mariana/.test(await page.locator('#c_err').innerText()), 'choque de horario en el mismo consultorio se rechaza');
  await page.fill('#c_hora', '16:00'); await page.click('#c_guardar'); await esperaToast(/guardada/);
  ok(true, 'otra hora libre sí se guarda');

  /* ---------- 8. Llegada y WhatsApp ---------- */
  console.log('\n8. Llegada del paciente y recordatorios');
  ok(await page.locator('a[href^="https://wa.me/525555"]').count() >= 1, 'botón "Recordar por WhatsApp" con el teléfono del paciente');
  const d1 = await store('dentistas/ej-d1');
  await page.locator('.cita', { hasText: 'Laura Martínez' }).locator('[data-act="llego"]').click(); await esperaToast(/Llegada/);
  await page.waitForTimeout(150);
  ok(ntfy.some(n => n.topic === d1.ntfyTema && /Llegó un paciente/.test(n.title) && /Laura Martínez/.test(n.message)), 'aviso de llegada al celular del dentista');
  ok(ntfy.some(n => n.topic === cfgN.tema && /Llegó/.test(n.title) && /Laura Martínez/.test(n.message)), 'aviso de llegada al celular del administrador');
  ok(/en sala de espera/i.test(await page.locator('.cita', { hasText: 'Laura Martínez' }).innerText()), 'la cita pasa a "en sala de espera"');
  const d2 = await store('dentistas/ej-d2'), antes = ntfy.length;
  await page.clock.runFor(106 * 60000);                    // de 8:00 a 9:46: la cita de las 10:00 queda a 14 min
  await page.waitForTimeout(300);
  ok(ntfy.filter(n => n.topic === d2.ntfyTema && /Cita en/.test(n.title) && /Sofía Navarro/.test(n.message)).length === 1, 'recordatorio "cita cerca" llega una sola vez al dentista de esa cita');
  await page.clock.runFor(10 * 60000); await page.waitForTimeout(200);
  ok(ntfy.filter(n => n.topic === d2.ntfyTema && /Sofía Navarro/.test(n.message)).length === 1, 'el recordatorio no se repite');
  ok(!ntfy.slice(antes).some(n => n.topic === cfgN.tema && /Cita en/.test(n.title)), 'el recordatorio previo no va al administrador');

  /* ---------- 9. Dentistas y usuarios ---------- */
  console.log('\n9. Dentistas y usuarios');
  await irTab('Dentistas');
  ok(await page.locator('.kcard').count() === 3, 'directorio de 3 dentistas');
  ok(/Consultorios/.test(await page.locator('.kcard', { hasText: 'Valeria' }).innerText()) && /Consultorio 1.*Consultorio 4/.test(await page.locator('.kcard', { hasText: 'Valeria' }).innerText()), 'la Dra. Ríos aparece con sus 2 consultorios');
  await irTab('Cuenta');
  const crear = async (nombre, user, pass, rol, dent) => {
    await page.fill('#u_nombre', nombre); await page.fill('#u_user', user); await page.fill('#u_pass', pass); await page.selectOption('#u_rol', rol);
    if (dent) await page.selectOption('#u_dent', dent);
    await page.click('#u_guardar'); await esperaToast(/creado/);
  };
  await crear('Recepción', 'recep', 'recep123', 'recepcion');
  await crear('Dra. Valeria Ríos', 'valeria', 'valeria1', 'dentista', 'ej-d1');
  await crear('Dr. Andrés', 'andres', 'andres12', 'dentista', 'ej-d2');
  ok(await page.evaluate(() => __MOCK.store.get('usuarios/uid-valeria').dentistaId) === 'ej-d1', 'usuario dentista ligado a su ficha');
  await shot('09-cuenta-usuarios');
  await salir();

  /* ---------- 10. Recepción ---------- */
  console.log('\n10. Recepción');
  const den0 = await denegados();
  await login('recep', 'recep123'); await page.waitForSelector('#app:not([hidden])');
  ok(JSON.stringify(await tabs()) === JSON.stringify(['Agenda', 'Pacientes', 'Dentistas', 'Consultorios', 'Cuenta']), 'pestañas de recepción');
  await page.waitForFunction(() => document.querySelectorAll('#view .col').length === 4);
  ok(await page.locator('.chip').count() === 5, 'recepción ve los 4 consultorios');
  ok(/Sofía Navarro/.test(await vista()) && /Mariana Solís/.test(await vista()), 'recepción ve la agenda de todos');
  await irTab('Consultorios'); ok(await page.locator('[data-edit]').count() === 0, 'recepción no puede editar consultorios');
  await irTab('Dentistas'); ok(await page.locator('[data-edit]').count() === 0, 'recepción no puede editar dentistas');
  await irTab('Pacientes'); ok(await page.locator('#pa_nuevo').count() === 1, 'recepción sí puede dar de alta pacientes');
  ok(await denegados() === den0, 'recepción: ninguna lectura rechazada por las reglas');
  const permisosRecep = await page.evaluate(() => {
    const P = __MOCK.permitido, u = 'uid-recep';
    return { pac: P('create', 'pacientes/x', null, { nombre: 'A' }, u), pacDel: P('delete', 'pacientes/ej-p1', {}, null, u), usr: P('get', 'usuarios/u-admin', {}, null, u), cfg: P('update', 'config/notificaciones', {}, {}, u), cons: P('update', 'consultorios/ej-k1', {}, {}, u) };
  });
  ok(permisosRecep.pac && !permisosRecep.pacDel && !permisosRecep.usr && !permisosRecep.cfg && !permisosRecep.cons, 'reglas (traducción): recepción crea pacientes; no borra, ni lee usuarios, ni cambia configuración o consultorios');
  await salir();

  /* ---------- 11. Dentista con 2 consultorios ---------- */
  console.log('\n11. Dentista (2 consultorios)');
  await login('valeria', 'valeria1'); await page.waitForSelector('#app:not([hidden])');
  ok(JSON.stringify(await tabs()) === JSON.stringify(['Mi agenda', 'Pacientes', 'Mis consultorios', 'Cuenta']), 'pestañas del dentista');
  await page.waitForFunction(() => document.querySelectorAll('#view .col').length === 2);
  ok(await page.locator('.chip').count() === 3, 'chips: Todos + sus 2 consultorios');
  ok(/Laura Martínez/.test(await vista()) && !/Sofía Navarro/.test(await vista()) && !/Mateo/.test(await vista()), 'solo ve las citas de sus consultorios');
  await page.locator('.cita', { hasText: 'Pedro Aguilar' }).locator('[data-act="iniciar"]').click();
  await page.waitForFunction(() => /en consulta/i.test(document.querySelector('#view').innerText));
  await page.locator('.cita', { hasText: 'Pedro Aguilar' }).locator('[data-act="terminar"]').click(); await esperaToast(/terminada/);
  ok((await page.evaluate(() => [...__MOCK.store.values()].find(v => v.paciente === 'Pedro Aguilar').estado)) === 'atendida', 'el dentista inicia y termina la consulta');
  await page.click('#ag_nueva');
  ok(await page.locator('#c_cons option').count() === 2, 'al agendar elige entre sus 2 consultorios');
  await page.fill('#c_pac', 'Paciente Directo'); await page.selectOption('#c_cons', { index: 1 }); await page.fill('#c_fecha', HOY); await page.fill('#c_hora', '17:00');
  ok(await page.locator('#c_guardarw').count() === 0, 'el dentista no ve la opción de crear pacientes');
  await page.click('#c_guardar'); await esperaToast(/guardada/);
  ok(await page.evaluate(() => [...__MOCK.store.values()].some(v => v.paciente === 'Paciente Directo' && v.dentistaId === 'ej-d1' && v.consultorioId === [...__MOCK.store.entries()].find(([k, x]) => k.startsWith('consultorios/') && x.numero === '4')[0].split('/')[1])), 'cita del dentista guardada en su consultorio 4');
  await irTab('Pacientes');
  ok(await page.locator('.prow').count() >= 8 && await page.locator('#pa_nuevo').count() === 0, 'el dentista ve el directorio pero no puede crear pacientes');
  await page.fill('#pa_buscar', 'Héctor'); await page.locator('.prow').click();
  ok(await page.locator('#pf_edit').count() === 0, 'ficha de solo lectura para el dentista');
  await page.click('#pf_todo'); await page.waitForTimeout(200);
  ok(/Sin citas registradas/.test(await page.locator('#pf_hist').innerText()) && await denegados() === den0, 'historial completo del dentista: no ve citas de otro dentista y la consulta (con su filtro) no se rechaza');
  await page.click('#sheetClose');
  await irTab('Mis consultorios');
  ok(await page.locator('.kcard').count() === 2 && !/renta|\$/i.test(await vista()), 've solo sus 2 consultorios, sin dinero');
  ok(await denegados() === den0, 'dentista: ninguna consulta rechazada por las reglas (las consultas llevan su filtro)');
  const permisosDent = await page.evaluate(() => {
    const P = __MOCK.permitido, u = 'uid-valeria', c = [...__MOCK.store.entries()].find(([k, v]) => k.startsWith('citas/') && v.paciente === 'Laura Martínez')[1], ajena = [...__MOCK.store.entries()].find(([k, v]) => v.paciente === 'Sofía Navarro')[1];
    return { estado: P('update', 'citas/x', c, { ...c, estado: 'atendida' }, u), nombre: P('update', 'citas/x', c, { ...c, paciente: 'Otro' }, u), cambiaDent: P('update', 'citas/x', c, { ...c, dentistaId: 'ej-d2' }, u),
      ajena: P('get', 'citas/y', ajena, null, u), pacRead: P('get', 'pacientes/ej-p1', {}, null, u), pacWrite: P('update', 'pacientes/ej-p1', {}, { nombre: 'x' }, u), borra: P('delete', 'citas/x', c, null, u) };
  });
  ok(permisosDent.estado && !permisosDent.nombre && !permisosDent.cambiaDent && !permisosDent.ajena && permisosDent.pacRead && !permisosDent.pacWrite && !permisosDent.borra, 'reglas (traducción): el dentista solo cambia el estado de sus citas, no ve las ajenas, lee pacientes sin editarlos');
  await shot('11-dentista');
  await salir();

  /* ---------- 12. Reportes y desactivar usuario ---------- */
  console.log('\n12. Reportes del administrador');
  await login('dueno', 'admin123'); await page.waitForSelector('#app:not([hidden])');
  await irTab('Reportes');
  const mesAct = HOY.slice(0, 7);
  const esperadas = await page.evaluate(m => [...__MOCK.store.entries()].filter(([k, v]) => k.startsWith('citas/') && v.fecha.startsWith(m)).length, mesAct);
  ok(num(await page.locator('.stat b').first().innerText()) === esperadas, `reporte del mes: ${esperadas} citas`);
  const tabla = await page.locator('table tbody tr').allInnerTexts();
  ok(tabla.length === 4 && /Valeria/.test(tabla[0]), 'tabla por consultorio y dentista (4 filas)');
  ok(!/ingreso|adeudo|renta|\$/i.test(await vista()), 'sin ingresos ni adeudos');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rp_csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(/Fecha,Hora,Consultorio,Dentista,Paciente/.test(csv) && /Laura Martínez/.test(csv), 'CSV de citas del mes');
  await page.fill('#rp_mes', D_OLD.slice(0, 7));
  await page.waitForFunction(() => !/Cargando citas/.test(document.querySelector('#view').innerText), null, { timeout: 8000 });
  ok(num(await page.locator('.stat b').first().innerText()) >= 1, 'un mes viejo se consulta al elegirlo');
  await shot('12-reportes');
  await irTab('Cuenta');
  await page.locator('tr', { hasText: 'recep' }).locator('button[data-uid]').click(); await esperaToast(/desactivado/);
  await salir();
  await login('recep', 'recep123');
  await page.waitForFunction(() => /desactivado/.test(document.querySelector('#l_err').textContent), null, { timeout: 8000 });
  ok(true, 'usuario desactivado ya no entra');

  /* ---------- 13. Celular (390 px) ---------- */
  console.log('\n13. Celular');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.fill('#l_user', 'dueno'); await page.fill('#l_pass', 'admin123'); await page.click('#l_btn'); await page.waitForSelector('#app:not([hidden])');
  await irTab('Agenda');
  ok(await page.locator('#ag_fab').isVisible() && !(await page.locator('#ag_nueva').isVisible()), 'celular: botón flotante "+ Nueva cita" (el de la barra se oculta)');
  ok(await sinScrollH(), 'celular: agenda sin desplazamiento horizontal');
  const chipBox = await page.locator('.chip').first().boundingBox();
  ok(chipBox && chipBox.height >= 38, 'celular: chips de consultorio de tamaño táctil');
  await shot('13-movil-agenda');
  await page.click('.segb[data-vista="mes"]');
  ok(await sinScrollH(), 'celular: calendario sin desplazamiento horizontal');
  const celda = await page.locator('.cal-d').first().boundingBox();
  ok(celda && celda.width >= 40 && celda.height >= 48, 'celular: celdas del calendario tocables');
  await shot('13-movil-calendario');
  await page.click('.segb[data-vista="dia"]');
  await page.click('#ag_fab');
  await page.fill('#c_pac', 'Carlos Duarte');
  ok(/Paciente del directorio/.test(await page.locator('#c_pachint').innerText()) && await page.inputValue('#c_tel') === '5555551234', 'celular: agendar a un paciente del directorio');
  await page.selectOption('#c_cons', 'ej-k3'); await page.fill('#c_fecha', MANANA); await page.fill('#c_hora', '11:00');
  await shot('13-movil-nueva-cita');
  await page.click('#c_guardar'); await esperaToast(/guardada/);
  ok(/Carlos Duarte/.test(await vista()), 'celular: la cita nueva aparece en la agenda del día');
  ok(await sinScrollH(), 'celular: sigue sin desplazamiento horizontal');
  for (const t of ['Pacientes', 'Consultorios', 'Resumen', 'Reportes', 'Cuenta', 'Dentistas']) { await irTab(t); ok(await sinScrollH(), `celular: ${t} sin desplazamiento horizontal`); }
  await irTab('Pacientes'); await shot('13-movil-pacientes');

  ok(errores.length === 0, 'sin errores en la consola' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  console.log(`\n${pass} comprobaciones correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
