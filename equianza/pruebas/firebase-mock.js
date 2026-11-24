// Firebase SIMULADO en memoria para las pruebas con navegador automatizado.
// Sustituye a los módulos de gstatic.com. Imita Auth + Firestore (suscripciones en vivo, lotes, transacciones)
// y APLICA UNA TRADUCCIÓN A MANO de firestore.rules. No es el emulador real: ver README ("Qué no pude probar").
const M = (globalThis.__MOCK ||= build());
export const { initializeApp, deleteApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getFirestore, collection, doc, onSnapshot, query, where, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, runTransaction } = M.api;

function build() {
  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const seed = JSON.parse(localStorage.getItem('__mockseed') || '{"users":[],"store":[]}');
  const users = new Map(seed.users.map(u => [u.email, u]));
  const store = new Map(seed.store.map(([p, d]) => [p, d]));
  const listeners = new Set();
  const log = { writes: [], denied: [], reads: 0 };
  const indexes = JSON.parse(localStorage.getItem('__mockindexes') || '[]');   // de firestore.indexes.json
  let nid = 0;
  const persist = () => { try { localStorage.setItem('__mockseed', JSON.stringify({ users: [...users.values()], store: [...store.entries()] })); } catch { /* nada */ } };

  /* ---------- Traducción a mano de firestore.rules ---------- */
  function who(app) { const u = app && app._auth && app._auth.currentUser; return u ? u.uid : null; }
  function ctx(uid) {
    const p = uid ? store.get('usuarios/' + uid) : null;
    const activo = !!(uid && p && p.activo === true);
    const rol = activo ? p.rol : null;
    const admin = rol === 'admin', staff = rol === 'admin' || rol === 'recepcion', den = rol === 'dentista';
    const mine = did => den && (p.dentistaId || '') !== '' && did === p.dentistaId;
    return { uid, p, activo, admin, staff, den, mine };
  }
  function permitido(op, path, res, nuevo, uid) {
    const [col, id] = path.split('/'), c = ctx(uid), r = res || {};
    const leer = op === 'get' || op === 'list';
    switch (col) {
      case 'usuarios': return leer ? !!uid && (uid === id || c.admin) : c.admin;
      case 'dentistas': return leer ? c.staff || c.mine(id) : c.admin;
      case 'consultorios': return leer ? c.staff || c.mine(r.dentistaId) : c.admin;
      case 'pacientes':
        if (leer) return c.staff || c.den;
        if (op === 'delete') return c.admin;
        return c.staff && typeof nuevo.nombre === 'string' && nuevo.nombre.length > 0 && nuevo.nombre.length <= 120;
      case 'citas': {
        if (leer) return c.staff || c.mine(r.dentistaId);
        if (op === 'create') return (c.staff || c.mine(nuevo.dentistaId)) && ['programada', 'llego', 'en_consulta', 'atendida', 'cancelada', 'no_vino'].includes(nuevo.estado)
          && typeof nuevo.fecha === 'string' && nuevo.fecha.length === 10 && typeof nuevo.hora === 'string' && nuevo.hora.length === 5;
        if (op === 'update') {
          if (c.staff) return true;
          const afect = new Set([...Object.keys(r), ...Object.keys(nuevo)].filter(k => JSON.stringify(r[k]) !== JSON.stringify(nuevo[k])));
          return c.mine(r.dentistaId) && nuevo.dentistaId === r.dentistaId && [...afect].every(k => ['estado', 'notas', 'atendidaEn'].includes(k));
        }
        return c.admin;
      }
      case 'config':
        if (id === 'clinica') return leer ? c.activo : c.admin;
        if (id === 'notificaciones') return leer ? c.staff : c.admin;
        return false;
      default: return false;
    }
  }
  // Las consultas del dentista deben incluir where('dentistaId','==',yo): Firestore lo exige de verdad.
  function listaPermitida(q, uid) {
    const c = ctx(uid), col = q.col;
    const ok = { usuarios: c.admin, dentistas: c.staff, consultorios: c.staff, pacientes: c.staff || c.den, citas: c.staff }[col];
    if (ok) return true;
    if (c.den && ['consultorios', 'citas'].includes(col))
      return q.wheres.some(w => w.f === 'dentistaId' && w.op === '==' && w.v === c.p.dentistaId);
    return false;
  }
  function indiceFaltante(q) {
    const ineq = q.wheres.filter(w => ['<', '<=', '>', '>='].includes(w.op)), eq = q.wheres.filter(w => w.op === '==');
    if (!ineq.length || !eq.length) return false;
    const campos = new Set([...eq, ...ineq].map(w => w.f));
    if (campos.size < 2) return false;
    return !indexes.some(ix => ix.collectionGroup === q.col && ix.fields.length === 2 && ix.fields.every(f => campos.has(f.fieldPath)));
  }

  /* ---------- Referencias y consultas ---------- */
  const mkDb = app => ({ app, _db: true });
  const collection = (db, name) => ({ type: 'col', db, col: name, path: name, wheres: [] });
  function doc(parent, ...seg) {
    if (parent.type === 'col') { const id = seg[0] || 'auto' + (++nid) + Math.random().toString(36).slice(2, 6); return { type: 'doc', db: parent.db, path: parent.path + '/' + id, id }; }
    const parts = seg.join('/').split('/'); return { type: 'doc', db: parent, path: parts.join('/'), id: parts[parts.length - 1] };
  }
  const where = (f, op, v) => ({ f, op, v });
  const query = (col, ...ws) => ({ ...col, type: 'query', wheres: ws });
  const cmp = (a, op, b) => op === '==' ? a === b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : op === '<' ? a < b : false;
  const docsDe = q => [...store.entries()].filter(([p, d]) => p.startsWith(q.col + '/') && p.split('/').length === 2 && q.wheres.every(w => cmp(d[w.f], w.op, w.v))).map(([p, d]) => [p.split('/')[1], d]);
  const snapDoc = (ref, exists, data) => ({ id: ref.id, ref, exists: () => exists, data: () => clone(data), metadata: { fromCache: false } });

  function evaluar(ref, uid) {   // devuelve snapshot o lanza permission-denied
    if (ref.type === 'doc') {
      const d = store.get(ref.path);
      if (!permitido('get', ref.path, d, null, uid)) throw err('permission-denied', 'Missing or insufficient permissions.');
      return snapDoc(ref, d !== undefined, d);
    }
    if (!listaPermitida(ref, uid)) throw err('permission-denied', 'Missing or insufficient permissions (consulta).');
    if (indiceFaltante(ref)) throw err('failed-precondition', 'The query requires an index.');
    const items = docsDe(ref);
    for (const [id, d] of items) if (!permitido('list', ref.col + '/' + id, d, null, uid)) throw err('permission-denied', 'Missing or insufficient permissions (documento).');
    return { docs: items.map(([id, d]) => snapDoc({ id, path: ref.col + '/' + id }, true, d)), size: items.length, empty: !items.length, metadata: { fromCache: false } };
  }
  function onSnapshot(ref, next, error) {
    const uid = () => who(ref.db.app);
    const l = { ref, next, error, activo: true };
    const empujar = () => { if (!l.activo) return; try { const s = evaluar(ref, uid()); log.reads++; next(s); } catch (e) { log.denied.push(`${ref.path || ref.col}: ${e.message}`); if (error) error(e); } };
    listeners.add(l);
    Promise.resolve().then(empujar); l.empujar = empujar;
    return () => { l.activo = false; listeners.delete(l); };
  }
  const notificar = () => Promise.resolve().then(() => [...listeners].forEach(l => l.empujar()));

  /* ---------- Escrituras ---------- */
  function aplicar(ops, uid) {   // todo o nada, como un lote real
    const previo = new Map();
    for (const o of ops) {
      const ex = store.get(o.path);
      let nuevo, op;
      if (o.kind === 'delete') { op = 'delete'; nuevo = null; }
      else if (o.kind === 'update') { if (ex === undefined) throw err('not-found', 'No document to update'); op = 'update'; nuevo = { ...ex, ...clone(o.data) }; }
      else { op = ex === undefined ? 'create' : 'update'; nuevo = clone(o.data); }
      if (!permitido(op, o.path, ex, nuevo, uid)) { log.denied.push(`${op} ${o.path}`); throw err('permission-denied', 'Missing or insufficient permissions.'); }
      o._nuevo = nuevo;
    }
    for (const o of ops) { previo.set(o.path, store.get(o.path)); if (o.kind === 'delete') store.delete(o.path); else store.set(o.path, o._nuevo); log.writes.push(`${o.kind} ${o.path}`); }
    persist(); notificar();
  }
  const run = (ref, ops) => Promise.resolve().then(() => aplicar(ops, who(ref.db.app)));
  const setDoc = (ref, data) => run(ref, [{ kind: 'set', path: ref.path, data }]);
  const updateDoc = (ref, data) => run(ref, [{ kind: 'update', path: ref.path, data }]);
  const deleteDoc = ref => run(ref, [{ kind: 'delete', path: ref.path }]);
  const addDoc = async (col, data) => { const r = doc(col); await setDoc(r, data); return r; };
  const getDoc = ref => Promise.resolve().then(() => evaluar(ref, who(ref.db.app)));
  const getDocs = ref => Promise.resolve().then(() => { log.reads++; return evaluar(ref, who(ref.db.app)); });
  function writeBatch(db) {
    const ops = [];
    return {
      set: (r, d) => { ops.push({ kind: 'set', path: r.path, data: d }); }, update: (r, d) => { ops.push({ kind: 'update', path: r.path, data: d }); },
      delete: r => { ops.push({ kind: 'delete', path: r.path }); }, commit: () => Promise.resolve().then(() => aplicar(ops, who(db.app)))
    };
  }
  async function runTransaction(db, fn) {
    const ops = [];
    const tx = { get: async r => getDoc(r), update: (r, d) => { ops.push({ kind: 'update', path: r.path, data: d }); }, set: (r, d) => { ops.push({ kind: 'set', path: r.path, data: d }); }, delete: r => { ops.push({ kind: 'delete', path: r.path }); } };
    const res = await fn(tx); aplicar(ops, who(db.app)); return res;
  }

  /* ---------- Auth ---------- */
  const apps = new Map();
  const initializeApp = (cfg, name = '[DEFAULT]') => { const a = { name, options: cfg }; apps.set(name, a); return a; };
  const deleteApp = async a => { apps.delete(a.name); };
  const getAuth = app => (app._auth ||= { app, currentUser: null, subs: new Set() });
  const emitir = a => Promise.resolve().then(() => [...a.subs].forEach(f => f(a.currentUser)));
  const onAuthStateChanged = (a, cb) => { a.subs.add(cb); Promise.resolve().then(() => { if (a.subs.has(cb)) cb(a.currentUser); }); return () => a.subs.delete(cb); };
  async function signInWithEmailAndPassword(a, email, pass) {
    const u = users.get(email); await Promise.resolve();
    if (!u || u.password !== pass) throw err('auth/invalid-credential');
    a.currentUser = { uid: u.uid, email }; emitir(a); return { user: a.currentUser };
  }
  async function signOut(a) { a.currentUser = null; emitir(a); }
  async function createUserWithEmailAndPassword(a, email, pass) {
    await Promise.resolve();
    if (users.has(email)) throw err('auth/email-already-in-use');
    if (String(pass).length < 6) throw err('auth/weak-password');
    const u = { email, password: pass, uid: 'uid-' + email.split('@')[0] }; users.set(email, u); persist();
    a.currentUser = { uid: u.uid, email }; emitir(a); return { user: a.currentUser };
  }
  const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  async function reauthenticateWithCredential(u, cred) { const x = users.get(u.email); if (!x || x.password !== cred.password) throw err('auth/invalid-credential'); }
  async function updatePassword(u, np) { if (String(np).length < 6) throw err('auth/weak-password'); users.get(u.email).password = np; persist(); }

  const initializeFirestore = app => mkDb(app), getFirestore = app => mkDb(app);
  return {
    api: { initializeApp, deleteApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
      initializeFirestore, persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), getFirestore, collection, doc, onSnapshot, query, where, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, runTransaction },
    store, users, log, permitido, ctx
  };
}
