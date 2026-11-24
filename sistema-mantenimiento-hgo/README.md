# Sistema de Mantenimiento BIM · HGO

App de escritorio (**Python + CustomTkinter + Firebase Firestore + FCM**) para el Departamento de Ingeniería Biomédica del Hospital de Ginecología y Obstetricia (HGO), Toluca.

## Qué hace

- **Órdenes de servicio**: formato oficial IMIEM con filtros inteligentes por área y texto, clasificación, causa de falla, estados inicial/final y reporte en PDF.
- **Alertas push reales**: cuando un equipo pasa a FUERA DE SERVICIO se envía una alerta FCM a los celulares registrados; un vigía en segundo plano procesa las alertas pendientes.
- **Semáforo y dashboard**: contadores FUNCIONAL / FUERA DE SERVICIO y gráfica de dona con Matplotlib.
- **Calendario de mantenimiento preventivo**: agenda mensual por técnico, con exportación a CSV y programa impreso en PDF por técnico.
- **Inventario, historial con detalle y alta de equipos**, con menús separados de Administrador (con PIN) y Técnico.

## Cómo correrla

```bash
pip install -r requirements.txt
python main.py
```

## Requisitos

- **Llave de servicio de Firebase** (`llave_hgo.json`) en la misma carpeta. No está incluida en el repositorio por seguridad.
- **PIN de administrador** con la variable de entorno `ADMIN_PIN` (sin ella, el acceso de administrador queda deshabilitado). Ejemplo: `ADMIN_PIN=tu-pin python main.py`.
- `logo_imss.png` (opcional): si no existe, la app funciona sin el logo en el PDF.
