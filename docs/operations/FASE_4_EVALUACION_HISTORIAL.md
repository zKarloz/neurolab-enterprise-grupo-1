# NeuroLab Enterprise — Fase 4: Evaluación, historial y predicción

> **Estado funcional:** CERRADA Y VALIDADA por el usuario el 8 de noviembre de 2026.
> **Versión documental:** 1.0 — documento único consolidado de la Fase 4.
> **Cambio estético adicional:** preparado para instalar; la coloración de las columnas A/B debe verificarse tras su próximo despliegue.
> **Prerequisitos:** fases 0–3; migración `202611080004_test_evaluation.sql` ya aplicada.

## 1. Objetivo y alcance implementado

La Fase 4 permite evaluar una red Feedforward Dense sobre un conjunto de **prueba independiente**, presentar sus métricas calculadas por TensorFlow.js, consultar el historial real de entrenamientos, comparar dos ejecuciones y realizar predicción **durante la sesión de entrenamiento**. Se mantiene el procesamiento en el navegador y la autorización por RLS en Supabase.

| Componente | Comportamiento implementado |
| --- | --- |
| Evaluación binaria | Binary Crossentropy, accuracy, precisión, recall, F1 y matriz de confusión; umbral de decisión de 0,5. |
| Evaluación de regresión | MSE, RMSE, MAE y R² (no definido si el conjunto de prueba tiene objetivo constante). |
| Momento de evaluación | Solo al terminar `model.fit()`; los datos de test no ajustan pesos, escalados ni hiperparámetros. |
| Métricas en vivo | Callbacks reales `onEpochEnd` en TensorFlow.js; gráficas de pérdida y métrica para entrenamiento/validación. |
| Persistencia | `training_metrics` y evaluación final agregada en Supabase; se confirman las escrituras antes de declararlas guardadas. |
| Historial | Listado y detalle por proyecto con paginación, métricas por época y recuperación de curvas desde registros autorizados. |
| Comparación | Dos ejecuciones completadas del mismo tipo; métricas y pérdidas de validación confirmadas, sin rellenar épocas ausentes. |
| Inferencia en sesión | Modelo en memoria tras entrenar; aplica el mismo manifiesto de preparación aprendido solo con train. |
| Liberación de recursos | Se libera el modelo local al abandonar la pantalla o comenzar otra ejecución. |
| Seguridad | Solo integrantes autorizados acceden a resultados técnicos; Admin global no hereda lectura automática. |

## 2. Datos y seguridad

La migración `supabase/migrations/202611080004_test_evaluation.sql` añade `public.run_evaluations` y la RPC protegida que registra la evaluación de un entrenamiento completo. El frontend no recibe privilegios de escritura directa sobre esa tabla. La RPC verifica pertenencia, estado de ejecución, rol Ingeniero y autoría, y no guarda CSV originales ni predicciones individuales.

La evaluación asociada a una ejecución se registra una sola vez. El historial puede mostrar ejecuciones previas sin evaluación de test y debe distinguir esa ausencia de un valor de cero. Las métricas del cliente son reales en la ejecución observada, pero RLS no certifica criptográficamente la integridad de un navegador manipulado.

## 3. Flujo de usuario validado

1. Un Ingeniero abre un proyecto, importa un CSV local y lo prepara con una partición reproducible sin fuga de información.
2. Configura una Feedforward Dense y entrena, observando métricas reales por época.
3. Tras finalizar, la aplicación evalúa test y confirma resultados agregados en Supabase.
4. El Ingeniero usa **Predicción local · sesión actual** con nuevos valores originales; las transformaciones se reutilizan sin reajustarlas.
5. Un integrante autorizado consulta el historial aun después de recargar o volver a iniciar sesión; la recuperación incluye métricas y gráficas, pero **no pesos**.
6. Desde Historial compara dos ejecuciones válidas, con métricas test y líneas de validación.

## 4. Evidencias de aceptación confirmadas por el usuario

