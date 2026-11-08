# NeuroLab Enterprise — Fase 4: Evaluación e historial

> **Estado:** en desarrollo — primer incremento preparado (8 de noviembre de 2026). No cerrar hasta verificar migración 004, evaluación real, RLS y despliegue Vercel.
> **Antecedente:** Fase 3 formalmente cerrada; ver `FASE_3_FEEDFORWARD.md` (documento único consolidado).

## Alcance de este incremento

- Se evalúa **una sola vez** el conjunto de prueba, **después de `model.fit()`** y antes de liberar los tensores. El test no interviene en la selección de arquitectura, umbral, transformaciones o entrenamiento.
- **Clasificación binaria:** pérdida Binary Crossentropy (promedio), exactitud, precisión, recall, F1 y matriz de confusión a umbral **0,5 fijo**. Divisiones con denominador cero se informan como `0` en precisión, recall o F1 (convención explícita).
- **Regresión:** MSE, RMSE, MAE, R²; si la varianza del objetivo del test es cero, R² es `null` y la UI lo explica.
- Nuevos eventos `evaluation` viajan del Worker a React. `onEpochEnd` continúa alimentando las curvas existentes, sin datos de demostración.
- Se añade `public.run_evaluations` con solo lectura RLS por membresía y **una evaluación por ejecución**. Una RPC valida pertenencia al proyecto, creador, rol Ingeniero, estado y estructura de métricas; inserta la evaluación antes de que se confirme la finalización. No envía filas ni predicciones individuales.
- Historial completo en `/proyectos/:projectId/historial`, visible para los cuatro roles de proyecto. Paginación en servidor (8 por página), consulta de épocas reales y evaluación desde Supabase. Una cuenta Administrador global sin membresía **no** puede consultar el historial técnico.
- Los entrenamientos de Fase 3 pueden carecer de evaluación; se muestra un aviso sin inventar resultados.
- **Pendiente de incrementos siguientes:** inferencia interactiva durante la sesión, comparación ampliada de ejecuciones. La restauración de modelos desde Storage corresponde a F5.

## Procedimiento de instalación (Git Bash / VSCode)

1. Aplicar el parche F4 sobre el repositorio actual. No reemplazar `.env.local`, `.env.test.local`, `package-lock.json` ni `.git`.
2. Ejecutar **una sola vez** `supabase/migrations/202611080004_test_evaluation.sql` en SQL Editor, DESPUÉS de 003.
3. Ejecutar:

```bash
npm install
npm run test:evaluation
npm run test:preprocessing
npm run test:network
npm run test:persistence
npm run typecheck
npm run build
npm run test:training:runtime
npm run test:fase4:live
```

4. Realizar entrenamiento binario y de regresión con los dos CSV de prueba. Confirmar que el test solo se evalúa al completar todas las épocas, se muestran sus métricas y aparece confirmación real en Supabase. Cancelar otro entrenamiento: no debe generar una evaluación de test.
5. Recargar: abrir **Proyecto → Historial**, seleccionar una ejecución nueva y otra anterior a F4. Confirmar curvas recuperadas y que la anterior indica ausencia de evaluación; comprobar lectura con Revisor/Lector y denegación de escritura directa/lectura de proyecto ajeno.
6. Si todo pasa, publicar:

```bash
git add .
git commit -m "feat(fase4): evaluacion final y recuperacion de historial"
git push origin main
```

## Criterios de aceptación del incremento

- [ ] La migración 004 se ejecutó sin errores; F1–F3 no se reejecutaron.
- [ ] `npm run typecheck`, `npm run build` y pruebas pasan en el equipo.
- [ ] El CSV de clasificación produce pérdida, exactitud, precisión, recall, F1 y matriz de confusión reales; la regresión MSE, RMSE, MAE y R² definido cuando corresponde.
- [ ] La tabla `run_evaluations` muestra solo datos de proyectos autorizados; INSERT/UPDATE/DELETE directos se deniegan.
- [ ] La evaluación se inserta una sola vez, después de todas las épocas de entrenamiento y antes de `finish_training_run`.
- [ ] El historial recupera épocas persistidas aun al volver a abrir el navegador; no finge tener el modelo o predicciones anteriores.
- [ ] Vercel muestra el historial para Integrantes, sin conceder accesos técnicos al Administrador global automáticamente.

