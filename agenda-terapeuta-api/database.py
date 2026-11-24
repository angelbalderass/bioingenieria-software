# database.py — acceso a datos (SQLite) para la API de Agenda.
# main.py importa inicializar_bd y obtener_conexion de este módulo.
# Nota: este archivo se completó a partir del uso que main.py hace de él
# (tabla `citas` con las columnas que la API lee y escribe).
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agenda.db")


def obtener_conexion():
    conn = sqlite3.connect(DB_PATH)
    # Permite acceso por nombre de columna: fila["id"], fila["estado"], ...
    conn.row_factory = sqlite3.Row
    return conn


def inicializar_bd():
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS citas (
            id TEXT PRIMARY KEY,
            paciente_nombre TEXT NOT NULL,
            paciente_telefono TEXT NOT NULL,
            fecha TEXT NOT NULL,
            hora_inicio TEXT NOT NULL,
            hora_fin TEXT NOT NULL,
            estado TEXT NOT NULL,
            actualizado_en TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()
