from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date, time
import uuid
from database import inicializar_bd, obtener_conexion

app = FastAPI(title="API de Agenda para Terapeuta Particular")
from fastapi.middleware.cors import CORSMiddleware

# Permitir que Ionic se conecte sin bloqueos de seguridad
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción puedes especificar los dominios exactos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar la base de datos al arrancar el servidor
@app.on_event("startup")
def startup_event():
    inicializar_bd()

# --- MODELOS DE VALIDACIÓN (PYDANTIC) ---
# Validar los datos de entrada previene errores de ejecución por formatos incorrectos

class CitaBase(BaseModel):
    paciente_nombre: str = Field(..., min_length=1)
    paciente_telefono: str = Field(..., min_length=10)
    fecha: str = Field(..., description="Formato YYYY-MM-DD")
    hora_inicio: str = Field(..., description="Formato HH:MM")
    hora_fin: str = Field(..., description="Formato HH:MM")

    @field_validator('fecha')
    def validar_formato_fecha(cls, value):
        try:
            # Forzar validación estricta de la estructura de la fecha
            datetime.strptime(value, "%Y-%m-%d")
            return value
        except ValueError:
            raise ValueError("La fecha debe tener un formato válido YYYY-MM-DD y ser una fecha real.")

    @field_validator('hora_inicio', 'hora_fin')
    def validar_formato_hora(cls, value):
        try:
            datetime.strptime(value, "%H:%M")
            return value
        except ValueError:
            raise ValueError("La hora debe tener un formato válido HH:MM (24 horas).")

class CambioEstadoRequest(BaseModel):
    nuevo_estado: str

# --- SIMULACIÓN DE NOTIFICACIONES PUSH ---
def simular_notificacion_terapeuta(paciente: str, fecha: str, hora: str):
    """Simula el envío de una alerta push nativa al dispositivo del terapeuta."""
    print(f"\n[PUSH NOTIFICATION SENT] -> Alerta celular: El paciente '{paciente}' ha APARTADO el horario de las {hora} el día {fecha}.\n")

# --- ENDPOINTS / RUTAS ---

@app.post("/citas/apartar", status_code=status.HTTP_201_CREATED)
def apartar_cita(cita: CitaBase):
    # Verificación adicional de coherencia en el rango horario
    t_inicio = datetime.strptime(cita.hora_inicio, "%H:%M").time()
    t_fin = datetime.strptime(cita.hora_fin, "%H:%M").time()
    if t_inicio >= t_fin:
        raise HTTPException(status_code=400, detail="La hora de inicio debe ser anterior a la hora de finalización.")

    conn = obtener_conexion()
    cursor = conn.cursor()

    try:
        # Verificar si ya existe una cita activa en ese bloque exacto
        cursor.execute('''
            SELECT id FROM citas 
            WHERE fecha = ? AND hora_inicio = ? AND estado != 'cancelada'
        ''', (cita.fecha, cita.hora_inicio))
        
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Este horario ya se encuentra ocupado o reservado.")

        # Insertar nueva cita en estado 'apartado'
        cita_id = str(uuid.uuid4())
        ahora_iso = datetime.now().isoformat()
        
        cursor.execute('''
            INSERT INTO citas (id, paciente_nombre, paciente_telefono, fecha, hora_inicio, hora_fin, estado, actualizado_en)
            VALUES (?, ?, ?, ?, ?, ?, 'apartado', ?)
        ''', (cita_id, cita.paciente_nombre, cita.paciente_telefono, cita.fecha, cita.hora_inicio, cita.hora_fin, ahora_iso))
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error interno al registrar la cita: {str(e)}")
    finally:
        conn.close()

    # Disparar la alerta push inmediatamente al concretar el estado 'apartado'
    simular_notificacion_terapeuta(cita.paciente_nombre, cita.fecha, cita.hora_inicio)

    return {"status": "success", "message": "Cita apartada exitosamente", "cita_id": cita_id}


@app.patch("/citas/{cita_id}/estado")
def cambiar_estado_cita(cita_id: str, request: CambioEstadoRequest):
    estados_validos = ["disponible", "apartado", "confirmado", "cancelada", "completada"]
    nuevo_est = request.nuevo_estado.lower()

    if nuevo_est not in estados_validos:
        raise HTTPException(status_code=400, detail=f"Estado no válido. Opciones: {', '.join(estados_validos)}")

    conn = obtener_conexion()
    cursor = conn.cursor()

    # Verificar existencia de la cita
    cursor.execute("SELECT estado FROM citas WHERE id = ?", (cita_id,))
    fila = cursor.fetchone()
    if not fila:
        conn.close()
        raise HTTPException(status_code=404, detail="La cita especificada no existe.")

    # Actualizar estado
    ahora_iso = datetime.now().isoformat()
    cursor.execute('''
        UPDATE citas 
        SET estado = ?, actualizado_en = ? 
        WHERE id = ?
    ''', (nuevo_est, ahora_iso, cita_id))
    
    conn.commit()
    conn.close()

    return {"status": "success", "cita_id": cita_id, "nuevo_estado": nuevo_est}


@app.get("/citas/agenda-actual")
def obtener_agenda():
    """Devuelve todas las citas registradas para que el paciente o terapeuta vean el estado."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM citas ORDER BY fecha ASC, hora_inicio ASC")
    filas = cursor.fetchall()
    conn.close()

    # Convertir filas de SQLite a formato JSON legible
    citas = []
    for fila in filas:
        citas.append({
            "id": fila["id"],
            "paciente_nombre": fila["paciente_nombre"],
            "paciente_telefono": fila["paciente_telefono"],
            "fecha": fila["fecha"],
            "hora_inicio": fila["hora_inicio"],
            "hora_fin": fila["hora_fin"],
            "estado": fila["estado"],
            "actualizado_en": fila["actualizado_en"]
        })
    return citas