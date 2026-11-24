# Bioingeniería · Software en producción

Proyectos de software de **Angel Balderas Serrano** (Bioingeniería Médica, UAEMéx), construidos y usados en instituciones públicas de salud en Toluca, México.

## Proyectos

| Proyecto | Qué hace | Stack |
|---|---|---|
| [agenda-terapeuta-api](agenda-terapeuta-api/) | API REST para apartar y gestionar citas de un terapeuta particular, con estados y agenda actual. | FastAPI, Pydantic, SQLite |
| [sistema-mantenimiento-ceree](sistema-mantenimiento-ceree/) | App de escritorio para órdenes de servicio, inventario, semáforo de estados e historial del CEREE. | Python, CustomTkinter, Firebase Firestore, FPDF |
| [sistema-mantenimiento-hgo](sistema-mantenimiento-hgo/) | App de escritorio del Depto. de Bioingeniería del Hospital de Ginecología y Obstetricia: órdenes de servicio, alertas push reales (FCM), semáforo con dashboard, calendario de mantenimiento preventivo y reportes PDF. | Python, CustomTkinter, Firebase Firestore, FCM, Matplotlib, FPDF |
| [equianza](equianza/) | App web para clínica dental: agenda por consultorio, pacientes, dentistas, recordatorios por WhatsApp, avisos al celular y reportes. | JavaScript, Firebase (Auth, Firestore, Hosting), PWA + Electron |
| [la-onda-fit](la-onda-fit/) | App web para gimnasio: control de acceso, miembros con foto, pagos y asistencias. | JavaScript, Firebase (Auth, Firestore, Hosting), PWA |

## Contexto real

Los dos sistemas de mantenimiento digitalizan el trabajo que antes se hacía en papel: órdenes de servicio, inventario de equipo médico, estados FUNCIONAL / PRECAUCIÓN / FUERA DE SERVICIO y el historial de mantenimiento, con reportes PDF oficiales. En el CEREE, la operación de mantenimiento rediseñada con metodología Lean elevó la operatividad del equipo médico al 90% en tres meses.

## Cómo correr cada proyecto

Cada carpeta tiene su propio `README.md` y `requirements.txt`.

```bash
pip install -r <proyecto>/requirements.txt
```

## Notas

- Las llaves de servicio de Firebase (`llave.json`, `llave_hgo.json`) **no están incluidas** por seguridad: cada despliegue usa su propia llave. El archivo `logo_imss.png` tampoco está incluido; la app funciona sin él.
- `agenda-terapeuta-api/database.py` se completó a partir del uso que `main.py` hace de él (tabla `citas` en SQLite).
- Autor: Angel Balderas Serrano — [linkedin.com/in/angelbalserr16](https://linkedin.com/in/angelbalserr16)
