# Sistema de Mantenimiento BIM · CEREE

App de escritorio (**Python + CustomTkinter + Firebase Firestore**) para el Departamento de Ingeniería Biomédica del Centro Estatal de Rehabilitación y Educación Especial (CEREE), Toluca.

## Qué hace

- **Órdenes de servicio**: captura por área (Mecanoterapia, Electroterapia, Hidroterapia, etc.), con clasificación preventivo/correctivo, diagnóstico y reporte en PDF oficial.
- **Inventario**: búsqueda de equipos por ID o nombre, con filtros por área.
- **Semáforo**: contadores FUNCIONAL / PRECAUCIÓN / FUERA DE SERVICIO y tabla de equipos que requieren atención.
- **Historial**: órdenes guardadas en Firebase, con opción de eliminar.
- **Administración**: alta de equipos nuevos a la nube.

## Cómo correrla

```bash
pip install -r requirements.txt
python main.py
```

## Requisitos

- **Llave de servicio de Firebase** (`llave.json`) en la misma carpeta. No está incluida en el repositorio por seguridad.
- `logo_imss.png` (opcional): si no existe, la app funciona sin el logo en el PDF.
