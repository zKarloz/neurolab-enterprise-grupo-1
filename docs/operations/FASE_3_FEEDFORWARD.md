# Fase 3 — Feedforward: documento de trabajo único

Estado: **En progreso. Incremento 1: CSV local y preparación reproducible.**

Fuente de diseño: `docs/architecture/FASE_0_DISENO_APROBADO.md`. La Fase 3 se completará únicamente cuando exista entrenamiento real Feedforward Dense, validación de Worker/backend, configuración de arquitectura y persistencia autorizada de metadatos/ejecuciones. **Aún no se cumplen esos criterios.**

## 1. Incremento 1: componentes implementados

- Nueva ruta privada `/proyectos/:projectId/datos`. La pantalla solo permite entrar al Ingeniero de un proyecto activo, consultando su rol **real** en `project_members`. Ni el Administrador global ni el Responsable heredarán ese permiso sin una asignación de Ingeniero.
- Lectura de archivo local con `PapaParse 5.7.0`, comprobando extensión `.csv`, límite **10 MiB**, máximo **50 000 filas** y de **2 a 100 columnas** (el máximo de columnas es provisional).
- Cabeceras no vacías/únicas, columnas consistentes y errores de análisis visibles. No se sube ni guarda el CSV en Supabase.
- Preprocesamiento local tipado e independiente de React:
  - clasificación binaria con división estratificada y regresión con división aleatoria;
  - semilla determinista 42, partición aproximada 70/15/15 (redondeada por clase cuando es binaria);
  - identificación de tipos de predictores **solo con train**, estandarización o normalización ajustadas **solo con train**;
  - imputación numérica de valores vacíos con media de train; representación categórica one-hot, canal para categorías no vistas;
  - límite provisional de 40 categorías por variable y 128 características codificadas; presupuesto mínimo estimado del tensor de características de 64 MiB;
  - almacenamiento local del manifiesto en memoria, para reutilizarlo más adelante en inferencia.
- Interfaz: selector de objetivo y problema, resumen de características y tamaños reales de partición. No aparecen métricas ficticias.

## 2. Ejecución local

Desde la raíz del proyecto, en Git Bash:

```bash
npm install
npm run typecheck
npm run build
npm run test:structure
npm run test:projects
npm run test:design
npm run test:preprocessing
npm run dev
```

Al probar desde la web, incorpora una cuenta de **Ingeniero** a un proyecto que exista, inicia sesión con esa cuenta, abre **Proyectos → Proyecto → Preparar CSV** y prueba los CSV en `tests/fixtures/`. La cuenta Administrador/Responsable **no** mostrará esta acción a menos que tenga rol Ingeniero en ese proyecto; al existir un solo rol por proyecto, usa una cuenta aparte de Ingeniero para esta comprobación.

No se debe ejecutar ninguna migración nueva de Supabase para este incremento. El archivo `package-lock.json` se genera/actualiza con `npm install` **en tu repositorio local** y se incluye en el commit. No sobrescribas `.env.local` ni tu identidad Git.

## 3. Pruebas de Incremento 1

`npm run test:preprocessing` usa Node 22 con `--experimental-strip-types` (sin añadir un runner). Prueba separación reproducible sin solapamientos, ausencia de fuga en la estandarización, vocabulario de entrenamiento, valores desconocidos, clasificación estratificada, errores del objetivo, esquema y límites de categorías. Se requiere `npm run typecheck` y `npm run build` en el equipo con dependencias instaladas antes de desplegar.

Los límites de características, categorías y memoria son presupuestos iniciales sujetos a pruebas empíricas en navegadores y equipos objetivos. El tamaño de fichero no garantiza memoria suficiente.

## 4. Próximos incrementos de la misma fase

1. Arquitecturas Feedforward Dense y validación de configuración.
2. Entrenamiento real TensorFlow.js `4.22.0`, callbacks `onEpochEnd`, cancelación, Worker + backend compatible o fallback probado; registro del backend realmente usado.
3. Migración específica de F3 para `architectures`, `datasets` (solo metadatos), `training_runs` y métricas iniciales con RLS estricta y pruebas cruzadas de pertenencia/rol; persistencia confirmada.

No crear todavía versiones de modelos ni reportes, que corresponden a F5/F6. Una vez terminada toda la fase, consolidar su documentación en **este único Markdown**.

## 5. Condición de cierre de Fase 2 aún pendiente

Antes de declarar F2 cerrada, ejecutar la prueba real de dos cuentas documentada en `docs/operations/FASE_2_PROYECTOS.md` y `npm run test:fase2:live`, utilizando un `.env.test.local` excluido de Git. El despliegue y las pruebas estructurales, por sí solos, no demuestran el aislamiento RLS.
