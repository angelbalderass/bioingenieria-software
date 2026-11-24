import customtkinter as ctk
import os
from datetime import datetime
from tkinter import messagebox, ttk
from fpdf import FPDF
import platform
import subprocess
import sys

# --- LIBRERÍAS DE LA NUBE ---
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

ctk.set_appearance_mode("Dark") 
ctk.set_default_color_theme("blue")

# --- CONEXIÓN A FIREBASE ---
def conectar_firebase():
    if not firebase_admin._apps:
        ruta_llave = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'llave.json')
        cred = credentials.Certificate(ruta_llave)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = conectar_firebase()

def obtener_ruta_logo():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'logo_imss.png')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo_imss.png')

# --- GENERADOR DE PDF (CORREGIDO PARA CEREE) ---
class PDFOrden(FPDF):
    def header(self):
        ruta_logo = obtener_ruta_logo()
        if os.path.exists(ruta_logo):
            try: self.image(ruta_logo, 10, 8, 40)
            except: pass
        self.set_font('Arial', 'B', 12)
        self.set_x(55)
        self.multi_cell(0, 6, 'CENTRO ESTATAL DE REHABILITACIÓN Y EDUCACIÓN ESPECIAL\nDEPARTAMENTO DE INGENIERÍA BIOMÉDICA', 0, 'C')
        self.ln(2)
        self.set_line_width(0.6)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(1)
        self.set_line_width(0.2)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)
        self.set_font('Arial', 'B', 11)
        self.cell(0, 6, 'ORDEN DE SERVICIO DE MANTENIMIENTO BIOMÉDICO', 0, 1, 'C')
        self.ln(4)

