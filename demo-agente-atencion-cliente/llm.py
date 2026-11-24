"""Punto de extensión para un LLM (opcional, no requerido para el demo).

Hoy el agente clasifica por reglas en `agent.py` y funciona sin ninguna
llave. Cuando se quiera usar un LLM real (por ejemplo, para mensajes que
las reglas no cubren), este módulo es el único lugar que cambia:

1. Configura `LLM_API_KEY` y `LLM_API_URL` (endpoint compatible con
   OpenAI, `/v1/chat/completions`) como variables de entorno. Nunca
   escribas la llave en el código.
2. `clasificar_con_llm(texto)` devuelve `(intencion, confianza)` o
   `None` si no hay llave, si el servicio falla o si la respuesta no es
   una intención válida. En todos esos casos el agente sigue con reglas.
3. La decisión final sigue en `agent.decidir_accion`: aunque el LLM
   diga que es un reembolso, la acción sigue siendo recoger el caso y
   escalar a humano.

No se incluye ninguna llamada en vivo ni dependencia nueva: solo
`urllib` de la librería estándar.
"""

from __future__ import annotations

import json
import os
import urllib.request

INTENCIONES_VALIDAS = {
    "pedido_no_llego",
    "reembolso",
    "cambio_direccion",
    "queja_calidad",
    "estado_pedido",
    "otro",
}


def clasificar_con_llm(texto: str) -> tuple[str, float] | None:
    """Intenta clasificar con un LLM. Devuelve None si no está
    configurado, si falla la llamada o si la respuesta no es válida.
    Nunca lanza una excepción al agente que llama."""
    api_key = os.environ.get("LLM_API_KEY")
    api_url = os.environ.get("LLM_API_URL")
    if not api_key or not api_url:
        return None
    try:
        cuerpo = json.dumps(
            {
                "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Clasifica el mensaje de un cliente en una sola palabra: "
                            "pedido_no_llego, reembolso, cambio_direccion, "
                            "queja_calidad, estado_pedido u otro. Responde solo "
                            "con la palabra, sin explicaciones."
                        ),
                    },
                    {"role": "user", "content": texto},
                ],
                "temperature": 0,
            }
        ).encode()
        peticion = urllib.request.Request(
            api_url,
            data=cuerpo,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(peticion, timeout=10) as respuesta:
            datos = json.loads(respuesta.read())
        palabra = (
            datos["choices"][0]["message"]["content"].strip().lower()
        )
        if palabra not in INTENCIONES_VALIDAS:
            return None
        # Sin calibración de confianza del proveedor, se reporta 0.7:
        # suficiente para responder, insuficiente para decidir un
        # reembolso, que de todos modos siempre escala a humano.
        return palabra, 0.7
    except Exception:
        return None
