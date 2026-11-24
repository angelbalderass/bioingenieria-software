# Equianza · Clínica dental

Aplicación web para la clínica: **agenda de citas por consultorio, directorio de pacientes y de dentistas, avisos al celular y reportes**.
Funciona en computadora y en celular (se puede "instalar" desde el navegador) y también como programa de Windows (`.exe`, ver más abajo).

Corre sobre **Firebase, plan gratuito (Spark)**: Authentication (usuario y contraseña), Firestore (datos) y Hosting (la página). No hay paso de compilación.

## Cómo se usa en la clínica

- **El dentista principal entra como _Administrador_.** Ve la pestaña **Resumen** (las citas de hoy de los 3 consultorios de un vistazo) y la **Agenda** con un botón por consultorio ("Todos", "Consultorio 1", "Consultorio 2"…). Puede cambiar entre vista **Día** y vista **Calendario** (mes completo con puntos de color por consultorio y el total de citas de cada día; al tocar un día se ven sus citas).
- **Desde el celular:** abre la dirección de la página, entra con tu usuario y usa el botón flotante **+ Nueva cita**. Escribes el nombre del paciente: si ya está en el directorio se completa su teléfono; si es nuevo, puedes guardarlo en el directorio en el mismo paso.
- **Un dentista puede atender en varios consultorios** (por ejemplo, el principal en el suyo y en los otros dos): al asignarlo, sus citas y su agenda incluyen todos.
- **Pacientes:** directorio con buscador (nombre, teléfono o correo), ficha con teléfono, nacimiento, notas (alergias, etc.) e historial de citas, y botón **Agendar cita** desde la ficha.
- **Recordar por WhatsApp:** cada cita pendiente con teléfono tiene un botón que abre WhatsApp con el recordatorio ya escrito (lo mandas tú con un toque).

### Quién puede qué

| | Administrador | Recepción | Dentista |
|---|---|---|---|
| Resumen del día | ✔ | | |
| Agenda de citas | todos los consultorios | todos los consultorios | solo los suyos |
| Agendar, editar, cancelar, marcar "Llegó" | ✔ | ✔ | agenda en los suyos |
| Iniciar y terminar consulta | ✔ | | ✔ (las suyas) |
| Pacientes | ve, crea, edita, borra | ve, crea, edita | solo ve |
| Directorio de dentistas | ✔ edita | ve | |
| Consultorios | ✔ edita | ve | solo los suyos |
| Reportes (citas, ocupación) y CSV | ✔ | | |
| Crear y desactivar usuarios | ✔ | | |

## Puesta en marcha (≈20 minutos)

1. **Crear el proyecto:** https://console.firebase.google.com → *Agregar proyecto* (Google Analytics no hace falta).
2. **Authentication:** *Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar*.
3. **Firestore:** *Compilación → Firestore Database → Crear base de datos* → modo **producción** → región cercana (por ejemplo `us-south1` o `nam5`).
4. **Datos de conexión:** *Configuración del proyecto (⚙) → Tus apps → `</>` Web* → registra la app → copia el bloque `firebaseConfig` y **pégalo en `public/firebase-config.js`** (reemplaza los textos "PEGA_AQUI…").
5. **Publicar** (necesitas Node.js; en Windows abre PowerShell dentro de esta carpeta):
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add        # elige tu proyecto
   firebase deploy           # sube la página, las reglas de seguridad y el índice
   ```
   Te da la dirección `https://TU-PROYECTO.web.app`. Úsala en recepción y en los celulares.
   > El **índice** de las citas tarda unos minutos en quedar listo tras el primer `deploy`. Si aparece "preparando un índice", espera y recarga.
6. **Primer administrador (una sola vez, a mano):**
   - *Authentication → Usuarios → Agregar usuario*: correo `dueno@equianza.app` (puedes cambiar `dueno` o usar tu correo real) y una contraseña. **Copia el UID**.
   - *Firestore → Iniciar colección* → ID de colección `usuarios` → **ID del documento = ese UID** → campos:
     `usuario` (string) = `dueno` · `nombre` (string) = `Dr. Tu Nombre` · `rol` (string) = `admin` · `activo` (boolean) = `true`
   - Entra a la app escribiendo solo `dueno` y tu contraseña (si usaste un correo real, escribe el correo completo).
7. **Dentro de la app:**
   - *Cuenta → Datos de ejemplo → Cargar ejemplos* si quieres explorar con datos ficticios (se borran con un botón y no tocan lo que captures tú).
   - Da de alta a los **dentistas** (pestaña Dentistas) y los **consultorios** (pestaña Consultorios: número, piso, especialidad y dentista asignado).
   - *Cuenta → Usuarios del sistema*: crea el usuario de recepción y uno por cada dentista que vaya a entrar (el rol *Dentista* se liga a su ficha). Cada quien entra con su usuario corto; la app lo convierte en `usuario@equianza.app`.
   - *Cuenta → Datos de la clínica*: nombre y ciudad que salen arriba.

## Avisos al celular (ntfy.sh)

Sirve para: **(a)** avisar (al dentista y al administrador) cuando recepción marca que **llegó un paciente** y **(b)** avisar al dentista unos minutos **antes de su cita** (por defecto 15).

1. Cada persona instala la app gratuita **ntfy** (Play Store / App Store), toca **+** y escribe su **tema** (servidor ntfy.sh).
2. **Administrador:** *Cuenta → Avisos del administrador → Generar tema nuevo → Guardar → Enviar prueba*. Recibe el aviso de **llegada** de cualquier paciente (se puede apagar); el recordatorio previo va solo al dentista de esa cita.
3. **Cada dentista:** su tema se crea solo al darlo de alta; lo ve en *Cuenta → Avisos en mi celular* y ahí manda una prueba.