# =========================================================
# VENTANA 1: CREAR ORDEN DE SERVICIO (ÁREAS CEREE)
# =========================================================
class VentanaNuevaOrden(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.title("Captura de Orden - BIM CEREE")
        self.geometry("950x850")
        
        self.diccionario_equipos = {} 
        self.lista_completa_equipos = [] 
        
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.scroll_frame = ctk.CTkScrollableFrame(self, label_text="FORMATO DE ORDEN DE SERVICIO", label_font=("Arial", 16, "bold"))
        self.scroll_frame.grid(row=0, column=0, padx=15, pady=15, sticky="nsew")
        self.scroll_frame.grid_columnconfigure((0, 1, 2, 3), weight=1)

        self.frame_datos = ctk.CTkFrame(self.scroll_frame)
        self.frame_datos.grid(row=0, column=0, columnspan=4, padx=10, pady=10, sticky="ew")
        self.frame_datos.grid_columnconfigure((0, 1, 2, 3), weight=1)

        self.fecha_actual = datetime.now().strftime("%d/%m/%Y")
        ctk.CTkLabel(self.frame_datos, text=f"Fecha: {self.fecha_actual}", font=("Arial", 13, "bold")).grid(row=0, column=3, padx=10, pady=10, sticky="e")

        # --- FILTROS CEREE ---
        ctk.CTkLabel(self.frame_datos, text="Filtro de Área:", font=("Arial", 12, "bold")).grid(row=1, column=0, padx=10, pady=10, sticky="w")
        self.combo_filtro_area = ctk.CTkComboBox(self.frame_datos, values=["Todas", "Mecanoterapia", "Electroterapia", "Hidroterapia", "Terapia Física", "Terapia Ocupacional", "Enfermería", "Consultorios"], command=self.filtrar_combo_equipos)
        self.combo_filtro_area.grid(row=1, column=1, padx=10, pady=10, sticky="ew")

        ctk.CTkLabel(self.frame_datos, text="Seleccionar Equipo:", font=("Arial", 12, "bold")).grid(row=1, column=2, padx=10, pady=10, sticky="e")
        self.combo_id = ctk.CTkComboBox(self.frame_datos, values=["Cargando equipos..."], width=350, command=self.autocompletar_campos_equipo)
        self.combo_id.grid(row=1, column=3, padx=10, pady=10, sticky="w")

        ctk.CTkLabel(self.frame_datos, text="Equipo:").grid(row=2, column=0, padx=10, pady=10, sticky="w")
        self.entry_equipo = ctk.CTkEntry(self.frame_datos, state="disabled")
        self.entry_equipo.grid(row=2, column=1, columnspan=3, padx=10, pady=10, sticky="ew")

        ctk.CTkLabel(self.frame_datos, text="Marca y Modelo:").grid(row=3, column=0, padx=10, pady=10, sticky="w")
        self.entry_marca_mod = ctk.CTkEntry(self.frame_datos, state="disabled")
        self.entry_marca_mod.grid(row=3, column=1, columnspan=3, padx=10, pady=10, sticky="ew")

        ctk.CTkLabel(self.frame_datos, text="No. de Serie:").grid(row=4, column=0, padx=10, pady=10, sticky="w")
        self.entry_serie = ctk.CTkEntry(self.frame_datos, state="disabled")
        self.entry_serie.grid(row=4, column=1, padx=10, pady=10, sticky="ew")

        ctk.CTkLabel(self.frame_datos, text="Área Solicitante:").grid(row=4, column=2, padx=10, pady=10, sticky="w")
        self.combo_area = ctk.CTkComboBox(self.frame_datos, values=["Mecanoterapia", "Electroterapia", "Hidroterapia", "Terapia Física", "Terapia Ocupacional", "Enfermería", "Consultorios"])
        self.combo_area.grid(row=4, column=3, padx=10, pady=10, sticky="ew")

        self.frame_clasi = ctk.CTkFrame(self.scroll_frame)
        self.frame_clasi.grid(row=1, column=0, columnspan=4, padx=10, pady=10, sticky="ew")
        ctk.CTkLabel(self.frame_clasi, text="Clasificación del Servicio:", font=("Arial", 12, "bold")).grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.radio_var = ctk.StringVar(value="Preventivo")
        ctk.CTkRadioButton(self.frame_clasi, text="Preventivo", variable=self.radio_var, value="Preventivo").grid(row=0, column=1, padx=20, pady=5)
        ctk.CTkRadioButton(self.frame_clasi, text="Correctivo", variable=self.radio_var, value="Correctivo").grid(row=0, column=2, padx=20, pady=5)

        ctk.CTkLabel(self.scroll_frame, text="Descripción del Reporte / Falla:", font=("Arial", 12, "bold")).grid(row=2, column=0, columnspan=4, padx=10, pady=(10,0), sticky="w")
        self.txt_reporte = ctk.CTkTextbox(self.scroll_frame, height=80)
        self.txt_reporte.grid(row=3, column=0, columnspan=4, padx=10, pady=5, sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Descripción del Servicio / Trabajo Realizado:", font=("Arial", 12, "bold")).grid(row=4, column=0, columnspan=4, padx=10, pady=(10,0), sticky="w")
        self.txt_servicio = ctk.CTkTextbox(self.scroll_frame, height=80)
        self.txt_servicio.grid(row=5, column=0, columnspan=4, padx=10, pady=5, sticky="ew")

        ctk.CTkLabel(self.scroll_frame, text="Diagnóstico detallado del Equipo:", font=("Arial", 12, "bold")).grid(row=6, column=0, columnspan=4, padx=10, pady=(10,0), sticky="w")
        self.txt_diagnostico = ctk.CTkTextbox(self.scroll_frame, height=100)
        self.txt_diagnostico.grid(row=7, column=0, columnspan=4, padx=10, pady=5, sticky="ew")

        self.frame_inferior = ctk.CTkFrame(self.scroll_frame)
        self.frame_inferior.grid(row=10, column=0, columnspan=4, padx=10, pady=10, sticky="ew")
        self.frame_inferior.grid_columnconfigure((0, 1), weight=1)

        ctk.CTkLabel(self.frame_inferior, text="Materiales Utilizados:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.entry_materiales = ctk.CTkEntry(self.frame_inferior, placeholder_text="Ej. Fusible 2A...")
        self.entry_materiales.grid(row=1, column=0, padx=10, pady=5, sticky="ew")

        ctk.CTkLabel(self.frame_inferior, text="Estado Final del Equipo:").grid(row=0, column=1, padx=10, pady=5, sticky="w")
        self.combo_estado = ctk.CTkComboBox(self.frame_inferior, values=["FUNCIONAL", "PRECAUCIÓN", "FUERA DE SERVICIO"])
        self.combo_estado.grid(row=1, column=1, padx=10, pady=5, sticky="ew")

        self.btn_guardar = ctk.CTkButton(self.scroll_frame, text="💾 Guardar Orden en Nube", font=("Arial", 14, "bold"), fg_color="#10b981", hover_color="#059669", command=self.guardar_orden)
        self.btn_guardar.grid(row=11, column=0, columnspan=2, padx=10, pady=20, ipady=5, sticky="ew")

        self.btn_imprimir = ctk.CTkButton(self.scroll_frame, text="🖨️ Imprimir Orden", font=("Arial", 14, "bold"), fg_color="#ef4444", hover_color="#dc2626", command=self.imprimir_orden)
        self.btn_imprimir.grid(row=11, column=2, columnspan=2, padx=10, pady=20, ipady=5, sticky="ew")

        self.cargar_equipos_nube()

    def cargar_equipos_nube(self):
        try:
            equipos_ref = db.collection('equipos').stream()
            self.lista_completa_equipos = []
            for doc in equipos_ref:
                eq = doc.to_dict()
                eq['doc_id'] = doc.id
                texto = f"{eq.get('id_equipo', 'S/ID')} | {eq.get('nombre_equipo', 'S/N')} ({eq.get('area_asignada', 'S/A')})"
                self.diccionario_equipos[texto] = eq
                self.lista_completa_equipos.append({'texto': texto, 'area': eq.get('area_asignada', 'Todas')})
            
            self.filtrar_combo_equipos("Todas") 
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo cargar de Firebase: {e}")

    def filtrar_combo_equipos(self, eleccion):
        area_seleccionada = self.combo_filtro_area.get()
        
        if area_seleccionada == "Todas":
            opciones = [item['texto'] for item in self.lista_completa_equipos]
        else:
            opciones = [item['texto'] for item in self.lista_completa_equipos if item['area'] == area_seleccionada]

        if not opciones:
            opciones = ["No hay equipos en esta área"]
            
        self.combo_id.configure(values=sorted(opciones))
        self.combo_id.set("--- Selecciona un equipo ---")
        
        self.entry_equipo.configure(state="normal"); self.entry_marca_mod.configure(state="normal"); self.entry_serie.configure(state="normal")
        self.entry_equipo.delete(0, "end"); self.entry_marca_mod.delete(0, "end"); self.entry_serie.delete(0, "end")
        self.entry_equipo.configure(state="disabled"); self.entry_marca_mod.configure(state="disabled"); self.entry_serie.configure(state="disabled")

    def autocompletar_campos_equipo(self, seleccion):
        if "---" in seleccion or "No hay" in seleccion: return
        eq = self.diccionario_equipos.get(seleccion)
        if eq:
            self.doc_id_seleccionado = eq['doc_id']
            self.entry_equipo.configure(state="normal"); self.entry_marca_mod.configure(state="normal"); self.entry_serie.configure(state="normal")
            self.entry_equipo.delete(0, "end"); self.entry_equipo.insert(0, eq.get('nombre_equipo', 'S/N'))
            self.entry_marca_mod.delete(0, "end"); self.entry_marca_mod.insert(0, f"{eq.get('marca', 'Genérica')} / {eq.get('modelo', 'S/M')}")
            self.entry_serie.delete(0, "end"); self.entry_serie.insert(0, eq.get('serie', 'S/N'))
            self.entry_equipo.configure(state="disabled"); self.entry_marca_mod.configure(state="disabled"); self.entry_serie.configure(state="disabled")
            
            area_equipo = eq.get('area_asignada', 'Todas')
            if area_equipo in ["Mecanoterapia", "Electroterapia", "Hidroterapia", "Terapia Física", "Terapia Ocupacional", "Enfermería", "Consultorios"]:
                self.combo_area.set(area_equipo)

    def guardar_orden(self):
        seleccion = self.combo_id.get()
        if "---" in seleccion or not seleccion or "No hay" in seleccion:
            messagebox.showwarning("Advertencia", "Selecciona un equipo válido.")
            return

        eq = self.diccionario_equipos.get(seleccion)
        id_equipo = eq.get('id_equipo', 'S/N')
        estado = self.combo_estado.get()

        nueva_orden = {
            'fecha': datetime.now().isoformat(),
            'clave_equipo': id_equipo,
            'falla_reportada': self.txt_reporte.get("1.0", "end-1c"),
            'prioridad': 'Normal',
            'estado_orden': 'Cerrada',
            'trabajo_realizado': self.txt_servicio.get("1.0", "end-1c"),
            'estado_final': estado
        }

        try:
            db.collection('ordenes').add(nueva_orden)
            db.collection('equipos').document(self.doc_id_seleccionado).update({'estado_actual': estado})
            self.folio_temp = datetime.now().strftime('%y%m%d%H%M') 
            messagebox.showinfo("¡Éxito!", "Orden guardada en Firebase y Semáforo actualizado.")
        except Exception as e:
            messagebox.showerror("Error", f"Fallo al guardar: {e}")

    def imprimir_orden(self):
        seleccion = self.combo_id.get()
        if "---" in seleccion or not seleccion or "No hay" in seleccion: return
        pdf = PDFOrden(); pdf.add_page()
        pdf.set_draw_color(0, 0, 0); pdf.set_fill_color(230, 230, 230)
        id_eq = seleccion.split(' | ')[0].strip()

        pdf.set_font('Arial', 'B', 9)
        pdf.cell(20, 7, ' Unidad:', border=1, fill=True)
        pdf.set_font('Arial', '', 9); pdf.cell(35, 7, ' CEREE', border=1) # CORREGIDO A CEREE
        pdf.set_font('Arial', 'B', 9); pdf.cell(15, 7, ' Folio:', border=1, fill=True)
        pdf.set_font('Arial', '', 9); pdf.cell(25, 7, f" {getattr(self, 'folio_temp', 'S/F')}", border=1)
        pdf.set_font('Arial', 'B', 9); pdf.cell(15, 7, ' Área:', border=1, fill=True)
        pdf.set_font('Arial', '', 9); pdf.cell(50, 7, f" {self.combo_area.get()}", border=1)
        pdf.set_font('Arial', 'B', 9); pdf.cell(15, 7, ' Fecha:', border=1, fill=True)
        pdf.set_font('Arial', '', 9); pdf.cell(0, 7, f" {self.fecha_actual}", border=1, ln=1)
        pdf.ln(4)

        pdf.set_font('Arial', 'B', 9)
        pdf.cell(30, 7, 'Clave / ID', border=1, fill=True, align='C')
        pdf.cell(65, 7, 'Equipo', border=1, fill=True, align='C')
        pdf.cell(45, 7, 'Marca / Modelo', border=1, fill=True, align='C')
        pdf.cell(0, 7, 'Clasificación', border=1, fill=True, align='C', ln=1)
        pdf.set_font('Arial', '', 8)
        prev = "[X]" if self.radio_var.get() == "Preventivo" else "[ ]"
        corr = "[X]" if self.radio_var.get() == "Correctivo" else "[ ]"
        pdf.cell(30, 7, id_eq, border=1, align='C')
        pdf.cell(65, 7, self.entry_equipo.get()[:40], border=1, align='C')
        pdf.cell(45, 7, self.entry_marca_mod.get()[:30], border=1, align='C')
        pdf.cell(0, 7, f"{prev} Preventivo   {corr} Correctivo", border=1, align='C', ln=1)
        pdf.ln(4)

        for titulo, caja in [('Descripción del Reporte', self.txt_reporte), ('Descripción del Servicio', self.txt_servicio), ('Diagnóstico', self.txt_diagnostico)]:
            pdf.set_font('Arial', 'B', 9)
            pdf.cell(0, 6, titulo, border=1, fill=True, align='C', ln=1)
            pdf.set_font('Arial', '', 9)
            pdf.multi_cell(0, 6, txt=f" {caja.get('1.0', 'end-1c').replace(chr(10), ' ')}", border=1)
            pdf.ln(3)

        pdf.set_y(pdf.h - 60)
        yc = pdf.get_y()
        pdf.set_font('Arial', 'B', 9)
        pdf.cell(90, 6, 'INGENIERO BIOMÉDICO', border=1, fill=True, align='C')
        pdf.cell(10, 6, '', border=0)
        pdf.cell(90, 6, 'USUARIO RESPONSABLE', border=1, fill=True, align='C', ln=1)
        pdf.rect(10, yc + 6, 90, 22); pdf.rect(110, yc + 6, 90, 22)

        arch = f"Orden_{id_eq}_{datetime.now().strftime('%H%M%S')}.pdf"
        try:
            pdf.output(arch)
            if platform.system() == 'Windows': os.startfile(arch)
            else: subprocess.call(['open', arch])
        except Exception as e: messagebox.showerror("Error", f"Error al imprimir: {e}")

# =========================================================
# VENTANA 2: INVENTARIO Y BÚSQUEDA (CON FILTROS CEREE)
# =========================================================
class VentanaBusquedaEquipos(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.title("Inventario de Equipos Médicos")
        self.geometry("950x600")
        
        self.cache_equipos = [] 
        
        self.frame_filtros = ctk.CTkFrame(self)
        self.frame_filtros.pack(fill="x", padx=20, pady=(20, 0))

        # --- FILTROS CEREE ---
        ctk.CTkLabel(self.frame_filtros, text="Filtro de Área:", font=("Arial", 12, "bold")).pack(side="left", padx=10, pady=10)
        self.combo_filtro_area = ctk.CTkComboBox(self.frame_filtros, values=["Todas", "Mecanoterapia", "Electroterapia", "Hidroterapia", "Terapia Física", "Terapia Ocupacional", "Enfermería", "Consultorios"], command=self.aplicar_filtros)
        self.combo_filtro_area.pack(side="left", padx=10, pady=10)

        ctk.CTkLabel(self.frame_filtros, text="Buscar:", font=("Arial", 12, "bold")).pack(side="left", padx=(20, 10), pady=10)
        self.entry_busqueda = ctk.CTkEntry(self.frame_filtros, placeholder_text="Escribe ID o Nombre...", width=300)
        self.entry_busqueda.pack(side="left", padx=10, pady=10)
        self.entry_busqueda.bind("<KeyRelease>", self.aplicar_filtros) 

        self.frame_tabla = ctk.CTkFrame(self)
        self.frame_tabla.pack(fill="both", expand=True, padx=20, pady=15)
        
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4", "5", "6"), show="headings")
        for c, t in zip(("1","2","3","4","5","6"), ("ID", "Nombre", "Marca", "Modelo", "Serie", "Área")): 
            self.tabla.heading(c, text=t)
        self.tabla.pack(side="left", fill="both", expand=True)
        
        scrollbar = ttk.Scrollbar(self.frame_tabla, orient="vertical", command=self.tabla.yview)
        self.tabla.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        
        self.cargar_datos()
        
        ctk.CTkButton(self, text="🗑️ Eliminar de la Nube", fg_color="#ef4444", hover_color="#dc2626", font=("Arial", 13, "bold"), command=self.eliminar_equipo).pack(pady=(0, 15))

    def cargar_datos(self):
        self.cache_equipos = []
        try:
            for doc in db.collection('equipos').stream():
                eq = doc.to_dict()
                eq['doc_id'] = doc.id
                self.cache_equipos.append(eq)
            self.aplicar_filtros() 
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo cargar la base de datos: {e}")

    def aplicar_filtros(self, event=None):
        for fila in self.tabla.get_children(): 
            self.tabla.delete(fila)
            
        area_seleccionada = self.combo_filtro_area.get()
        texto_busqueda = self.entry_busqueda.get().lower()

        for eq in self.cache_equipos:
            area_equipo = eq.get('area_asignada', 'Todas')
            id_equipo = eq.get('id_equipo', '').lower()
            nombre_equipo = eq.get('nombre_equipo', '').lower()

            if area_seleccionada != "Todas" and area_equipo != area_seleccionada:
                continue

            if texto_busqueda and (texto_busqueda not in id_equipo and texto_busqueda not in nombre_equipo):
                continue

            self.tabla.insert("", "end", values=(
                eq.get('id_equipo','S/ID'), 
                eq.get('nombre_equipo','S/N'), 
                eq.get('marca','Genérica'), 
                eq.get('modelo','S/M'), 
                eq.get('serie','S/S'), 
                eq.get('area_asignada','S/A')
            ), tags=(eq['doc_id'],))

    def eliminar_equipo(self):
        s = self.tabla.selection()
        if s and messagebox.askyesno("Borrar", "¿Estás seguro de eliminar el equipo de Firebase?"):
            db.collection('equipos').document(self.tabla.item(s[0], "tags")[0]).delete()
            self.cargar_datos() 

# =========================================================
# VENTANAS 3, 4 Y 5: SEMÁFORO, HISTORIAL, ADMINISTRACIÓN
# =========================================================
class VentanaSemaforo(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Semáforo de Estado Clínico"); self.geometry("900x600")
        ctk.CTkLabel(self, text="Estado de Equipos Biomédicos", font=("Arial", 24, "bold")).pack(pady=15)
        self.frame_contadores = ctk.CTkFrame(self, fg_color="transparent"); self.frame_contadores.pack(fill="x", padx=20, pady=10)
        self.frame_contadores.columnconfigure((0,1,2), weight=1)
        self.lbl_funcional = self.crear_tarjeta(self.frame_contadores, "FUNCIONAL", "#16a34a", 0)
        self.lbl_precaucion = self.crear_tarjeta(self.frame_contadores, "PRECAUCIÓN", "#ca8a04", 1)
        self.lbl_fuera = self.crear_tarjeta(self.frame_contadores, "FUERA DE SERVICIO", "#dc2626", 2)
        ctk.CTkLabel(self, text="⚠️ Equipos que requieren atención:", font=("Arial", 16, "bold")).pack(pady=(20, 5))
        self.frame_tabla = ctk.CTkFrame(self); self.frame_tabla.pack(fill="both", expand=True, padx=20, pady=10)
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4"), show="headings")
        for c, t, w in zip(("1","2","3","4"), ("ID", "Nombre", "Área", "Estado"), (100, 300, 150, 150)): 
            self.tabla.heading(c, text=t); self.tabla.column(c, width=w)
        self.tabla.pack(side="left", fill="both", expand=True)
        ctk.CTkButton(self, text="🔄 Actualizar", font=("Arial", 13, "bold"), command=self.cargar_semaforo).pack(pady=10)
        self.cargar_semaforo()
        
    def crear_tarjeta(self, parent, titulo, color, col):
        frame = ctk.CTkFrame(parent, fg_color=color, corner_radius=10); frame.grid(row=0, column=col, padx=10, sticky="nsew")
        ctk.CTkLabel(frame, text=titulo, font=("Arial", 14, "bold"), text_color="white").pack(pady=(15,0))
        lbl_numero = ctk.CTkLabel(frame, text="0", font=("Arial", 36, "bold"), text_color="white"); lbl_numero.pack(pady=(0,15))
        return lbl_numero

    def cargar_semaforo(self):
        for fila in self.tabla.get_children(): self.tabla.delete(fila)
        c_ver = 0; c_ama = 0; c_roj = 0
        try:
            for doc in db.collection('equipos').stream():
                eq = doc.to_dict(); est = eq.get('estado_actual', 'FUNCIONAL')
                if est == 'FUNCIONAL': c_ver += 1
                elif est == 'PRECAUCIÓN': c_ama += 1
                elif est == 'FUERA DE SERVICIO': c_roj += 1
                if est in ['PRECAUCIÓN', 'FUERA DE SERVICIO']:
                    self.tabla.insert("", "end", values=(eq.get('id_equipo', 'S/ID'), eq.get('nombre_equipo', 'S/N'), eq.get('area_asignada', 'S/A'), est))
            self.lbl_funcional.configure(text=str(c_ver)); self.lbl_precaucion.configure(text=str(c_ama)); self.lbl_fuera.configure(text=str(c_roj))
        except: pass

class VentanaHistorial(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.title("Historial de Mantenimiento"); self.geometry("950x600")
        self.frame_tabla = ctk.CTkFrame(self); self.frame_tabla.pack(fill="both", expand=True, padx=20, pady=10)
        self.tabla = ttk.Treeview(self.frame_tabla, columns=("1", "2", "3", "4", "5"), show="headings")
        for c, t in zip(("1","2","3","4","5"), ("Fecha", "Clave", "Falla", "Prioridad", "Estado")): self.tabla.heading(c, text=t)
        self.tabla.pack(side="left", fill="both", expand=True)
        self.cargar_ordenes()
        ctk.CTkButton(self, text="🗑️ Eliminar Orden", fg_color="#ef4444", command=self.eliminar_orden).pack(pady=15)

    def cargar_ordenes(self):
        for fila in self.tabla.get_children(): self.tabla.delete(fila)
        try:
            ordenes = [doc.to_dict() | {'doc_id': doc.id} for doc in db.collection('ordenes').stream()]
            ordenes.sort(key=lambda x: x.get('fecha', ''), reverse=True)
            for o in ordenes:
                f = o.get('fecha', 'S/F').split('T')[0] if 'T' in o.get('fecha', 'S/F') else o.get('fecha', 'S/F')
                self.tabla.insert("", "end", values=(f, o.get('clave_equipo',''), o.get('falla_reportada',''), o.get('prioridad','Normal'), o.get('estado_orden','')), tags=(o['doc_id'],))
        except: pass

    def eliminar_orden(self):
        s = self.tabla.selection()
        if s and messagebox.askyesno("Borrar", "¿Eliminar orden de Firebase?"):
            db.collection('ordenes').document(self.tabla.item(s[0], "tags")[0]).delete(); self.cargar_ordenes()

class VentanaAdminBD(ctk.CTkToplevel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.title("Agregar Equipos a la Nube")
        self.geometry("450x550")
        
        ctk.CTkLabel(self, text="Alta de Nuevo Equipo Clínico", font=("Arial", 20, "bold")).pack(pady=20)
        
        self.entradas = {}
        # --- EJEMPLO CORREGIDO ---
        campos = {"id_equipo": "Clave o ID del Equipo", "nombre_equipo": "Nombre del Equipo", "marca": "Marca", "modelo": "Modelo", "serie": "Número de Serie", "area_asignada": "Área Asignada (Ej. Mecanoterapia)"}
        
        for clave_bd, texto_label in campos.items():
            f = ctk.CTkFrame(self, fg_color="transparent")
            f.pack(fill="x", padx=30, pady=8)
            ctk.CTkLabel(f, text=texto_label+":", width=160, anchor="w", font=("Arial", 12, "bold")).pack(side="left")
            e = ctk.CTkEntry(f)
            e.pack(side="right", expand=True, fill="x")
            self.entradas[clave_bd] = e
            
        ctk.CTkButton(self, text="☁️ Guardar en Firebase", font=("Arial", 14, "bold"), fg_color="#10b981", hover_color="#059669", command=self.agregar_equipo).pack(pady=30)

    def agregar_equipo(self):
        datos = {clave: entrada.get().strip() for clave, entrada in self.entradas.items()}
        if not datos['id_equipo'] or not datos['nombre_equipo']:
            messagebox.showwarning("Faltan datos", "El ID y el Nombre del equipo son obligatorios.")
            return
        datos['estado_actual'] = 'FUNCIONAL'
        try:
            db.collection('equipos').add(datos)
            messagebox.showinfo("Éxito", "El equipo fue subido a la nube correctamente.")
            self.destroy()
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar: {e}")

# =========================================================
# MENÚ PRINCIPAL
# =========================================================
class MenuPrincipal(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("Sistema de Mantenimiento BIM CEREE - Conectado a la Nube")
        self.geometry("850x500")
        
        self.ventanas_abiertas = {}

        self.label_titulo = ctk.CTkLabel(self, text="BIENVENIDOS AL SISTEMA DE MANTENIMIENTO BIM", font=("Arial", 26, "bold"))
        self.label_titulo.pack(pady=(40, 5))
        ctk.CTkLabel(self, text="Gestión y Control de Mantenimiento de Equipo Médico (Conectado a Firebase)", font=("Arial", 14), text_color="gray").pack(pady=(0, 30))

        frame_botones = ctk.CTkFrame(self, fg_color="transparent")
        frame_botones.pack(pady=10)

        # Fila 1
        btn_orden = ctk.CTkButton(frame_botones, text="📝 Crear Orden de Servicio", height=60, width=300, font=("Arial", 15, "bold"), command=lambda: self._abrir("orden", VentanaNuevaOrden))
        btn_orden.grid(row=0, column=0, padx=15, pady=10)

        btn_semaforo = ctk.CTkButton(frame_botones, text="🚦 Tablero de Estados TINC", height=60, width=300, font=("Arial", 15, "bold"), fg_color="#ea580c", hover_color="#c2410c", command=lambda: self._abrir("semaforo", VentanaSemaforo))
        btn_semaforo.grid(row=0, column=1, padx=15, pady=10)

        # Fila 2
        btn_inventario = ctk.CTkButton(frame_botones, text="🔍 Búsqueda de Equipos", height=60, width=300, font=("Arial", 15, "bold"), command=lambda: self._abrir("busqueda", VentanaBusquedaEquipos))
        btn_inventario.grid(row=1, column=0, padx=15, pady=10)

        btn_historial = ctk.CTkButton(frame_botones, text="📚 Historial de Órdenes", height=60, width=300, font=("Arial", 15, "bold"), command=lambda: self._abrir("historial", VentanaHistorial))
        btn_historial.grid(row=1, column=1, padx=15, pady=10)
        
        # Fila 3
        btn_admin = ctk.CTkButton(frame_botones, text="⚙️ Administrar Base de Datos (Agregar Equipos)", height=60, width=630, font=("Arial", 15, "bold"), fg_color="#4b5563", hover_color="#374151", command=lambda: self._abrir("admin", VentanaAdminBD))
        btn_admin.grid(row=2, column=0, columnspan=2, padx=15, pady=10)

    def _abrir(self, nombre, clase_ventana):
        if nombre in self.ventanas_abiertas and self.ventanas_abiertas[nombre].winfo_exists():
            self.ventanas_abiertas[nombre].focus()
        else:
            self.ventanas_abiertas[nombre] = clase_ventana(self)

if __name__ == "__main__":
    app = MenuPrincipal()
    app.mainloop()