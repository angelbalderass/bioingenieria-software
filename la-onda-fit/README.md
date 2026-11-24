# La Onda Fit — Control de acceso y membresías

App web (Firebase Hosting + Authentication + Firestore, plan gratuito Spark).
Cada persona entra con **su propio usuario y contraseña** (sin cuentas de Claude).

- **Administrador (dueño):** Recepción, Miembros (alta/edición con foto), Pagos, Asistencias, Cuenta (crear/desactivar usuarios).
- **Recepción:** Recepción (panel de entrada), Asistencias, Cuenta (cambiar su contraseña). No ve pagos ni edita miembros.

## Puesta en marcha (≈15 min)

1. **Proyecto:** en https://console.firebase.google.com → *Agregar proyecto* (Google Analytics no hace falta).
2. **Authentication:** *Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar*.
3. **Firestore:** *Compilación → Firestore Database → Crear base de datos* → modo **producción** → región más cercana.
4. **Configuración web:** *Configuración del proyecto (⚙) → Tus apps → `</>` Web* → registra la app → copia el objeto `firebaseConfig` y pégalo en `public/firebase-config.js`.
5. **Publicar** (necesitas Node.js instalado), en esta carpeta:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add        # elige tu proyecto
   firebase deploy           # sube la página y las reglas de seguridad
   ```
   Al terminar te da la URL (`https://TU-PROYECTO.web.app`). Ábrela en la PC de recepción y en los teléfonos; se puede "instalar" como app desde el navegador.
6. **Primer administrador (una sola vez, a mano):**
   - *Authentication → Usuarios → Agregar usuario*: correo `dueno@laondafit.app` (puedes cambiar `dueno`) y una contraseña. Copia el **UID** del usuario.
   - *Firestore → Iniciar colección* `usuarios` → ID del documento = ese **UID** → campos:
     `usuario` (string) = `dueno` · `nombre` (string) = `Dueño` · `rol` (string) = `admin` · `activo` (boolean) = `true`
   - Entra a la app escribiendo solo `dueno` y tu contraseña.
7. **Demás usuarios:** pestaña **Cuenta → Usuarios del sistema** → crea el de recepción (rol *Recepción*), etc. En el login se escribe solo el nombre de usuario (la app le agrega internamente `@laondafit.app`).
8. En *Miembros* hay un botón para cargar **datos de ejemplo** (y otro para borrarlos).

## Notas importantes

- **Contraseña olvidada:** desde la app no se puede restablecer la de otro usuario. Opciones: desactivar ese usuario y crear otro nombre de usuario; o, en la consola de Firebase, *Authentication → Usuarios → ⋮ → Restablecer contraseña* (solo si el usuario se creó con un correo real). Para el dueño se recomienda un correo real (por ejemplo `su-correo@gmail.com`; en el login se escribe el correo completo).
- **Seguridad:** las reglas (`firestore.rules`) exigen usuario activo en la colección `usuarios`. Recepción solo puede leer miembros y *agregar* entradas; pagos y cambios son solo de administrador. Desactivar a alguien le quita el acceso al instante. **Prueba las reglas** en *Firestore → Reglas → Simulador* tras publicarlas (no pude probarlas con el emulador).
- **Fotos:** se guardan reducidas (≈25 KB) dentro de cada miembro; no se usa Storage (requiere plan de pago).
- **Plan gratuito:** sobra para ~40 miembros (50 000 lecturas y 20 000 escrituras al día).
- **Respaldo:** activa exportaciones periódicas o copia los datos desde la consola de vez en cuando.
- **Lector Hikvision:** pendiente hasta tener el equipo. La pantalla de Recepción ya recibe el *ID del lector* de cada miembro (por teclado/escáner o botón de simulación). Falta un programa pequeño en la PC que lea los eventos del lector (ISAPI) y los mande a esta página.
