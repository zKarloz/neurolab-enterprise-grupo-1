import { supabase } from '../lib/supabase'
import type { ModelArtifactBundle } from '../ml/models/artifacts.ts'
import { MAX_MODEL_JSON_BYTES, MAX_MODEL_WEIGHTS_BYTES, parseModelJson } from '../ml/models/artifacts.ts'
import type { CnnPreprocessingManifest } from '../ml/cnn/modelPersistence.ts'
import type { PreparationManifest } from '../ml/preprocessing/types.ts'

export const MODEL_BUCKET = 'model-artifacts'

export interface RegisteredModel {
  id: string
  project_id: string
  name: string
  created_at: string
}
export interface RegisteredVersion {
  id: string
  project_id: string
  model_id: string
  run_id: string
  version: number
  manifest_path: string
  weights_path: string
  manifest_sha256: string
  weights_sha256: string
  preprocessing_manifest: PreparationManifest | CnnPreprocessingManifest
  backend: string
  tfjs_version: string
  created_at: string
}

function client() {
  if (!supabase) throw new Error('No hay conexión con Supabase.')
  return supabase
}

/** Solo hashes y topología/pesos, nunca CSV ni muestras. Requiere HTTPS o localhost. */
export async function sha256(input: ArrayBuffer | Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Se requiere HTTPS para verificar integridad (SHA-256).')
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, '0')).join('')
}

interface UploadReservation {
  id: string
  model_id: string
  version: number
  manifest_path: string
  weights_path: string
}

/** F5: reservar -> subir dos objetos nuevos -> publicar versión inmutable -> confirmar lectura. */
export async function saveModelVersion(runId: string, name: string, bundle: ModelArtifactBundle): Promise<RegisteredVersion> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 120) throw new Error('El nombre del modelo debe tener entre 1 y 120 caracteres.')
  const encoded = new TextEncoder().encode(bundle.modelJson)
  if (!encoded.byteLength || encoded.byteLength > MAX_MODEL_JSON_BYTES || !bundle.weightData.byteLength ||
    bundle.weightData.byteLength > MAX_MODEL_WEIGHTS_BYTES) throw new Error('El artefacto excede los límites de almacenamiento.')
  parseModelJson(bundle.modelJson, bundle.weightData)
  const [manifestHash, weightsHash] = await Promise.all([sha256(encoded), sha256(bundle.weightData)])

  const { data, error } = await client().rpc('reserve_model_upload', { p_run_id: runId, p_name: trimmed })
  if (error) throw new Error(`No se autorizó la reserva: ${error.message}`)
  const reserved = data as UploadReservation | null
  if (!reserved?.id || !reserved.manifest_path || !reserved.weights_path) {
    throw new Error('La reserva de Storage no devolvió rutas válidas.')
  }
  const storage = client().storage.from(MODEL_BUCKET)
  // No upsert: las rutas de versiones son únicas y nunca se sobrescriben.
  const weightsUpload = await storage.upload(reserved.weights_path,
    new Blob([bundle.weightData], { type: 'application/octet-stream' }),
    { contentType: 'application/octet-stream', upsert: false })
  if (weightsUpload.error) throw new Error(`No se pudieron subir los pesos: ${weightsUpload.error.message}`)
  const manifestUpload = await storage.upload(reserved.manifest_path,
    new Blob([bundle.modelJson], { type: 'application/json' }),
    { contentType: 'application/json', upsert: false })
  if (manifestUpload.error) throw new Error(`No se pudo subir model.json: ${manifestUpload.error.message}`)
  const published = await client().rpc('publish_model_version', {
    p_upload_id: reserved.id, p_manifest_sha256: manifestHash, p_weights_sha256: weightsHash,
  })
  if (published.error) throw new Error(`Los archivos se subieron, pero la versión no se confirmó: ${published.error.message}`)
  // La UI no anuncia éxito hasta recuperar el registro desde la fuente de verdad.
  const { data: version, error: checkError } = await client().from('model_versions').select('*').eq('id', reserved.id).single()
  if (checkError || !version) throw new Error(`No se pudo verificar la versión registrada: ${checkError?.message ?? 'sin confirmación'}`)
  return version as RegisteredVersion
}

/** Lectura privada, exclusivamente de versiones confirmadas protegidas por RLS. */
export async function listRegisteredModels(projectId: string): Promise<{
  models: RegisteredModel[]; versions: RegisteredVersion[]
}> {
  const [modelsResult, versionsResult] = await Promise.all([
    client().from('models').select('id,project_id,name,created_at').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(100),
    client().from('model_versions').select('*').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(150),
  ])
  if (modelsResult.error) throw new Error(`Error consultando modelos: ${modelsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Error consultando versiones: ${versionsResult.error.message}`)
  return { models: (modelsResult.data ?? []) as RegisteredModel[],
    versions: (versionsResult.data ?? []) as RegisteredVersion[] }
}

/** Descarga JWT, comprueba hashes y nunca crea URL pública/firmada para el artefacto. */
export async function downloadModelVersion(version: RegisteredVersion): Promise<ModelArtifactBundle> {
  const storage = client().storage.from(MODEL_BUCKET)
  const [manifest, weights] = await Promise.all([
    storage.download(version.manifest_path), storage.download(version.weights_path),
  ])
  if (manifest.error || !manifest.data) throw new Error(`No se pudo descargar model.json: ${manifest.error?.message}`)
  if (weights.error || !weights.data) throw new Error(`No se pudieron descargar los pesos: ${weights.error?.message}`)
  const [modelJson, weightData] = await Promise.all([manifest.data.text(), weights.data.arrayBuffer()])
  const [manifestHash, weightsHash] = await Promise.all([
    sha256(new TextEncoder().encode(modelJson)), sha256(weightData),
  ])
  if (manifestHash !== version.manifest_sha256 || weightsHash !== version.weights_sha256) {
    throw new Error('La integridad del modelo no coincide con la versión publicada.')
  }
  parseModelJson(modelJson, weightData)
  return { modelJson, weightData }
}
