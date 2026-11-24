import customtkinter as ctk
import os
from datetime import datetime
from tkinter import messagebox, ttk, filedialog
from fpdf import FPDF
import platform
import subprocess
import sys
import csv

# --- LIBRERÍAS DE LA NUBE ---
import firebase_admin
from firebase_admin import credentials, firestore, messaging, auth

# --- LIBRERÍAS GRÁFICAS DEL DASHBOARD ---
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

ctk.set_appearance_mode("Dark") 
ctk.set_default_color_theme("blue")

# --- CONEXIÓN A FIREBASE HGO ---
def conectar_firebase():
    if not firebase_admin._apps:
        if hasattr(sys, '_MEIPASS'):
            ruta_llave = os.path.join(sys._MEIPASS, 'llave_hgo.json')
        else:
            ruta_llave = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'llave_hgo.json')
            
        cred = credentials.Certificate(ruta_llave)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = conectar_firebase()

def obtener_ruta_logo():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'logo_imss.png')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo_imss.png')

# --- TRANSMISOR DE ALERTAS PUSH ---
def enviar_alerta_nativa_fcm(id_equipo, estado_final, area_equipo):
    try:
        tokens_ref = db.collection('tokens_notificaciones').stream()
        lista_tokens = [doc.to_dict().get('token') for doc in tokens_ref if doc.to_dict().get('token')]
        if not lista_tokens: return

        mensaje_fcm = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=f"🔴 ALERTA TINC: {estado_final}",
                body=f"Equipo {id_equipo} en {area_equipo} requiere atención inmediata."
            ),
            tokens=lista_tokens
        )
        messaging.send_each_for_multicast(mensaje_fcm)
    except Exception as e:
        print(f"Error push: {e}")

# --- VIGÍA EN SEGUNDO PLANO PARA MÓVIL ---
def iniciar_receptor_alertas():
    def on_snapshot(col_snapshot, changes, read_time):
        for change in changes:
            if change.type.name == 'ADDED':
                doc = change.document
                datos = doc.to_dict()
                if datos.get('procesada') == False:
                    enviar_alerta_nativa_fcm(datos.get('id_equipo'), datos.get('estado'), datos.get('area'))
                    db.collection('alertas_pendientes').document(doc.id).update({'procesada': True})
    db.collection('alertas_pendientes').where('procesada', '==', False).on_snapshot(on_snapshot)

iniciar_receptor_alertas()

