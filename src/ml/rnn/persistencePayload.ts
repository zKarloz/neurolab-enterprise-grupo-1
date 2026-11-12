/**
 * RNN-4A: contrato puro de metadatos para la RPC (se conectará a UI en RNN-4B).
 * Nunca se envían el CSV, ventanas, tensores, predicciones ni objetivos por fila.
 */
import type { RawTable } from '../preprocessing/types.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'
import { describeSequenceDataset } from './sequenceDataset.ts'
import type { RnnConfig } from './architecture.ts'
import type { RnnTrainOptions } from './trainingTypes.ts'
import type { RnnPreparedData } from './trainingData.ts'
import type { RnnTestEvaluation } from './evaluation.ts'

export function rnnRunPayload(projectId: string, datasetName: string, byteSize: number, sha256: string,
  table: RawTable, datasetOptions: RnnDatasetOptions, architecture: RnnConfig,
  trainOptions: RnnTrainOptions, prepared: RnnPreparedData) {
  const summary = describeSequenceDataset(table, datasetOptions)
  return {
    p_project_id: projectId,
    p_dataset_name: datasetName,
    p_row_count: table.rows.length,
    p_byte_size: byteSize,
    p_file_hash: sha256,
    p_schema_json: {
      kind: 'rnn_temporal_csv_v1', seriesColumn: datasetOptions.seriesColumn,
      timeColumn: datasetOptions.timeColumn, targetColumn: datasetOptions.targetColumn,
      features: [...datasetOptions.features], rowCount: table.rows.length,
      seriesCount: summary.seriesCount, windowCount: summary.windowCount,
    },
    p_preprocessing_json: {
      family: 'rnn', kind: 'rnn_temporal_csv_v1',
      seriesColumn: datasetOptions.seriesColumn, timeColumn: datasetOptions.timeColumn,
      targetColumn: datasetOptions.targetColumn, features: [...datasetOptions.features],
      steps: datasetOptions.steps, problemType: datasetOptions.problemType,
      classNames: [...prepared.classNames],
      normalization: {
        means: [...prepared.normalization.means], scales: [...prepared.normalization.scales],
        targetMean: prepared.normalization.targetMean, targetScale: prepared.normalization.targetScale,
      },
      split: { strategy: 'per_series_chronological_purged_v1',
        trainCount: prepared.train.count, validationCount: prepared.validation.count,
        testCount: prepared.test.count },
    },
    p_architecture_config: { family: 'rnn', ...architecture, input: { ...prepared.shape } },
    p_hyperparameters_json: { optimizer: 'adam', ...trainOptions },
    p_seed: 42,
    p_app_version: '0.1.0',
  }
}

/** Exclusivamente métricas agregadas; `examples` nunca sale del navegador. */
export function rnnEvaluationSummary(problemType: RnnDatasetOptions['problemType'], evaluation: RnnTestEvaluation) {
  if (evaluation.kind === 'regression') {
    if (problemType !== 'regression') throw new Error('Tipo de problema RNN inconsistente.')
    return { family: 'rnn', problemType, sampleCount: evaluation.count,
      mse: evaluation.mse, rmse: evaluation.rmse, mae: evaluation.mae, r2: evaluation.r2 }
  }
  if (problemType === 'regression') throw new Error('Tipo de clasificación RNN inconsistente.')
  return { family: 'rnn', problemType, sampleCount: evaluation.count,
    classNames: [...evaluation.classes], accuracy: evaluation.accuracy,
    macroPrecision: evaluation.macroPrecision, macroRecall: evaluation.macroRecall,
    macroF1: evaluation.macroF1, matrix: evaluation.confusion.map((row) => [...row]) }
}
