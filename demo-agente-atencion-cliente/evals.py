"""Set dorado de evaluación (evals) — 12 casos sintéticos en español.

Ningún mensaje es de un cliente real: son casos inventados para medir
si el clasificador distingue las intenciones del squad (pedido no llegó,
reembolso, cambio de dirección, queja de calidad, estado del pedido) y
si escala cuando debe. La meta de este demo es >= 80% de acierto en
intención; si baja de ahí, el cambio va en las reglas de `agent.py`,
no en los casos.

Uso:  python3 evals.py
"""

from __future__ import annotations

from agent import clasificar, decidir_accion, extraer_pedido

# (mensaje, intención esperada, acción esperada)
CASOS = [
    ("Mi pedido 123456 no llegó, ¿qué pasó?", "pedido_no_llego", "responder"),
    ("Llevo una hora esperando y no ha llegado nada", "pedido_no_llego", "pedir_numero_pedido"),
    ("Quiero un reembolso, me cobraron de más", "reembolso", "recoger_caso_y_escalar"),
    ("Me hicieron un cobro duplicado en mi tarjeta", "reembolso", "recoger_caso_y_escalar"),
    ("Me equivoqué de dirección, ¿la puedo cambiar? Pedido 987654", "cambio_direccion", "responder"),
    ("La comida llegó fría y en mal estado, pedido 555111", "queja_calidad", "responder"),
    ("Faltó un producto en mi pedido 222333", "queja_calidad", "responder"),
    ("¿En qué va mi pedido 777888?", "estado_pedido", "responder"),
    ("¿Cuándo llega mi pedido?", "estado_pedido", "responder"),
    ("Hola, buenos días", "otro", "escalar_a_humano"),
    ("¿Tienen promociones hoy?", "otro", "escalar_a_humano"),
    ("Mi pedido no aparece, no sé qué pasó", "pedido_no_llego", "pedir_numero_pedido"),
]


def main() -> int:
    aciertos = 0
    print(f"{'Caso':<58} {'Esperada':<18} {'Obtenida':<18} {'OK'}")
    for mensaje, esperada, accion_esperada in CASOS:
        intencion, confianza = clasificar(mensaje)
        accion = decidir_accion(intencion, confianza, extraer_pedido(mensaje))
        ok = intencion == esperada and accion == accion_esperada
        aciertos += ok
        print(f"{mensaje[:56]:<58} {esperada:<18} {intencion:<18} {'✓' if ok else '✗'}")
    precision = aciertos / len(CASOS)
    print(f"\nAcierto en intención + acción: {aciertos}/{len(CASOS)} ({precision:.0%}) — meta ≥ 80%")
    return 0 if precision >= 0.8 else 1


if __name__ == "__main__":
    raise SystemExit(main())