# =========================================================
# ORDEN DE SERVICIO (FILTRO INTELIGENTE ÁREA + TEXTO)
# =========================================================
class VentanaNuevaOrden(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.title("Captura de Orden - BIM HGO")
        self.geometry("1050x900")
        self.lift(); self.focus_force()
        
        self.diccionario_equipos = {}; self.lista_completa_equipos = []
        self.grid_rowconfigure(0, weight=1); self.grid_columnconfigure(0, weight=1)

        self.scroll_frame = ctk.CTkScrollableFrame(self, label_text="FORMATO OFICIAL DE ORDEN DE SERVICIO", label_font=("Arial", 16, "bold"))
        self.scroll_frame.grid(row=0, column=0, padx=15, pady=15, sticky="nsew")
        self.scroll_frame.grid_columnconfigure((0, 1, 2, 3), weight=1)

        # ---------------- DATOS GENERALES ----------------
        f_gral = ctk.CTkFrame(self.scroll_frame, fg_color="#1d1d1d", border_width=1, border_color="#D4AF37")
        f_gral.grid(row=0, column=0, columnspan=4, padx=10, pady=10, sticky="ew")
        f_gral.grid_columnconfigure((0, 1, 2, 3, 4, 5), weight=1)

        self.fecha_actual = datetime.now().strftime("%d/%m/%Y")
        ctk.CTkLabel(f_gral, text="Unidad:").grid(row=0, column=0, padx=5, pady=5, sticky="e")
        self.combo_unidad = ctk.CTkComboBox(f_gral, values=["HGO", "HPN", "CEO"], width=100); self.combo_unidad.grid(row=0, column=1, padx=5, pady=5, sticky="w")
        
        ctk.CTkLabel(f_gral, text="Quien Reporta:").grid(row=0, column=2, padx=5, pady=5, sticky="e")
        self.entry_reporta = ctk.CTkEntry(f_gral, placeholder_text="Nombre de usuario", width=200); self.entry_reporta.grid(row=0, column=3, padx=5, pady=5, sticky="w")
        
        ctk.CTkLabel(f_gral, text=f"Fecha: {self.fecha_actual}", font=("Arial", 13, "bold")).grid(row=0, column=4, padx=5, pady=5, sticky="e")

        ctk.CTkLabel(f_gral, text="Área Solicitante (Filtro):", text_color="#10b981", font=("Arial", 12, "bold")).grid(row=1, column=0, padx=5, pady=5, sticky="e")
        self.combo_area = ctk.CTkComboBox(f_gral, values=["Todas"], width=200, command=self.filtrar_combo_equipos)
        self.combo_area.grid(row=1, column=1, columnspan=2, padx=5, pady=5, sticky="w")
        
        ctk.CTkLabel(f_gral, text="Sububicación:").grid(row=1, column=2, padx=5, pady=5, sticky="e")
        self.entry_sububicacion = ctk.CTkEntry(f_gral, placeholder_text="Ej. Cama 5", width=200); self.entry_sububicacion.grid(row=1, column=3, padx=5, pady=5, sticky="w")

        # ---------------- DATOS DEL EQUIPO (CON BUSCADOR) ----------------
        f_eq = ctk.CTkFrame(self.scroll_frame, fg_color="#1d1d1d", border_width=1)
        f_eq.grid(row=1, column=0, columnspan=4, padx=10, pady=10, sticky="ew")
        f_eq.grid_columnconfigure((0, 1, 2, 3), weight=1)

        # NUEVO: BARRA DE BÚSQUEDA INTELIGENTE
        ctk.CTkLabel(f_eq, text="Filtro de Texto:", text_color="#10b981", font=("Arial", 12, "bold")).grid(row=0, column=0, padx=5, pady=10, sticky="e")
        self.entry_busqueda_eq = ctk.CTkEntry(f_eq, placeholder_text="Escribe ID, Inv o Nombre...")
        self.entry_busqueda_eq.grid(row=0, column=1, padx=5, pady=10, sticky="ew")
        self.entry_busqueda_eq.bind("<KeyRelease>", self.filtrar_combo_equipos)

        ctk.CTkLabel(f_eq, text="Seleccionar Equipo:", font=("Arial", 12, "bold")).grid(row=0, column=2, padx=5, pady=10, sticky="e")
        self.combo_id = ctk.CTkComboBox(f_eq, values=["Cargando equipos..."], width=350, command=self.autocompletar_campos_equipo)
        self.combo_id.grid(row=0, column=3, padx=5, pady=10, sticky="w")

        ctk.CTkLabel(f_eq, text="Clave:").grid(row=1, column=0, padx=5, pady=5, sticky="e"); self.entry_clave = ctk.CTkEntry(f_eq, state="disabled"); self.entry_clave.grid(row=1, column=1, padx=5, pady=5, sticky="ew")
        ctk.CTkLabel(f_eq, text="Inventario:").grid(row=1, column=2, padx=5, pady=5, sticky="e"); self.entry_inventario = ctk.CTkEntry(f_eq, state="disabled"); self.entry_inventario.grid(row=1, column=3, padx=5, pady=5, sticky="ew")
        ctk.CTkLabel(f_eq, text="Equipo:").grid(row=2, column=0, padx=5, pady=5, sticky="e"); self.entry_equipo = ctk.CTkEntry(f_eq, state="disabled"); self.entry_equipo.grid(row=2, column=1, columnspan=3, padx=5, pady=5, sticky="ew")
        ctk.CTkLabel(f_eq, text="Marca:").grid(row=3, column=0, padx=5, pady=5, sticky="e"); self.entry_marca = ctk.CTkEntry(f_eq, state="disabled"); self.entry_marca.grid(row=3, column=1, padx=5, pady=5, sticky="ew")
        ctk.CTkLabel(f_eq, text="Modelo:").grid(row=3, column=2, padx=5, pady=5, sticky="e"); self.entry_modelo = ctk.CTkEntry(f_eq, state="disabled"); self.entry_modelo.grid(row=3, column=3, padx=5, pady=5, sticky="ew")
        ctk.CTkLabel(f_eq, text="Serie:").grid(row=4, column=0, padx=5, pady=5, sticky="e"); self.entry_serie = ctk.CTkEntry(f_eq, state="disabled"); self.entry_serie.grid(row=4, column=1, columnspan=3, padx=5, pady=5, sticky="ew")

        # ---------------- CLASIFICACIÓN Y ESTADOS ----------------
        f_clas = ctk.CTkFrame(self.scroll_frame, fg_color="transparent")
        f_clas.grid(row=2, column=0, columnspan=4, padx=10, pady=5, sticky="ew")
        f_clas.grid_columnconfigure((0, 1, 2, 3), weight=1)

        ctk.CTkLabel(f_clas, text="Clasificación del Servicio:").grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.combo_clasificacion = ctk.CTkComboBox(f_clas, values=["MANTENIMIENTO CORRECTIVO", "MANTENIMIENTO PREVENTIVO", "ASESORÍA Y CAPACITACIÓN", "SUMINISTRO (INSUMO-ACCESORIO)", "INSPECCIÓN", "OTRO"], width=250)
        self.combo_clasificacion.grid(row=1, column=0, padx=5, pady=5, sticky="w")

        ctk.CTkLabel(f_clas, text="Causa de la Falla:").grid(row=0, column=1, padx=5, pady=5, sticky="w")
        self.combo_causa = ctk.CTkComboBox(f_clas, values=["MAL USO", "FALLA EQUIPO", "DESGASTE", "OTRO", "SIN FALLA"], width=200)
        self.combo_causa.grid(row=1, column=1, padx=5, pady=5, sticky="w")

        ctk.CTkLabel(f_clas, text="Estado Inicial:").grid(row=0, column=2, padx=5, pady=5, sticky="w")
        self.combo_est_inicial = ctk.CTkComboBox(f_clas, values=["FUNCIONAL", "FUERA DE SERVICIO"], width=150)
        self.combo_est_inicial.grid(row=1, column=2, padx=5, pady=5, sticky="w")

        ctk.CTkLabel(f_clas, text="Estado Final:").grid(row=0, column=3, padx=5, pady=5, sticky="w")
        self.combo_est_final = ctk.CTkComboBox(f_clas, values=["FUNCIONAL", "FUERA DE SERVICIO"], width=150)
        self.combo_est_final.grid(row=1, column=3, padx=5, pady=5, sticky="w")

        # ---------------- CAJAS DE TEXTO GRANDES ----------------
        ctk.CTkLabel(self.scroll_frame, text="Descripción del Reporte:", font=("Arial", 12, "bold")).grid(row=3, column=0, columnspan=2, padx=10, sticky="w")
        self.txt_reporte = ctk.CTkTextbox(self.scroll_frame, height=60); self.txt_reporte.grid(row=4, column=0, columnspan=2, padx=10, pady=(0,10), sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Diagnóstico del Equipo:", font=("Arial", 12, "bold")).grid(row=3, column=2, columnspan=2, padx=10, sticky="w")
        self.txt_diagnostico = ctk.CTkTextbox(self.scroll_frame, height=60); self.txt_diagnostico.grid(row=4, column=2, columnspan=2, padx=10, pady=(0,10), sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Descripción del Servicio:", font=("Arial", 12, "bold")).grid(row=5, column=0, columnspan=4, padx=10, sticky="w")
        self.txt_servicio = ctk.CTkTextbox(self.scroll_frame, height=80); self.txt_servicio.grid(row=6, column=0, columnspan=4, padx=10, pady=(0,10), sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Materiales/Refacciones:", font=("Arial", 12, "bold")).grid(row=7, column=0, columnspan=2, padx=10, sticky="w")
        self.txt_materiales = ctk.CTkTextbox(self.scroll_frame, height=60); self.txt_materiales.grid(row=8, column=0, columnspan=2, padx=10, pady=(0,10), sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Equipos/Herramientas utilizadas:", font=("Arial", 12, "bold")).grid(row=7, column=2, columnspan=2, padx=10, sticky="w")
        self.txt_herramientas = ctk.CTkTextbox(self.scroll_frame, height=60); self.txt_herramientas.grid(row=8, column=2, columnspan=2, padx=10, pady=(0,10), sticky="ew")

        # ---------------- CIERRE Y FIRMAS ----------------
        f_cierre = ctk.CTkFrame(self.scroll_frame, fg_color="transparent")
        f_cierre.grid(row=9, column=0, columnspan=4, padx=10, pady=5, sticky="ew")
        f_cierre.grid_columnconfigure((0, 1), weight=1)

        ctk.CTkLabel(f_cierre, text="Observaciones:").grid(row=0, column=0, padx=5, sticky="w")
        self.entry_observaciones = ctk.CTkEntry(f_cierre, width=400); self.entry_observaciones.grid(row=1, column=0, padx=5, sticky="w")

        ctk.CTkLabel(f_cierre, text="Atendió (Nombre del Técnico):").grid(row=0, column=1, padx=5, sticky="w")
        self.entry_atendio = ctk.CTkEntry(f_cierre, width=400)
        self.entry_atendio.insert(0, "Angel Balderas Serrano")
        self.entry_atendio.grid(row=1, column=1, padx=5, sticky="w")

        self.btn_guardar = ctk.CTkButton(self.scroll_frame, text="💾 Guardar Orden en Nube", font=("Arial", 14, "bold"), fg_color="#10b981", hover_color="#059669", command=self.guardar_orden)
        self.btn_guardar.grid(row=10, column=0, columnspan=2, padx=10, pady=20, ipady=5, sticky="ew")
        self.btn_imprimir = ctk.CTkButton(self.scroll_frame, text="🖨️ Imprimir Formato IMIEM", font=("Arial", 14, "bold"), fg_color="#ea580c", hover_color="#c2410c", command=self.imprimir_orden)
        self.btn_imprimir.grid(row=10, column=2, columnspan=2, padx=10, pady=20, ipady=5, sticky="ew")

        self.cargar_equipos_nube()

    def cargar_equipos_nube(self):
        try:
            equipos_ref = db.collection('equipos').stream()
            self.lista_completa_equipos = []
            areas_detectadas = set() 
            for doc in equipos_ref:
                eq = doc.to_dict(); eq['doc_id'] = doc.id
                texto = f"{eq.get('id_equipo', 'S/ID')} | {eq.get('nombre_equipo', 'S/N')} ({eq.get('area_asignada', 'S/A')})"
                self.diccionario_equipos[texto] = eq
                area_bd = eq.get('area_asignada', 'SIN ÁREA').strip().upper()
                
                # Guardamos la data completa en memoria para búsquedas rápidas
                self.lista_completa_equipos.append({
                    'texto': texto, 
                    'area': area_bd, 
                    'busqueda_cruda': f"{eq.get('id_equipo', '')} {eq.get('num_inventario', '')} {eq.get('nombre_equipo', '')}".lower()
                })
                
                if area_bd: areas_detectadas.add(area_bd)
            
            lista_areas = ["Todas"] + sorted(list(areas_detectadas))
            self.combo_area.configure(values=lista_areas)
            self.combo_area.set("Todas")
            self.filtrar_combo_equipos() 
        except: pass

    # --- LÓGICA DEL FILTRO COMBINADO (ÁREA + TEXTO) ---
    def filtrar_combo_equipos(self, event=None):
        area_sel = self.combo_area.get().upper()
        texto_busqueda = self.entry_busqueda_eq.get().lower()
        
        opciones = []
        for item in self.lista_completa_equipos:
            coincide_area = (area_sel == "TODAS" or area_sel == "CARGANDO ÁREAS..." or item['area'] == area_sel)
            coincide_texto = (texto_busqueda in item['busqueda_cruda'])
            
            if coincide_area and coincide_texto:
                opciones.append(item['texto'])
                
        if not opciones: opciones = ["No hay equipos que coincidan"]
        self.combo_id.configure(values=sorted(opciones))
        self.combo_id.set("--- Selecciona un equipo ---")
        
        # Limpiar formulario
        for entry in (self.entry_clave, self.entry_inventario, self.entry_equipo, self.entry_marca, self.entry_modelo, self.entry_serie):
            entry.configure(state="normal"); entry.delete(0, "end"); entry.configure(state="disabled")

    def autocompletar_campos_equipo(self, seleccion):
        eq = self.diccionario_equipos.get(seleccion)
        if eq:
            self.doc_id_seleccionado = eq['doc_id']
            for entry in (self.entry_clave, self.entry_inventario, self.entry_equipo, self.entry_marca, self.entry_modelo, self.entry_serie):
                entry.configure(state="normal"); entry.delete(0, "end")
            
            self.entry_clave.insert(0, eq.get('id_equipo', ''))
            self.entry_inventario.insert(0, eq.get('num_inventario', ''))
            self.entry_equipo.insert(0, eq.get('nombre_equipo', ''))
            self.entry_marca.insert(0, eq.get('marca', ''))
            self.entry_modelo.insert(0, eq.get('modelo', ''))
            self.entry_serie.insert(0, eq.get('serie', ''))
            
            for entry in (self.entry_clave, self.entry_inventario, self.entry_equipo, self.entry_marca, self.entry_modelo, self.entry_serie):
                entry.configure(state="disabled")
            
            # Sincronizamos el área seleccionada arriba
            self.combo_area.set(eq.get('area_asignada', '').upper())

    def guardar_orden(self):
        # ... (Código igual a la versión anterior de guardar)
        seleccion = self.combo_id.get()
        if "Cargando" in seleccion or "---" in seleccion or "No hay" in seleccion: return
        eq = self.diccionario_equipos.get(seleccion)
        self.folio_temp = datetime.now().strftime('%y%m%d%H%M')
        
        nueva_orden = {
            'folio': self.folio_temp, 'fecha': datetime.now().isoformat(), 'unidad': self.combo_unidad.get(),
            'quien_reporta': self.entry_reporta.get(), 'area_solicitante': self.combo_area.get(),
            'sububicacion': self.entry_sububicacion.get(), 'clave_equipo': eq.get('id_equipo', ''),
            'num_inventario': eq.get('num_inventario', ''), 'clasificacion': self.combo_clasificacion.get(),
            'causa_falla': self.combo_causa.get(), 'estado_inicial': self.combo_est_inicial.get(),
            'falla_reportada': self.txt_reporte.get("1.0", "end-1c"), 'diagnostico': self.txt_diagnostico.get("1.0", "end-1c"), 
            'trabajo_realizado': self.txt_servicio.get("1.0", "end-1c"), 'materiales': self.txt_materiales.get("1.0", "end-1c"), 
            'herramientas': self.txt_herramientas.get("1.0", "end-1c"), 'estado_final': self.combo_est_final.get(),
            'observaciones': self.entry_observaciones.get(), 'atendio': self.entry_atendio.get(), 'estado_orden': 'Cerrada'
        }
        try:
            db.collection('ordenes').add(nueva_orden)
            db.collection('equipos').document(self.doc_id_seleccionado).update({'estado_actual': self.combo_est_final.get()})
            messagebox.showinfo("¡Éxito!", "Orden guardada en Firebase.")
        except Exception as e: messagebox.showerror("Error", str(e))

    def imprimir_orden(self):
        pdf = FPDF(orientation='P', unit='mm', format='A4')
        pdf.add_page()
        pdf.set_margins(10, 10, 10)
        
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(0, 5, 'INSTITUTO MATERNO INFANTIL DEL ESTADO DE MÉXICO', 0, 1, 'C')
        pdf.cell(0, 5, 'BIOMÉDICA', 0, 1, 'C')
        pdf.cell(0, 5, 'ORDEN DE SERVICIO', 0, 1, 'C')
        pdf.ln(5)

        alto = 6
        pdf.set_font('Arial', '', 8)
        
        pdf.cell(40, alto, 'UNIDAD', 1, 0, 'L')
        unidad_actual = self.combo_unidad.get()
        pdf.cell(20, alto, 'HGO', 1, 0, 'C'); pdf.cell(10, alto, 'X' if unidad_actual == 'HGO' else '', 1, 0, 'C')
        pdf.cell(20, alto, 'HPN', 1, 0, 'C'); pdf.cell(10, alto, 'X' if unidad_actual == 'HPN' else '', 1, 0, 'C')
        pdf.cell(20, alto, 'CEO', 1, 0, 'C'); pdf.cell(10, alto, 'X' if unidad_actual == 'CEO' else '', 1, 0, 'C')
        pdf.cell(60, alto, '', 1, 1, 'C')
        pdf.ln(2)

        y_temp = pdf.get_y()
        pdf.cell(50, alto, 'NOMBRE DE QUIEN REPORTA', 1, 0); pdf.cell(90, alto, self.entry_reporta.get()[:45], 1, 1)
        pdf.cell(50, alto, 'ÁREA SOLICITANTE', 1, 0); pdf.cell(90, alto, self.combo_area.get()[:45], 1, 1)
        pdf.set_xy(160, y_temp)
        pdf.cell(15, alto, 'FOLIO', 1, 0, 'C'); pdf.cell(25, alto, getattr(self, 'folio_temp', 'S/F'), 1, 1, 'C')
        pdf.set_x(160)
        pdf.cell(15, alto, 'FECHA', 1, 0, 'C'); pdf.cell(25, alto, self.fecha_actual, 1, 1, 'C')
        pdf.ln(2)

        y_equipo = pdf.get_y()
        campos_eq = [
            ('CLAVE', self.entry_clave.get()), ('EQUIPO', self.entry_equipo.get()),
            ('MARCA', self.entry_marca.get()), ('MODELO', self.entry_modelo.get()),
            ('SERIE', self.entry_serie.get()), ('INVENTARIO', self.entry_inventario.get()),
            ('SUBUBICACIÓN', self.entry_sububicacion.get())
        ]
        for lbl, val in campos_eq:
            pdf.cell(30, alto, lbl, 1, 0); pdf.cell(80, alto, str(val)[:40], 1, 1)
            
        pdf.set_xy(125, y_equipo)
        pdf.cell(75, alto, 'CLASIFICACIÓN DEL SERVICIO', 1, 1, 'C')
        clasi_actual = self.combo_clasificacion.get()
        tipos_clasi = ["MANTENIMIENTO CORRECTIVO", "MANTENIMIENTO PREVENTIVO", "ASESORÍA Y CAPACITACIÓN", "SUMINISTRO (INSUMO-ACCESORIO)", "INSPECCIÓN", "OTRO"]
        for tipo in tipos_clasi:
            pdf.set_x(125); pdf.cell(65, alto, tipo, 1, 0); pdf.cell(10, alto, 'X' if clasi_actual == tipo else '', 1, 1, 'C')
        pdf.ln(2)

        y_diag = pdf.get_y()
        pdf.cell(65, alto, 'DESCRIPCIÓN DEL REPORTE', 1, 1, 'C')
        pdf.multi_cell(65, alto, self.txt_reporte.get("1.0", "end-1c").replace('\n',' ')[:120], 1)
        h_box1 = pdf.get_y() - y_diag
        
        pdf.set_xy(75, y_diag)
        pdf.cell(65, alto, 'DIAGNÓSTICO DEL EQUIPO', 1, 1, 'C')
        pdf.set_x(75)
        pdf.multi_cell(65, alto, self.txt_diagnostico.get("1.0", "end-1c").replace('\n',' ')[:120], 1)
        h_box2 = pdf.get_y() - y_diag
        
        pdf.set_xy(140, y_diag)
        est_ini = self.combo_est_inicial.get()
        pdf.cell(60, alto, 'ESTADO INICIAL DEL EQUIPO', 1, 1, 'C')
        pdf.set_x(140); pdf.cell(45, alto, 'FUERA DE SERVICIO', 1, 0); pdf.cell(15, alto, 'X' if est_ini == 'FUERA DE SERVICIO' else '', 1, 1, 'C')
        pdf.set_x(140); pdf.cell(45, alto, 'FUNCIONAL', 1, 0); pdf.cell(15, alto, 'X' if est_ini == 'FUNCIONAL' else '', 1, 1, 'C')
        
        pdf.set_y(max(y_diag + h_box1, y_diag + h_box2, pdf.get_y()) + 2)

        causa_act = self.combo_causa.get()
        pdf.cell(35, alto, 'CAUSA DE LA FALLA', 1, 0, 'C')
        causas_lista = [("MAL USO", 25), ("FALLA EQUIPO", 30), ("DESGASTE", 25), ("OTRO", 20), ("SIN FALLA", 25)]
        for lbl, w in causas_lista:
            pdf.cell(w-5, alto, lbl, 1, 0, 'C'); pdf.cell(5, alto, 'X' if causa_act == lbl else '', 1, 0, 'C')
        pdf.ln(alto + 2)

        pdf.cell(0, alto, 'DESCRIPCIÓN DEL SERVICIO', 1, 1, 'L')
        pdf.multi_cell(0, alto, self.txt_servicio.get("1.0", "end-1c").replace('\n',' '), 1)
        pdf.ln(2)

        y_mat = pdf.get_y()
        pdf.cell(95, alto, 'MATERIALES Y/O REFACCIONES UTILIZADAS', 1, 1, 'C')
        pdf.multi_cell(95, alto, self.txt_materiales.get("1.0", "end-1c").replace('\n',' ')[:200], 1)
        h_mat = pdf.get_y() - y_mat
        
        pdf.set_xy(105, y_mat)
        pdf.cell(95, alto, 'EQUIPOS Y/O HERRAMIENTAS UTILIZADAS', 1, 1, 'C')
        pdf.set_x(105)
        pdf.multi_cell(95, alto, self.txt_herramientas.get("1.0", "end-1c").replace('\n',' ')[:200], 1)
        h_herr = pdf.get_y() - y_mat
        
        pdf.set_y(y_mat + max(h_mat, h_herr) + 2)

        est_fin = self.combo_est_final.get()
        pdf.cell(45, alto, 'ESTADO FINAL DEL EQUIPO', 1, 0)
        pdf.cell(20, alto, 'FUNCIONAL', 1, 0, 'C'); pdf.cell(10, alto, 'X' if est_fin == 'FUNCIONAL' else '', 1, 0, 'C')
        pdf.cell(35, alto, 'FUERA DE SERVICIO', 1, 0, 'C'); pdf.cell(10, alto, 'X' if est_fin == 'FUERA DE SERVICIO' else '', 1, 0, 'C')
        pdf.cell(35, alto, 'FECHA DE ENTREGA', 1, 0, 'C'); pdf.cell(35, alto, self.fecha_actual, 1, 1, 'C')
        
        pdf.cell(35, alto, 'OBSERVACIONES', 1, 0); pdf.cell(155, alto, self.entry_observaciones.get()[:90], 1, 1)
        pdf.ln(4)

        pdf.cell(95, alto, 'ATENDIÓ', 1, 0, 'C'); pdf.cell(95, alto, 'USUARIO', 1, 1, 'C')
        x_start = pdf.get_x(); y_start = pdf.get_y()
        pdf.rect(x_start, y_start, 95, 25); pdf.rect(x_start + 95, y_start, 95, 25)
        pdf.set_y(y_start + 18); pdf.cell(95, 5, self.entry_atendio.get(), 0, 0, 'C'); pdf.cell(95, 5, 'NOMBRE Y FIRMA', 0, 1, 'C')
        pdf.ln(5)

        pdf.set_font('Arial', 'I', 7)
        pdf.cell(0, 4, '"La detección oportuna de los problemas en los equipos médicos ayuda a mejorar la calidad de vida de los pacientes"', 0, 1, 'R')
        pdf.set_font('Arial', 'B', 7)
        pdf.cell(0, 4, 'BMK Biomédica', 0, 1, 'R')

        arch = f"Orden_IMIEM_{self.entry_clave.get()}_{datetime.now().strftime('%H%M')}.pdf"
        try:
            pdf.output(arch)
            if platform.system() == 'Windows': os.startfile(arch)
            else: subprocess.call(['open', arch])
        except Exception as e: messagebox.showerror("Error PDF", str(e))

# =========================================================
# 2. INVENTARIO BUSQUEDA (SOLO 2 ESTADOS)
# =========================================================
class VentanaBusquedaEquipos(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Inventario de Equipos Médicos"); self.geometry("1050x650")
        self.lift(); self.focus_force()
        self.cache_equipos = [] 
        
        self.frame_filtros = ctk.CTkFrame(self); self.frame_filtros.pack(fill="x", padx=20, pady=(20, 0))
        ctk.CTkLabel(self.frame_filtros, text="Filtro de Área:", font=("Arial", 12, "bold")).pack(side="left", padx=10, pady=10)
        self.combo_filtro_area = ctk.CTkComboBox(self.frame_filtros, values=["Cargando áreas..."], command=self.aplicar_filtros); self.combo_filtro_area.pack(side="left", padx=10, pady=10)
        ctk.CTkLabel(self.frame_filtros, text="Buscar:", font=("Arial", 12, "bold")).pack(side="left", padx=(20, 10), pady=10)
        self.entry_busqueda = ctk.CTkEntry(self.frame_filtros, placeholder_text="ID o Inventario...", width=300); self.entry_busqueda.pack(side="left", padx=10, pady=10)
        self.entry_busqueda.bind("<KeyRelease>", self.aplicar_filtros) 

        self.frame_tabla = ctk.CTkFrame(self); self.frame_tabla.pack(fill="both", expand=True, padx=20, pady=15)
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4", "5", "6", "7"), show="headings")
        for c, t in zip(("1","2","3","4","5","6","7"), ("ID", "Inventario", "Nombre", "Marca", "Modelo", "Área", "Estado")): self.tabla.heading(c, text=t)
        self.tabla.pack(side="left", fill="both", expand=True)
        scrollbar = ttk.Scrollbar(self.frame_tabla, orient="vertical", command=self.tabla.yview); self.tabla.configure(yscrollcommand=scrollbar.set); scrollbar.pack(side="right", fill="y")
        
        self.frame_acciones = ctk.CTkFrame(self, fg_color="transparent"); self.frame_acciones.pack(fill="x", padx=20, pady=(0, 20))
        ctk.CTkButton(self.frame_acciones, text="⚠️ Cambiar Estado", fg_color="#ca8a04", hover_color="#a16207", font=("Arial", 13, "bold"), command=self.abrir_modal_estado).pack(side="left", padx=10)
        
        self.cargar_datos()

    def cargar_datos(self):
        self.cache_equipos = []; areas_detectadas = set()
        try:
            for doc in db.collection('equipos').stream():
                eq = doc.to_dict(); eq['doc_id'] = doc.id; self.cache_equipos.append(eq)
                if eq.get('area_asignada'): areas_detectadas.add(eq.get('area_asignada').strip().upper())
            self.combo_filtro_area.configure(values=["Todas"] + sorted(list(areas_detectadas))); self.combo_filtro_area.set("Todas")
            self.aplicar_filtros() 
        except: pass

    def aplicar_filtros(self, event=None):
        for fila in self.tabla.get_children(): self.tabla.delete(fila)
        area_seleccionada = self.combo_filtro_area.get().upper(); texto_busqueda = self.entry_busqueda.get().lower()
        for eq in self.cache_equipos:
            if area_seleccionada != "TODAS" and area_seleccionada != eq.get('area_asignada', '').upper(): continue
            if texto_busqueda and (texto_busqueda not in eq.get('id_equipo', '').lower() and texto_busqueda not in eq.get('num_inventario', '').lower() and texto_busqueda not in eq.get('nombre_equipo', '').lower()): continue
            self.tabla.insert("", "end", values=(eq.get('id_equipo',''), eq.get('num_inventario','S/I'), eq.get('nombre_equipo',''), eq.get('marca',''), eq.get('modelo',''), eq.get('area_asignada',''), eq.get('estado_actual', 'FUNCIONAL')), tags=(eq['doc_id'],))

    def abrir_modal_estado(self):
        seleccion = self.tabla.selection()
        if not seleccion: return
        doc_id = self.tabla.item(seleccion[0], "tags")[0]
        valores_fila = self.tabla.item(seleccion[0], "values")
        id_eq = valores_fila[0]; area_eq = valores_fila[5]; estado_actual = valores_fila[6]

        modal = ctk.CTkToplevel(self); modal.title("Gestor de Estado"); modal.geometry("450x380"); modal.grab_set() 
        ctk.CTkLabel(modal, text=id_eq, font=("Arial", 24, "bold"), text_color="#7B1E34").pack(pady=(20, 5))
        combo_estado = ctk.CTkComboBox(modal, values=["FUNCIONAL", "FUERA DE SERVICIO"], width=250)
        combo_estado.set(estado_actual); combo_estado.pack(pady=10)

        def confirmar_cambio():
            nuevo_est = combo_estado.get()
            try:
                db.collection('equipos').document(doc_id).update({'estado_actual': nuevo_est})
                if nuevo_est == "FUERA DE SERVICIO": enviar_alerta_nativa_fcm(id_eq, nuevo_est, area_eq)
                modal.destroy(); self.cargar_datos() 
            except: pass
        ctk.CTkButton(modal, text="Guardar y Notificar", command=confirmar_cambio).pack(pady=25)

# =========================================================
# 3. HISTORIAL DE ÓRDENES
# =========================================================
class VentanaHistorial(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.title("Historial de Mantenimiento"); self.geometry("1050x600"); self.lift(); self.focus_force()
        self.cache_ordenes = {} 

        self.frame_tabla = ctk.CTkFrame(self); self.frame_tabla.pack(fill="both", expand=True, padx=20, pady=10)
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4", "5"), show="headings")
        for c, t in zip(("1","2","3","4","5"), ("Fecha", "Clave", "Num. Inventario", "Falla Reportada", "Estado Equipo")): self.tabla.heading(c, text=t)
        self.tabla.pack(side="left", fill="both", expand=True)
        self.tabla.bind("<Double-1>", self.abrir_detalle)
        self.cargar_ordenes()
        
    def cargar_ordenes(self):
        for fila in self.tabla.get_children(): self.tabla.delete(fila)
        self.cache_ordenes.clear()
        try:
            ordenes = [doc.to_dict() | {'doc_id': doc.id} for doc in db.collection('ordenes').stream()]
            ordenes.sort(key=lambda x: x.get('fecha', ''), reverse=True)
            for o in ordenes:
                self.cache_ordenes[o['doc_id']] = o
                f = o.get('fecha', 'S/F').split('T')[0] if 'T' in o.get('fecha', 'S/F') else o.get('fecha', 'S/F')
                self.tabla.insert("", "end", values=(f, o.get('clave_equipo',''), o.get('num_inventario','S/I'), o.get('falla_reportada',''), o.get('estado_final','')), tags=(o['doc_id'],))
        except: pass

    def abrir_detalle(self, event):
        seleccion = self.tabla.selection()
        if not seleccion: return
        doc_id = self.tabla.item(seleccion[0], "tags")[0]
        orden = self.cache_ordenes.get(doc_id)
        if not orden: return

        modal = ctk.CTkToplevel(self); modal.title(f"Detalle - {orden.get('clave_equipo', '')}"); modal.geometry("550x550"); modal.lift(); modal.focus_force()
        ctk.CTkLabel(modal, text=f"Equipo: {orden.get('clave_equipo', 'S/N')}", font=("Arial", 20, "bold"), text_color="#D4AF37").pack(pady=(20, 5))
        ctk.CTkLabel(modal, text=f"Inventario: {orden.get('num_inventario', 'S/I')}", font=("Arial", 14), text_color="gray").pack(pady=(0, 10))
        
        frame_info = ctk.CTkScrollableFrame(modal, fg_color="#1d1d1d"); frame_info.pack(fill="both", expand=True, padx=20, pady=10)
        campos = [("Fecha del Servicio:", orden.get('fecha', '')), ("Clasificación:", orden.get('clasificacion', '')), ("Falla Reportada:", orden.get('falla_reportada', '')), ("Trabajo Realizado:", orden.get('trabajo_realizado', '')), ("Estado Final del Equipo:", orden.get('estado_final', ''))]
        for titulo, valor in campos:
            ctk.CTkLabel(frame_info, text=titulo, font=("Arial", 12, "bold")).pack(anchor="w", pady=(10, 0))
            ctk.CTkLabel(frame_info, text=str(valor), font=("Arial", 13), wraplength=450, justify="left", text_color="#e5e7eb").pack(anchor="w")

# =========================================================
# 4. SEMÁFORO (SOLO ROJO Y VERDE)
# =========================================================
class VentanaSemaforo(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Semáforo Clínico - HGO"); self.geometry("1150x700"); self.lift(); self.focus_force()
        self.frame_principal = ctk.CTkFrame(self, fg_color="transparent"); self.frame_principal.pack(fill="both", expand=True, padx=20, pady=5)
        self.frame_principal.columnconfigure(0, weight=6); self.frame_principal.columnconfigure(1, weight=4); self.frame_principal.rowconfigure(0, weight=1)

        self.frame_izquierdo = ctk.CTkFrame(self.frame_principal, fg_color="transparent"); self.frame_izquierdo.grid(row=0, column=0, padx=(0, 10), sticky="nsew")
        self.frame_contadores = ctk.CTkFrame(self.frame_izquierdo, fg_color="transparent"); self.frame_contadores.pack(fill="x", pady=5); self.frame_contadores.columnconfigure((0,1), weight=1)
        
        self.lbl_funcional = self.crear_tarjeta(self.frame_contadores, "FUNCIONAL", "#16a34a", 0)
        self.lbl_fuera = self.crear_tarjeta(self.frame_contadores, "FUERA DE SERVICIO", "#dc2626", 1)
        
        ctk.CTkLabel(self.frame_izquierdo, text="⚠️ Equipos Fuera de Servicio:", font=("Arial", 15, "bold")).pack(pady=(15, 5), anchor="w")
        self.frame_tabla = ctk.CTkFrame(self.frame_izquierdo); self.frame_tabla.pack(fill="both", expand=True, pady=5)
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4"), show="headings")
        for c, t, w in zip(("1","2","3","4"), ("ID", "Inventario", "Área", "Estado"), (90, 120, 150, 120)): self.tabla.heading(c, text=t); self.tabla.column(c, width=w)
        self.tabla.pack(side="left", fill="both", expand=True)

        self.frame_derecho = ctk.CTkFrame(self.frame_principal, fg_color="#1d1d1d", border_width=2, border_color="#7B1E34"); self.frame_derecho.grid(row=0, column=1, padx=(10, 0), sticky="nsew")
        self.canvas_plot = None
        ctk.CTkButton(self, text="🔄 Actualizar Dashboard", command=self.cargar_semaforo).pack(pady=15)
        self.cargar_semaforo()
        
    def crear_tarjeta(self, parent, titulo, color, col):
        frame = ctk.CTkFrame(parent, fg_color=color, corner_radius=10); frame.grid(row=0, column=col, padx=5, sticky="nsew")
        ctk.CTkLabel(frame, text=titulo, font=("Arial", 13, "bold"), text_color="white").pack(pady=(12,0))
        lbl_numero = ctk.CTkLabel(frame, text="0", font=("Arial", 32, "bold"), text_color="white"); lbl_numero.pack(pady=(0,12)); return lbl_numero

    def cargar_semaforo(self):
        for fila in self.tabla.get_children(): self.tabla.delete(fila)
        c_ver = 0; c_roj = 0
        try:
            for doc in db.collection('equipos').stream():
                eq = doc.to_dict(); est = eq.get('estado_actual', 'FUNCIONAL')
                if est == 'FUNCIONAL': c_ver += 1
                elif est == 'FUERA DE SERVICIO': 
                    c_roj += 1
                    self.tabla.insert("", "end", values=(eq.get('id_equipo', ''), eq.get('num_inventario', ''), eq.get('area_asignada', ''), est))
            self.lbl_funcional.configure(text=str(c_ver)); self.lbl_fuera.configure(text=str(c_roj))
            self.dibujar_grafica_dona(c_ver, c_roj)
        except: pass

    def dibujar_grafica_dona(self, ver, roj):
        if self.canvas_plot: self.canvas_plot.get_tk_widget().destroy()
        if (ver + roj) == 0: return
        fig, ax = plt.subplots(figsize=(4, 4), facecolor='#1d1d1d'); ax.set_facecolor('#1d1d1d')
        labels = ['Funcional', 'Fuera de Servicio']; valores = [ver, roj]; colores = ['#16a34a', '#dc2626']
        filtrado = [(l, v, c) for l, v, c in zip(labels, valores, colores) if v > 0]
        if not filtrado: return
        l_f, v_f, c_f = zip(*filtrado)
        ax.pie(v_f, labels=l_f, autopct='%1.1f%%', startangle=90, colors=c_f, textprops=dict(color="w", fontsize=9, weight="bold"), wedgeprops=dict(width=0.4, edgecolor='#1d1d1d', linewidth=2))
        ax.axis('equal'); plt.tight_layout()
        self.canvas_plot = FigureCanvasTkAgg(fig, master=self.frame_derecho); self.canvas_plot.draw()
        self.canvas_plot.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)
        plt.close(fig)

# =========================================================
# 5. CALENDARIO MP (MESES Y REPORTE)
# =========================================================
class VentanaCalendarioMP(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Panel Administrador - Asignación MP"); self.geometry("1100x650"); self.lift(); self.focus_force()
        self.frame_principal = ctk.CTkFrame(self, fg_color="transparent"); self.frame_principal.pack(fill="both", expand=True, padx=20, pady=5)
        self.frame_principal.columnconfigure(0, weight=6); self.frame_principal.columnconfigure(1, weight=4)

        self.frame_izq = ctk.CTkFrame(self.frame_principal, border_width=1, border_color="#D4AF37"); self.frame_izq.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        self.tabla_inv = ttk.Treeview(self.frame_izq, columns=("1", "2", "3", "4"), show="headings", height=15)
        for c, t, w in zip(("1", "2", "3", "4"), ("ID Equipo", "Inventario", "Nombre", "Área"), (90, 90, 200, 120)): self.tabla_inv.heading(c, text=t); self.tabla_inv.column(c, width=w)
        self.tabla_inv.pack(fill="both", expand=True, padx=10, pady=10)
        self.tabla_inv.bind("<<TreeviewSelect>>", self.seleccionar_equipo)

        self.frame_der = ctk.CTkFrame(self.frame_principal, fg_color="#1d1d1d", border_width=1, border_color="#7B1E34"); self.frame_der.grid(row=0, column=1, sticky="nsew")
        self.lbl_eq_select = ctk.CTkLabel(self.frame_der, text="Ningún equipo seleccionado", font=("Arial", 14, "bold"), text_color="white"); self.lbl_eq_select.pack(pady=(10, 10))
        
        f_campos = ctk.CTkFrame(self.frame_der, fg_color="transparent"); f_campos.pack(fill="both", padx=20)
        try:
            usuarios_fb = auth.list_users().iterate_all()
            lista_tecnicos = [u.email for u in usuarios_fb if u.email]
            if not lista_tecnicos: raise ValueError()
        except: lista_tecnicos = ["tecnico1@hgo.com", "tecnico2@hgo.com"]

        ctk.CTkLabel(f_campos, text="Técnico Asignado:", anchor="w", font=("Arial", 12, "bold")).pack(fill="x")
        self.combo_tecnico = ctk.CTkComboBox(f_campos, values=lista_tecnicos); self.combo_tecnico.pack(fill="x", pady=5)
        
        ctk.CTkLabel(f_campos, text="Mes Programado:", anchor="w", font=("Arial", 12, "bold")).pack(fill="x", pady=(10,0))
        self.combo_mes = ctk.CTkComboBox(f_campos, values=["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]); self.combo_mes.pack(fill="x", pady=5)

        ctk.CTkLabel(f_campos, text="Horas-Hombre Estimadas:", anchor="w", font=("Arial", 12, "bold")).pack(fill="x", pady=(10,0))
        self.entry_horas = ctk.CTkEntry(f_campos, placeholder_text="Ej. 2"); self.entry_horas.pack(fill="x", pady=5)
        
        ctk.CTkButton(self.frame_der, text="📅 Agendar Mantenimiento", font=("Arial", 14, "bold"), fg_color="#7B1E34", command=self.agendar_mp).pack(pady=(15, 10), fill="x", padx=20)
        ctk.CTkButton(self.frame_der, text="🖨️ Imprimir Agenda del Técnico", font=("Arial", 14, "bold"), fg_color="#ea580c", command=self.imprimir_agenda_tecnico).pack(pady=5, fill="x", padx=20)
        ctk.CTkButton(self.frame_der, text="📊 Exportar Global a Excel", font=("Arial", 14, "bold"), fg_color="#16a34a", command=self.exportar_excel).pack(pady=5, fill="x", padx=20)

        self.equipo_seleccionado = None
        self.cargar_inventario()

    def cargar_inventario(self):
        for f in self.tabla_inv.get_children(): self.tabla_inv.delete(f)
        try:
            for doc in db.collection('equipos').stream():
                eq = doc.to_dict()
                self.tabla_inv.insert("", "end", values=(eq.get('id_equipo', ''), eq.get('num_inventario', 'S/I'), eq.get('nombre_equipo', ''), eq.get('area_asignada', '')))
        except: pass

    def seleccionar_equipo(self, event):
        s = self.tabla_inv.selection()
        if s:
            val = self.tabla_inv.item(s[0], 'values')
            self.equipo_seleccionado = {"id": val[0], "inventario": val[1], "nombre": val[2], "area": val[3]}
            self.lbl_eq_select.configure(text=f"{val[0]} | {val[1]}")

    def agendar_mp(self):
        if not self.equipo_seleccionado: return
        nueva_agenda = {'id_equipo': self.equipo_seleccionado['id'], 'num_inventario': self.equipo_seleccionado['inventario'], 'nombre_equipo': self.equipo_seleccionado['nombre'], 'area_asignada': self.equipo_seleccionado['area'], 'tecnico_email': self.combo_tecnico.get().lower().strip(), 'mes_programado': self.combo_mes.get(), 'horas_hombre': self.entry_horas.get().strip(), 'estado_mp': 'PENDIENTE'}
        try: 
            db.collection('agenda_mp').add(nueva_agenda); messagebox.showinfo("Éxito", "Agendado."); self.entry_horas.delete(0, 'end')
        except Exception as e: messagebox.showerror("Error", str(e))

    def exportar_excel(self):
        ruta = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if not ruta: return
        try:
            agendas = db.collection('agenda_mp').stream()
            with open(ruta, mode='w', newline='', encoding='utf-8-sig') as archivo:
                escritor = csv.writer(archivo)
                escritor.writerow(["ID Equipo", "Inventario", "Nombre Equipo", "Área", "Técnico Asignado", "Mes Programado", "Horas-Hombre", "Estado"])
                for doc in agendas:
                    d = doc.to_dict()
                    escritor.writerow([d.get('id_equipo',''), d.get('num_inventario',''), d.get('nombre_equipo',''), d.get('area_asignada',''), d.get('tecnico_email',''), d.get('mes_programado',''), d.get('horas_hombre',''), d.get('estado_mp','')])
            if platform.system() == 'Windows': os.startfile(ruta)
        except: pass

    def imprimir_agenda_tecnico(self):
        tecnico = self.combo_tecnico.get().strip()
        try: lista_tareas = [doc.to_dict() for doc in db.collection('agenda_mp').where('tecnico_email', '==', tecnico).stream()]
        except: return
        if not lista_tareas: return
        
        pdf = FPDF(); pdf.add_page()
        pdf.set_font('Arial', 'B', 12); pdf.set_x(55); pdf.multi_cell(0, 6, 'HOSPITAL DE GINECOLOGÍA Y OBSTETRICIA\nDEPARTAMENTO DE INGENIERÍA BIOMÉDICA', 0, 'C'); pdf.ln(4)
        pdf.set_font('Arial', 'B', 13); pdf.set_text_color(123, 30, 52); pdf.cell(0, 8, 'PROGRAMA DE MANTENIMIENTO PREVENTIVO', 0, 1, 'C')
        pdf.set_font('Arial', '', 10); pdf.set_text_color(0, 0, 0); pdf.cell(0, 6, f'Técnico: {tecnico}', 0, 1, 'C'); pdf.ln(6)

        pdf.set_font('Arial', 'B', 8); pdf.set_fill_color(123, 30, 52); pdf.set_text_color(255, 255, 255)
        pdf.cell(30, 8, 'Inventario', 1, 0, 'C', 1); pdf.cell(70, 8, 'Equipo', 1, 0, 'C', 1); pdf.cell(45, 8, 'Área', 1, 0, 'C', 1); pdf.cell(25, 8, 'Mes', 1, 0, 'C', 1); pdf.cell(15, 8, 'Horas', 1, 1, 'C', 1)

        pdf.set_font('Arial', '', 8); pdf.set_text_color(0, 0, 0)
        for t in lista_tareas:
            pdf.cell(30, 7, str(t.get('num_inventario', ''))[:15], 1, 0, 'C'); pdf.cell(70, 7, str(t.get('nombre_equipo', ''))[:35], 1); pdf.cell(45, 7, str(t.get('area_asignada', ''))[:25], 1, 0, 'C'); pdf.cell(25, 7, str(t.get('mes_programado', '')), 1, 0, 'C'); pdf.cell(15, 7, str(t.get('horas_hombre', '')), 1, 1, 'C')

        arch = f"Ruta_{tecnico.split('@')[0]}.pdf"
        try:
            pdf.output(arch)
            if platform.system() == 'Windows': os.startfile(arch)
        except: pass

# =========================================================
# 6. ALTA DE EQUIPOS (MANUAL)
# =========================================================
class VentanaAdminBD(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Agregar Equipos a la Nube - HGO"); self.geometry("450x600"); self.lift(); self.focus_force()
        ctk.CTkLabel(self, text="Alta de Nuevo Equipo Clínico", font=("Arial", 20, "bold"), text_color="#D4AF37").pack(pady=20)
        self.entradas = {}
        campos = {"num_inventario": "No. de Inventario (Hospital)", "id_equipo": "Clave o ID del Equipo", "nombre_equipo": "Nombre del Equipo", "marca": "Marca", "modelo": "Modelo", "serie": "Número de Serie", "area_asignada": "Área Asignada (Ej. URGENCIAS)"}
        for clave_bd, texto_label in campos.items():
            f = ctk.CTkFrame(self, fg_color="transparent"); f.pack(fill="x", padx=30, pady=8)
            ctk.CTkLabel(f, text=texto_label+":", width=180, anchor="w", font=("Arial", 12, "bold")).pack(side="left")
            e = ctk.CTkEntry(f); e.pack(side="right", expand=True, fill="x"); self.entradas[clave_bd] = e
        ctk.CTkButton(self, text="☁️ Guardar en Firebase", font=("Arial", 14, "bold"), fg_color="#10b981", command=self.agregar_equipo).pack(pady=30)

    def agregar_equipo(self):
        datos = {clave: entrada.get().strip() for clave, entrada in self.entradas.items()}
        if not datos['id_equipo'] or not datos['nombre_equipo']: return
        datos['estado_actual'] = 'FUNCIONAL'
        try: db.collection('equipos').add(datos); self.destroy()
        except: pass

# =========================================================
# MENÚS PRINCIPALES Y PIN
# =========================================================
class VentanaPIN(ctk.CTkToplevel):
    def __init__(self, master, callback_exito, *args, **kwargs):
        super().__init__(*args, **kwargs); self.master_window = master; self.callback_exito = callback_exito
        self.title("Seguridad"); self.geometry("350x250"); self.lift(); self.focus_force(); self.grab_set() 
        ctk.CTkLabel(self, text="🔒 Control de Acceso", font=("Arial", 16, "bold"), text_color="#D4AF37").pack(pady=(25, 10))
        ctk.CTkLabel(self, text="Introduce el PIN de Administrador:", font=("Arial", 12)).pack(pady=5)
        self.entry_pin = ctk.CTkEntry(self, show="*", width=160, justify="center", font=("Arial", 18, "bold")); self.entry_pin.pack(pady=10); self.entry_pin.focus_force()
        self.entry_pin.bind("<Return>", lambda e: self.verificar_codigo())
        ctk.CTkButton(self, text="Verificar Acceso", fg_color="#7B1E34", command=self.verificar_codigo).pack(pady=15)
        
    def verificar_codigo(self):
        pin_admin = os.environ.get("ADMIN_PIN", "")
        if not pin_admin:
            messagebox.showwarning("Sin configurar", "Configura la variable de entorno ADMIN_PIN para habilitar el acceso de administrador.")
            return
        if self.entry_pin.get().strip() == pin_admin:
            self.grab_release(); self.destroy(); self.callback_exito()
        else: self.entry_pin.delete(0, "end"); self.focus_force()

class MenuAdministrador(ctk.CTkToplevel):
    def __init__(self, master, *args, **kwargs):
        super().__init__(*args, **kwargs); self.master_window = master; self.title("Panel de Administración Global - BIM HGO"); self.geometry("750x400"); self.lift(); self.focus_force()
        self.protocol("WM_DELETE_WINDOW", self.cerrar_sesion); self.ventanas_abiertas = {}
        ctk.CTkLabel(self, text="SISTEMA DE MANTENIMIENTO - MODO ADMINISTRADOR", font=("Arial", 20, "bold"), text_color="#D4AF37").pack(pady=(30, 20))
        frame_botones = ctk.CTkFrame(self, fg_color="transparent"); frame_botones.pack(pady=10)
        ctk.CTkButton(frame_botones, text="📅 Asignar Agenda MP", height=60, width=300, font=("Arial", 14, "bold"), fg_color="#7B1E34", command=lambda: self._abrir("calendario", VentanaCalendarioMP)).grid(row=0, column=0, padx=15, pady=10)
        ctk.CTkButton(frame_botones, text="🚦 Tablero de Estados TINC", height=60, width=300, font=("Arial", 14, "bold"), fg_color="#ea580c", command=lambda: self._abrir("semaforo", VentanaSemaforo)).grid(row=0, column=1, padx=15, pady=10)
        ctk.CTkButton(frame_botones, text="🔍 Búsqueda de Equipos", height=60, width=300, font=("Arial", 14, "bold"), command=lambda: self._abrir("busqueda", VentanaBusquedaEquipos)).grid(row=1, column=0, padx=15, pady=10)
        ctk.CTkButton(frame_botones, text="⚙️ Agregar Equipos (Base Datos)", height=60, width=300, font=("Arial", 14, "bold"), fg_color="#4b5563", command=lambda: self._abrir("admin", VentanaAdminBD)).grid(row=1, column=1, padx=15, pady=10)

    def _abrir(self, nombre, clase_ventana):
        if nombre in self.ventanas_abiertas and self.ventanas_abiertas[nombre].winfo_exists(): self.ventanas_abiertas[nombre].lift(); self.ventanas_abiertas[nombre].focus_force()
        else: self.ventanas_abiertas[nombre] = clase_ventana(self)
    def cerrar_sesion(self): self.destroy(); self.master_window.deiconify()

class MenuTecnico(ctk.CTkToplevel):
    def __init__(self, master, *args, **kwargs):
        super().__init__(*args, **kwargs); self.master_window = master; self.title("Herramientas de Técnico"); self.geometry("850x300"); self.lift(); self.focus_force()
        self.protocol("WM_DELETE_WINDOW", self.cerrar_sesion); self.ventanas_abiertas = {}
        ctk.CTkLabel(self, text="SISTEMA DE MANTENIMIENTO - MODO TÉCNICO", font=("Arial", 22, "bold")).pack(pady=(40, 20))
        frame_botones = ctk.CTkFrame(self, fg_color="transparent"); frame_botones.pack(pady=10)
        ctk.CTkButton(frame_botones, text="📝 Crear Orden de Servicio", height=60, width=240, font=("Arial", 14, "bold"), command=lambda: self._abrir("orden", VentanaNuevaOrden)).grid(row=0, column=0, padx=10, pady=10)
        ctk.CTkButton(frame_botones, text="🔍 Búsqueda de Equipos", height=60, width=240, font=("Arial", 14, "bold"), command=lambda: self._abrir("busqueda", VentanaBusquedaEquipos)).grid(row=0, column=1, padx=10, pady=10)
        ctk.CTkButton(frame_botones, text="📚 Historial de Órdenes", height=60, width=240, font=("Arial", 14, "bold"), command=lambda: self._abrir("historial", VentanaHistorial)).grid(row=0, column=2, padx=10, pady=10)

    def _abrir(self, nombre, clase_ventana):
        if nombre in self.ventanas_abiertas and self.ventanas_abiertas[nombre].winfo_exists(): self.ventanas_abiertas[nombre].lift(); self.ventanas_abiertas[nombre].focus_force()
        else: self.ventanas_abiertas[nombre] = clase_ventana(self)
    def cerrar_sesion(self): self.destroy(); self.master_window.deiconify()

class PantallaAcceso(ctk.CTk):
    def __init__(self):
        super().__init__(); self.title("BIM HGO - Acceso al Sistema"); self.geometry("500x400")
        ctk.CTkLabel(self, text="HOSPITAL DE GINECOLOGÍA Y OBSTETRICIA", font=("Arial", 16, "bold"), text_color="#D4AF37").pack(pady=(40, 0))
        ctk.CTkLabel(self, text="Departamento de Ingeniería Biomédica", font=("Arial", 14)).pack(pady=(0, 30))
        ctk.CTkButton(self, text="👨‍💼 Acceso Administrador", height=50, width=250, font=("Arial", 14, "bold"), fg_color="#7B1E34", command=self.solicitar_pin_admin).pack(pady=10)
        ctk.CTkButton(self, text="🛠️ Acceso Técnico", height=50, width=250, font=("Arial", 14, "bold"), command=self.abrir_tecnico).pack(pady=10)

    def solicitar_pin_admin(self): VentanaPIN(self, self.abrir_admin)
    def abrir_admin(self): self.withdraw(); MenuAdministrador(self)
    def abrir_tecnico(self): self.withdraw(); MenuTecnico(self)

if __name__ == "__main__":
    app = PantallaAcceso()
    app.mainloop()