Las pruebas de la fase y el despliegue en Vercel se comunicaron como correctos tras resolver incidencias de tipado, autenticación y lectura de CSV de producción. Se probó inferencia de ambos tipos:

| Prueba | Valor calculado en Vercel | Observación |
| --- | --- | --- |
| Clasificación (dataset cáncer de mama, objetivo `diagnostico`) | Clase estimada `0`; probabilidad clase `1` = `0,45 %` | Resultado acorde con la etiqueta `0` del ejemplo utilizado; **no representa una interpretación clínica**. |
| Regresión (dataset diabetes, objetivo `progresion`) | `207,997406` | Predicción numérica original; el ejemplo de referencia tiene objetivo `151`, por lo que existe error de predicción. |

El usuario confirmó también que la comparación de dos entrenamientos de regresión funciona. Los resultados reportados fueron:

| Métrica | A · `d5124b08` | B · `0075e7e2` |
| --- | ---: | ---: |
| Épocas confirmadas | 10 | 20 |
| Backend | WEBGL | WEBGL |
| MSE test | 2 886,356074 | 2 886,861538 |
| RMSE test | 53,724818 | 53,729522 |
| MAE test | 45,782828 | 45,562019 |
| R² test | 0,476172 | 0,476080 |

Estos resultados demuestran que la comparación presenta valores diferentes sin inventarlos. No justifican proclamar una ejecución como superior en general: B mejora ligeramente MAE, mientras que A mejora ligeramente MSE, RMSE y R²; se desconoce si los conjuntos de prueba son idénticos salvo por el cambio de hiperparámetros.

## 5. Ajuste visual final: coherencia entre tabla y líneas

Se incorpora una pequeña mejora visual a `src/features/evaluation/RunComparison.tsx`:

- **Columna A:** todos los textos (identificador, épocas, backend y métricas) usan `var(--chart-train)`, el mismo morado que la línea A.
- **Columna B:** todos los textos usan `var(--chart-validation)`, el mismo celeste que la línea B.
- Los tokens se adaptan a claro/oscuro mediante `src/styles/index.css`, sin depender únicamente del color para identificar la ejecución: las etiquetas A/B siguen visibles.
- El celeste del tema claro se ajusta a `#147089` para asegurar contraste suficiente en texto pequeño.
- Este ajuste **no modifica** los datos, los cálculos ni la migración.

El test de estilo `tests/fase4.comparison-colors.test.mjs` verifica que ambas columnas usen los tokens de sus líneas, que las etiquetas sigan visibles y que el contraste alcance 4,5:1 en los fondos de las tarjetas.

## 6. Comprobaciones para el cambio estético

Desde Git Bash, sobre el repositorio que ya contiene Fase 4:

```bash
node --test tests/fase4.comparison-colors.test.mjs
npm run typecheck
npm run build
npm run test:fase4:prediction
npm run test:evaluation
```

Verificar visualmente la comparación de A/B en **tema claro** y **tema oscuro**. El cambio requiere despliegue a Vercel para formar parte de la aplicación publicada; el cierre funcional de la Fase 4 ya fue confirmado previamente.

## 7. Limitaciones y traspaso a la Fase 5

- El modelo entrenado solo existe en memoria durante la sesión y se libera al abandonar la pantalla. No puede recuperarse para inferir después de recargar.
- No se almacenan CSV originales en Supabase; para repetir un entrenamiento hay que volver a seleccionarlos.
- Los pesos y `model.json`, bucket privado, versiones inmutables y recuperación de inferencia son **Fase 5**.
- Una comparación descriptiva de modelos no valida resultados clínicos ni garantiza reproducibilidad numérica exacta entre hardware/backend diferentes.
- Fase 5 debe implementar versiones append-only y políticas Storage que no concedan UPDATE/DELETE a roles de la aplicación, respetando RLS y permisos por proyecto.

**Cierre:** la Fase 4 está funcionalmente aprobada por los resultados y pruebas comunicados por el usuario. Su único ajuste pendiente de desplegar es de presentación: los colores de A/B.
