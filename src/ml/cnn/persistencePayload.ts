/** Contrato puro de metadatos CNN-4B, compatible con la RPC de migración 012. */
import { splitCnnHoldoutIndices, type CnnEvaluation } from './cnnEvaluation.ts'
import type { LocalImageDataset } from './localImageCsv.ts'
import type { CnnConfig } from './architecture.ts'
import type { CnnTrainOptions } from './trainingTypes.ts'

const CNN_SEED = 42
const CNN_APP_VERSION = '0.1.0'

/** El hash pasado es del archivo completo; dataset.count describe solo filas leídas. */
export function cnnRunPayload(projectId: string, dataset: LocalImageDataset, fileSize: number,
  fileHash: string, config: CnnConfig, options: CnnTrainOptions) {
  const labels = dataset.labels.subarray(0, options.samples)
  const split = splitCnnHoldoutIndices(labels, dataset.classNames.length, CNN_SEED)
  const input = { width: dataset.width, height: dataset.height, channels: 1, classes: dataset.classNames.length }
  return {
    p_project_id: projectId,
    p_dataset_name: dataset.name,
    p_row_count: dataset.count,
    p_byte_size: fileSize,
    p_file_hash: fileHash,
    p_schema_json: {
      kind: 'cnn_image_csv_v1', width: dataset.width, height: dataset.height,
      channels: 1, classNames: dataset.classNames, sampleCount: dataset.count,
      truncated: dataset.truncated, originalScale: dataset.originalScale,
    },
    p_preprocessing_json: {
      family: 'cnn', kind: 'cnn_image_csv_v1', width: dataset.width, height: dataset.height,
      channels: 1, classNames: dataset.classNames, normalization: 'divide_by_255',
      seed: CNN_SEED, sampleCount: options.samples,
      split: { strategy: 'stratified_70_15_15_v1', trainCount: split.train.length,
        validationCount: split.validation.length, testCount: split.test.length },
    },
    p_architecture_config: { family: 'cnn', blocks: config.blocks.map((block) => ({ ...block })),
      denseUnits: config.denseUnits, input, outputActivation: 'softmax' },
    p_hyperparameters_json: { optimizer: 'adam', epochs: options.epochs,
      batchSize: options.batchSize, learningRate: options.learningRate,
      samples: options.samples, seed: CNN_SEED },
    p_seed: CNN_SEED,
    p_app_version: CNN_APP_VERSION,
  }
}


/** Se quitan explícitamente los ejemplos, imágenes y probabilidades individuales. */
export function cnnEvaluationSummary(evaluation: CnnEvaluation) {
  return {
    problemType: 'multiclass', classNames: evaluation.classNames,
    sampleCount: evaluation.sampleCount, loss: evaluation.loss,
    accuracy: evaluation.accuracy, macroPrecision: evaluation.macroPrecision,
    macroRecall: evaluation.macroRecall, macroF1: evaluation.macroF1,
    matrix: evaluation.matrix,
  }
}

