# Demo: agente de triaje para atención al cliente

Demo pequeña en Python (solo librería estándar, sin dependencias) que
muestra lo que hace un AI Builder en un squad de Customer Experience:
recibe un mensaje de un cliente en español, clasifica la intención,
decide la acción y redacta una respuesta — con guardarraíles y con
evaluación medible.

## Qué demuestra (mapeado al rol de AI Builder, Rappi)

| Lo que pide el rol | Dónde está en este demo |
|---|---|
| Agentes de IA para atención al cliente | `agent.py`: triaje + decisión + respuesta |
| Evals | `evals.py`: set dorado de 12 casos sintéticos, meta ≥ 80% |
| Guardrails | `agent.py`: nunca promete reembolsos ni plazos, nunca pide contraseñas/tarjetas, redacta PII antes de loguear |
| Escalación a humano | Baja confianza o reembolso → `escalar_a_humano` / `recoger_caso_y_escalar` |
| Integración con LLM | `llm.py`: punto de extensión opcional (endpoint compatible con OpenAI, por variables de entorno, con fallback a reglas) |

## Cómo correrlo

```bash
# Sin instalar nada (solo Python 3.10+)
python3 agent.py "Mi pedido 123456 no llegó, ¿qué pasó?"
python3 evals.py
python3 -m unittest test_agent.py -v
```

Ejemplo de salida:

```json
{
  "mensaje_redactado": "Mi pedido 123456 no llegó, ¿qué pasó?",
  "intencion": "pedido_no_llego",
  "confianza": 0.5,
  "pedido": "123456",
  "accion": "responder",
  "respuesta": "Lamento la espera. Estoy revisando el estado de tu pedido 123456..."
}
```

## Honestidad sobre el alcance

- **No es un agente en producción.** El clasificador por defecto es por
  reglas; el LLM es opcional y no está conectado a ningún proveedor.
- **No hay datos reales.** Los 12 casos de `evals.py` son sintéticos,
  inventados para medir el clasificador.
- **No promete nada al cliente.** Los reembolsos siempre los resuelve
  un humano; el agente solo recoge el caso.
- Próximo paso natural: conectar el LLM (`llm.py`), ampliar el set
  dorado con casos reales anonimizados y medir precisión por intención.
