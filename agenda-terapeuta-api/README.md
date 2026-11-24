# API de Agenda para Terapeuta Particular

API REST con **FastAPI + SQLite** para apartar y gestionar citas.

## Endpoints

- `POST /citas/apartar` — aparta una cita (valida formato de fecha/hora y que el horario no esté ocupado).
- `PATCH /citas/{cita_id}/estado` — cambia el estado: `disponible`, `apartado`, `confirmado`, `cancelada`, `completada`.
- `GET /citas/agenda-actual` — devuelve todas las citas ordenadas por fecha y hora.

## Cómo correrla

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

La base de datos (`agenda.db`) se crea sola al arrancar.

## Notas

- La notificación push al terapeuta está simulada con un `print` en `main.py`; no hay envío real de FCM en este proyecto.
- El frontend (Ionic) no está incluido en este repositorio.
