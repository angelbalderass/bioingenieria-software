import assert from 'node:assert/strict';
import * as U from '../public/util.js';
// meses y calendario
assert.equal(U.mesDe('2026-11-18'),'2026-11');
assert.equal(U.sumaMeses('2026-11',1),'2026-12');
assert.equal(U.sumaMeses('2026-12',1),'2027-01');
assert.equal(U.sumaMeses('2026-01',-1),'2025-12');
const sem=U.semanasDelMes('2026-11');                 // 1 de noviembre de 2026 es domingo
assert.equal(sem.length,6);                           // lun 26 oct ... dom 6 dic
assert.equal(sem[0][0].f,'2026-10-26'); assert.equal(sem[0][0].dentro,false);
assert.equal(sem[0][6].f,'2026-11-01'); assert.equal(sem[0][6].dentro,true);
assert.equal(sem[5][0].f,'2026-11-30'); assert.equal(sem[5][1].dentro,false);
assert.equal(sem.flat().filter(d=>d.dentro).length,30);
const feb=U.semanasDelMes('2027-02');                 // 1 de febrero de 2027 es lunes y tiene 28 días: 4 semanas exactas
assert.equal(feb.length,4); assert.equal(feb[0][0].f,'2027-02-01'); assert.ok(feb.flat().every(d=>d.dentro));
// teléfonos, WhatsApp y edad
assert.equal(U.digitos('55 5551-0001'),'5555510001');
assert.equal(U.linkWhatsApp('55 5551 0001','Hola ñ'),'https://wa.me/525555510001?text=Hola%20%C3%B1');
assert.equal(U.linkWhatsApp('123',''),'');
assert.equal(U.linkTel('55 5551 0001'),'tel:+525555510001');
assert.equal(U.edad('2000-06-15','2026-06-14'),25);
assert.equal(U.edad('2000-06-15','2026-06-15'),26);
assert.equal(U.edad('',"2026-01-01"),null);
// traslapes
const cs=[{id:'a',fecha:'2026-11-08',hora:'10:00',duracion:60,consultorioId:'c1',dentistaId:'d1',estado:'programada'}];
assert.ok(U.buscarTraslape(cs,{fecha:'2026-11-08',hora:'10:30',duracion:30,consultorioId:'c1',dentistaId:'d1'}));
assert.equal(U.buscarTraslape(cs,{fecha:'2026-11-08',hora:'11:00',duracion:30,consultorioId:'c1',dentistaId:'d1'}),null);
assert.equal(U.buscarTraslape(cs,{fecha:'2026-11-08',hora:'10:30',duracion:30,consultorioId:'c2',dentistaId:'d2'}),null);
assert.equal(U.buscarTraslape(cs,{fecha:'2026-11-08',hora:'10:30',duracion:30,consultorioId:'c1',dentistaId:'d1'},'a'),null);
cs[0].estado='cancelada';
assert.equal(U.buscarTraslape(cs,{fecha:'2026-11-08',hora:'10:30',duracion:30,consultorioId:'c1',dentistaId:'d1'}),null);
// aviso previo
const c={estado:'programada',hora:'10:00'};
assert.equal(U.debeAvisarCita(c,9*60+44,15),false);
assert.equal(U.debeAvisarCita(c,9*60+45,15),true);
assert.equal(U.debeAvisarCita(c,10*60+5,15),true);
assert.equal(U.debeAvisarCita(c,10*60+6,15),false);
assert.equal(U.debeAvisarCita({...c,avisoPrevio:true},9*60+50,15),false);
assert.equal(U.debeAvisarCita({...c,estado:'llego'},9*60+50,15),false);
assert.equal(U.fmtHora12('13:05'),'1:05 p. m.');
assert.equal(U.aCSV([['a','b,c'],[1,'x"y']]).slice(1),'a,"b,c"\r\n1,"x""y"');
console.log('util.js: todas las pruebas pasan');
