"""Pruebas unitarias del agente de triaje (stdlib unittest, sin dependencias).

Uso:  python3 -m unittest test_agent.py -v
"""

import unittest

from agent import clasificar, decidir_accion, extraer_pedido, procesar_mensaje, redactar


class TestClasificacion(unittest.TestCase):
    def test_pedido_no_llego(self):
        intencion, confianza = clasificar("Mi pedido 123456 no llegó")
        self.assertEqual(intencion, "pedido_no_llego")
        self.assertGreaterEqual(confianza, 0.45)

    def test_reembolso_escala(self):
        resultado = procesar_mensaje("Quiero un reembolso, me cobraron de más, pedido 123456")
        self.assertEqual(resultado["intencion"], "reembolso")
        self.assertEqual(resultado["accion"], "recoger_caso_y_escalar")
        self.assertNotIn("te reembolso", resultado["respuesta"].lower())

    def test_baja_confianza_escala_a_humano(self):
        resultado = procesar_mensaje("Hola, buenos días")
        self.assertEqual(resultado["accion"], "escalar_a_humano")

    def test_sin_pedido_pide_numero(self):
        resultado = procesar_mensaje("Mi pedido no llegó, no sé qué pasó")
        self.assertEqual(resultado["accion"], "pedir_numero_pedido")


class TestGuardarrailes(unittest.TestCase):
    def test_redacta_correo_y_tarjeta(self):
        texto = "Soy juan@mail.com, mi tarjeta es 4111 1111 1111 1111"
        limpio = redactar(texto)
        self.assertNotIn("juan@mail.com", limpio)
        self.assertNotIn("4111", limpio)
        self.assertIn("[CORREO]", limpio)
        self.assertIn("[TARJETA]", limpio)

    def test_extraer_pedido(self):
        self.assertEqual(extraer_pedido("pedido 987654 no llegó"), "987654")
        self.assertIsNone(extraer_pedido("Hola, buenos días"))

    def test_nunca_promete_monto_ni_plazo(self):
        for mensaje in [
            "Quiero un reembolso, pedido 123456",
            "Mi pedido no llegó, pedido 123456",
            "La comida llegó fría, pedido 123456",
        ]:
            respuesta = procesar_mensaje(mensaje)["respuesta"]
            self.assertNotIn("te reembolso", respuesta.lower())
            self.assertNotIn("en 24 horas", respuesta.lower())


if __name__ == "__main__":
    unittest.main()
