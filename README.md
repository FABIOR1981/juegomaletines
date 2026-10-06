# Simulador de Maletines

Simulador del juego de los maletines ("Trato o No Trato"), basado en el concepto de valor esperado. Tiene dos usos: jugar la partida clásica, o usarlo como base para dinámicas con personas o grupos (por ejemplo, en talleres o evaluaciones).

Sitio publicado: https://juegomaletines.netlify.app

## Funcionalidades

### Jugar (`juego.html`)

- Partida completa: elegís un maletín, lo abrís en rondas y negociás con la banca.
- Panel con el **valor esperado (VE)** y la **oferta estimada de la banca** en cada ronda.
- Modos de visualización: **Básico**, **TV** y **Seguimiento**. Seguimiento sirve para anotar en vivo un programa de televisión: se marca el maletín del participante, se registran las ofertas reales y se puede deshacer.
- **Perfil de la banca**: Normal, Tacaña o Generosa.
- Modo educativo y perfil de riesgo.
- Decisión final: quedarse con el maletín propio o cambiarlo.

### Dinámicas (`dinamicas.html`)

Ejercicios individuales y grupales basados en el mismo modelo:

- **Perfil de decisión (estandarizada)**: prueba individual con las mismas condiciones para todos. Al terminar genera un informe técnico de evaluación conductual, que se puede imprimir.
- **Consenso cronometrado**: el grupo decide en conjunto con tiempo límite. Se puede registrar quién impulsó cada decisión y al final sale un informe grupal.
- **Equipos enfrentados**.
- **Consistencia (test-retest)**.

## Cómo se usa

1. Abrí `index.html` y elegí **Jugar** o **Dinámicas**.
2. En las dinámicas, iniciá la prueba y seguí las decisiones de la persona o del grupo.
3. Al final, abrí el informe con **Ver Informe Profesional** e imprimilo si hace falta.

En [documentacion-central](https://github.com/FABIOR1981/documentacion-central/blob/main/juegomaletines/documentacion/presentacion.pdf) hay una presentación del proyecto.

## Ejecutar localmente

No necesita instalación. Abrí `index.html` en el navegador.

## Estructura

```
index.html                    Menú de inicio
juego.html / script.js        Partida clásica
dinamicas.html / dinamicas.js Dinámicas e informes
styles.css / dinamicas.css    Estilos
documentacion/                Aviso: la presentación está en documentacion-central
```