Límites que debes conocer:
- **El recordatorio de "cita cerca" lo manda una computadora con la app abierta** (recepción o administración): el plan gratuito no tiene un servidor que lo haga solo. Si nadie la tiene abierta, ese recordatorio no sale. El aviso de **"Llegó"** sí sale siempre, porque lo dispara quien pulsa el botón. Por eso el programa de Windows se configura para abrirse con la PC.
- **Privacidad:** ntfy.sh es un servicio público. Los avisos incluyen el **nombre del paciente** y el motivo; viajan sin cifrar y quien conozca el tema puede leerlos. Los temas son largos y aleatorios, pero no los compartas. Como son datos de salud, si quieres más cuidado conviene un servidor ntfy propio o que el aviso lleve solo iniciales (se puede agregar).

## Programa de Windows (`escritorio/`)

Es una ventana que abre tu página de Firebase (los datos siguen en la nube; se actualiza sola cuando publicas cambios).

1. Abre `escritorio/config.json` y cambia `TU-PROYECTO` por la dirección real (ejemplo `https://equianza-1234.web.app`).
2. En Windows, con Node.js instalado, haz doble clic en `escritorio/crear-exe.bat`. El instalador queda en `escritorio/salida/`.
3. Instálalo en la PC de recepción. Con `"iniciarConWindows": true` se abre solo al prender la computadora.

## Datos de pacientes y seguridad

- Las reglas (`firestore.rules`) deciden quién lee y escribe **en el servidor**; ocultar un botón en pantalla no es lo que protege los datos.
- **El directorio de pacientes lo pueden leer recepción, administración y todos los dentistas** (no solo "sus" pacientes), porque en una clínica chica comparten pacientes. Las **citas** sí: cada dentista solo lee las de sus consultorios. Si prefieres que cada dentista vea solo a sus pacientes, hay que cambiar esa regla.
- Un usuario desactivado pierde el acceso al instante. Si alguien olvida su contraseña: desactívalo y crea otro usuario (o, con correo real, *Authentication → ⋮ → Restablecer contraseña*).
- Son datos personales de salud: usa contraseñas largas, no compartas usuarios y desactiva a quien deje de trabajar en la clínica. Respaldo: exporta de vez en cuando desde la consola de Firebase o descarga el CSV de *Reportes*.
- **Tamaño:** la app carga todo el directorio de pacientes al abrirse. Con unos pocos miles de pacientes cabe holgadamente en el plan gratuito; con muchos más conviene cambiar a una búsqueda por servidor.

## Qué se probó y qué NO

**Probado aquí** (`pruebas/e2e.cjs`: 103 comprobaciones con Chromium automatizado y un **Firebase simulado**; `pruebas/util.test.mjs`: cálculos de fechas, calendario y empalmes):
entrada con usuario/contraseña, las tres vistas por rol, resumen del día, agenda por consultorio (día y calendario del mes, filtros), agendar con buscador de pacientes (paciente nuevo → directorio), choque de horarios, un dentista con dos consultorios, "Llegó" con avisos a dentista y administrador, recordatorio previo (reloj controlado, una sola vez), directorio de pacientes (búsqueda, ficha, historial, duplicados), reportes y CSV, alta y desactivación de usuarios, pantalla de 390 px (celular) sin desplazamiento horizontal y con botón flotante, y cero errores en la consola.

**NO se pudo probar** (hazlo tú al publicar):
1. **Firebase real.** El simulador imita Firestore y una *traducción hecha a mano* de `firestore.rules`; no es el emulador real (aquí está bloqueado). Las reglas no se han ejecutado en Firebase. Después de `firebase deploy` prueba en *Firestore → Reglas → Simulador*:
   - Recepción: leer `usuarios/…` → **negar**; leer y crear `citas/…` y `pacientes/…` → **permitir**; borrar un paciente → **negar**.
   - Dentista A: leer una cita con `dentistaId` de B → **negar**; cambiar el `estado` de su cita → **permitir**; cambiar `paciente` de su cita → **negar**; editar un paciente → **negar**.
   - Usuario con `activo: false` → todo **negado**.
   Y en la app real entra con un usuario de cada rol y confirma que cada quien ve solo lo suyo. En particular, la consulta del dentista (`dentistaId == el suyo`) debe funcionar con las reglas; si la consola dice "permission-denied" para un dentista, avísame.
2. **Crear usuarios desde la app** con Firebase Authentication real (en el simulador funciona; en producción usa una segunda conexión para no cerrar tu sesión).
3. **Llegada de avisos a un celular real** con la app ntfy (solo se verificó que la app envía la solicitud correcta).
4. **El instalador `.exe`**: no se pudo generar ni ejecutar aquí (requiere Windows). El código está revisado de sintaxis pero hay que construirlo y probarlo en una PC.
5. **Instalar como app en celular** (iPhone/Android) y navegadores distintos de Chromium (Safari, Firefox). La vista de celular se probó solo con un Chromium en ventana de 390 px, no en un teléfono real.
6. **Sin internet**: abre la última versión guardada, pero para ver o cambiar datos necesita conexión (no se probó apagando la red).

## Estructura

```
public/            la página (index.html, app.js + un archivo por sección, app.css, firebase-config.js)
firestore.rules    reglas de seguridad por rol
firestore.indexes.json   índice para la agenda del dentista
firebase.json      Hosting + reglas + índice
escritorio/        programa de Windows (Electron)
pruebas/           pruebas automáticas (opcionales; node pruebas/e2e.cjs)
```
