"""Demo: agente de triaje para atención al cliente (Customer Experience).

Qué es: un clasificador pequeño y auditable que recibe un mensaje de un
cliente (en español), detecta la intención, extrae el número de pedido si
lo hay, decide la acción (responder con información, pedir un dato que
falta o escalar a un humano) y redacta una respuesta en español.

Qué NO es: no es un agente en producción. No llama a ningún LLM por
defecto, no toca datos reales de clientes y no promete reembolsos ni
tiempos de entrega. El clasificador por defecto es por reglas (palabras
clave + puntuación), pensado para que cualquiera pueda correrlo sin llaves
ni instalaciones. La integración con un LLM es un punto de extensión
documentado en `llm.py`: si hay una llave configurada, el agente puede
pedirle una clasificación y usarla solo cuando su confianza supera el
umbral; si no, sigue con reglas y escala a humano.

Guardarraíles (lo que el squad de Rappi pide explícitamente):
- Nunca promete un reembolso, un monto ni una hora de entrega.
- Nunca pide contraseñas ni datos completos de tarjeta.
- Redacta datos sensibles (correo, teléfono, tarjeta) antes de registrar
  nada en logs.
- Cuando la confianza es baja o el mensaje pide un reembolso, escala a
  un humano en vez de inventar una respuesta.

Uso:
    python3 agent.py "Mi pedido 123456 no llegó, ¿qué pasó?"
    python3 evals.py          # corre el set dorado y reporta precisión
    python3 -m unittest test_agent.py -v
"""

from __future__ import annotations

import json
import re
import sys

# Umbral de confianza: por debajo de esto, se escala a humano.
UMBRAL_CONFIANZA = 0.45

INTENCIONES = {
    "pedido_no_llego": [
        "no llegó", "no llego", "no ha llegado", "no me llegó", "no me llego",
        "dónde está mi pedido", "donde esta mi pedido", "retrasado", "retraso",
        "nunca llegó", "nunca llego", "no aparece", "sin entregar",
    ],
    "reembolso": [
        "reembolso", "reembolsar", "devuelvan", "devuelvanme", "devuélvanme",
        "quiero mi dinero", "me cobraron de más", "me cobraron de mas",
        "cobro duplicado", "cargo duplicado",
    ],
    "cambio_direccion": [
        "cambiar la dirección", "cambiar la direccion", "otra dirección",
        "otra direccion", "dirección incorrecta", "direccion incorrecta",
        "me equivoqué de dirección", "me equivoque de direccion",
    ],
    "queja_calidad": [
        "llegó frío", "llego frio", "llegó frio", "en mal estado", "dañado",
        "dañada", "faltó", "falto", "incompleto", "sabe mal", "vencido",
    ],
    "estado_pedido": [
        "estatus", "estado de mi pedido", "en qué va", "en que va",
        "cuándo llega", "cuando llega", "tiempo estimado", "ya salió",
        "ya salio", "dónde va", "donde va",
    ],
}

RESPUESTAS = {
    "pedido_no_llego": (
        "Lamento la espera. Estoy revisando el estado de tu pedido {pedido} "
        "con el repartidor y te confirmo en unos minutos qué pasó. "
        "Si prefieres, un agente humano puede tomar tu caso ahora mismo."
    ),
    "reembolso": (
        "Entiendo tu molestia. Para revisar tu caso necesito el número de "
        "pedido{pedido_sufijo}. Un agente humano revisará si aplica "
        "reembolso y te confirmará la resolución; yo no puedo prometerte "
        "un monto ni un plazo."
    ),
    "cambio_direccion": (
        "Claro, puedo ayudarte con el cambio de dirección. Compárteme la "
        "dirección correcta y el número de pedido{pedido_sufijo}, y lo "
        "reviso con el repartidor antes de que salga a ruta."
    ),
    "queja_calidad": (
        "Lamento que tu pedido llegara así. ¿Me compartes el número de "
        "pedido{pedido_sufijo} y una foto del producto? Con eso lo registro "
        "y un agente humano te dará seguimiento."
    ),
    "estado_pedido": (
        "Tu pedido {pedido} está en camino según el último registro. "
        "Te aviso en cuanto cambie su estado."
    ),
    "otro": (
        "Gracias por escribirnos. ¿Me compartes el número de pedido y un "
        "poco más de detalle para ayudarte mejor? Si lo prefieres, te "
        "paso con un agente humano."
    ),
}

# Patrones de datos sensibles: se redactan antes de cualquier log.
_PATRONES_SENSIBLES = [
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[CORREO]"),
    (re.compile(r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b"), "[TARJETA]"),
    (re.compile(r"\b\d{10}\b"), "[TELÉFONO]"),
]

_PATRON_PEDIDO = re.compile(r"\b(?:pedido|orden|#)\s*#?\s*(\d{5,})\b", re.IGNORECASE)


def redactar(texto: str) -> str:
    """Redacta correo, tarjeta y teléfono antes de registrar un mensaje."""
    for patron, reemplazo in _PATRONES_SENSIBLES:
        texto = patron.sub(reemplazo, texto)
    return texto


def extraer_pedido(texto: str) -> str | None:
    match = _PATRON_PEDIDO.search(texto)
    return match.group(1) if match else None


def clasificar(texto: str) -> tuple[str, float]:
    """Clasifica por reglas. Devuelve (intención, confianza 0-1)."""
    normalizado = texto.lower()
    mejor_intencion, mejor_puntaje = "otro", 0.0
    for intencion, claves in INTENCIONES.items():
        puntaje = sum(1 for clave in claves if clave in normalizado)
        # Normaliza: 2 coincidencias ya dan confianza alta.
        confianza = min(1.0, puntaje / 2.0)
        if confianza > mejor_puntaje:
            mejor_intencion, mejor_puntaje = intencion, confianza
    return mejor_intencion, mejor_puntaje


def decidir_accion(intencion: str, confianza: float, pedido: str | None) -> str:
    if confianza < UMBRAL_CONFIANZA:
        return "escalar_a_humano"
    if intencion == "reembolso":
        # Los reembolsos siempre los resuelve un humano; el agente solo
        # recoge el caso y redacta la respuesta inicial.
        return "recoger_caso_y_escalar"
    if intencion in ("pedido_no_llego", "queja_calidad") and pedido is None:
        return "pedir_numero_pedido"
    return "responder"


def procesar_mensaje(texto: str) -> dict:
    """Punto de entrada: clasifica, decide y redacta. Nunca registra
    el texto original sin redactar."""
    texto_limpio = redactar(texto)
    intencion, confianza = clasificar(texto)
    pedido = extraer_pedido(texto)
    accion = decidir_accion(intencion, confianza, pedido)
    plantilla = RESPUESTAS[intencion]
    respuesta = plantilla.format(
        pedido=pedido or "sin número registrado",
        pedido_sufijo=f" ({pedido})" if pedido else "",
    )
    return {
        "mensaje_redactado": texto_limpio,
        "intencion": intencion,
        "confianza": round(confianza, 2),
        "pedido": pedido,
        "accion": accion,
        "respuesta": respuesta,
    }


if __name__ == "__main__":
    mensaje = " ".join(sys.argv[1:]) or "Hola, mi pedido 123456 no llegó"
    print(json.dumps(procesar_mensaje(mensaje), ensure_ascii=False, indent=2))