## Advertencias y limitaciones

- Las métricas provienen de TF.js del navegador y siguen siendo resultados **reportados por el cliente**; las RPC no certifican criptográficamente su autenticidad.
- El historial conserva agregados, no los CSV ni el estado en memoria del modelo. Todavía no se puede reanudar una ejecución ni recuperar los pesos para inferencia después de cerrar la pestaña.
- Si falla la RPC al guardar la evaluación, la UI indicará guardado parcial/fallido y no afirmará persistencia completa.
- La app no envía predicciones individuales; solo estadísticas agregadas. Los proyectos con pocas muestras deben evitarse para datos sensibles, porque los agregados pueden revelar información.

---

## Incremento 2 — Inferencia en sesión y comparación de ejecuciones (8 de noviembre de 2026)

**Estado:** parche preparado para validación en VSCode y Vercel; la Fase 4 permanece abierta hasta comprobarlo.

### Alcance

- **Predicción en sesión actual:** después de `model.fit()` y de evaluar test, se conserva temporalmente la red Dense en el Worker (o en el hilo principal, si se aplicó el respaldo). El usuario introduce valores originales en un formulario generado a partir de los transformadores del dataset; se aplica el **mismo manifiesto de preprocesamiento de train** y se ejecuta `model.predict()`. La clasificación muestra clase y probabilidad de la segunda etiqueta con umbral fijo 0,5; la regresión entrega el valor continuo en la escala original. No hay resultados de ejemplo ni se guardan entradas de inferencia.
- **Gestión de memoria:** la red se libera al abandonar la pantalla o comenzar un nuevo entrenamiento. La pérdida de Worker invalida solicitudes pendientes, en vez de aparentar predicciones. El modelo no se conserva al recargar ni se sube a Supabase; la persistencia de pesos queda para la Fase 5.
- **Comparación de ejecuciones:** en `/proyectos/:projectId/historial` se seleccionan **dos ejecuciones completadas del mismo problema**, incluso si están en páginas distintas del listado. Se muestran las métricas de test realmente confirmadas y se superponen las pérdidas de validación registradas por época, dejando huecos cuando falten valores. La consulta usa las RLS y tablas existentes.
- La comparación es **descriptiva**, no un mecanismo automático de selección del mejor modelo. Si el dataset, particiones o semillas son diferentes, las métricas de test pueden no ser directamente comparables. El usuario no debe ajustar hiperparámetros con el conjunto de prueba.
- **Sin SQL ni dependencias nuevas:** se reutilizan la migración 004, TensorFlow.js, Recharts y los componentes compartidos existentes.

### Pruebas a ejecutar

```bash
npm install
npm run test:fase4:prediction
npm run test:evaluation
npm run test:preprocessing
npm run typecheck
npm run build
npm run test:training:runtime
```

### Validación manual obligatoria

1. Como **Ingeniero**, importar uno de los CSV de prueba, preparar, entrenar hasta `COMPLETED` y observar la nueva tarjeta **Predicción local**. Introducir valores en las unidades originales, solicitar una predicción y verificar que el resultado cambia según las entradas. Repetir una predicción con clasificación y otra con regresión.
2. Cambiar a otra pestaña y regresar: la predicción debe seguir disponible mientras la ruta esté montada. Salir de la pantalla y volver: **no** debe presentarse un modelo anterior como cargado; es necesario reentrenar (hasta F5).
3. Probar cancelación: una ejecución cancelada **no** habilita predicción. El Worker se libera al abandonar la pantalla.
4. Crear dos ejecuciones finalizadas del mismo tipo y abrir **Historial**. Seleccionarlas para comparar: tabla y líneas deben provenir únicamente de Supabase. Un run antiguo sin evaluación muestra ausencia de métricas test, nunca valores inventados.
5. Con cuenta Lector/Revisor consultar las comparaciones autorizadas; con cuenta de otro proyecto o Admin global sin membresía no debe ser posible leer recursos técnicos.
6. Confirmar `npm run build` y despliegue Vercel desde GitHub. Solo entonces registrar el cierre de la Fase 4.

**Limitación de confianza:** las métricas y predicciones se calcularon en el dispositivo del usuario; RLS protege acceso, no certifica que un cliente no fue alterado.
