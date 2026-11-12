import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Database, Download, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { SelectField } from '../../components/ui/SelectField'
import type { FamilyFilter } from '../../ml/evaluation/families.ts'
import { Surface } from '../../components/ui/Surface'
import { Tabs } from '../../components/ui/Tabs'
import { useAuth } from '../auth/AuthProvider'
import { SessionPredictionCard } from '../evaluation/SessionPredictionCard'
import { supabase } from '../../lib/supabase'
import { getProject } from '../../services/projects'
import { downloadModelVersion, listRegisteredModels } from '../../services/modelRegistry'
import type { RegisteredModel, RegisteredVersion } from '../../services/modelRegistry'
import { loadDensePredictor } from '../../ml/models/artifacts'
import { isCnnManifest, loadCnnPredictor } from '../../ml/cnn/modelPersistence.ts'
import { isRnnManifest, loadRnnPredictor } from '../../ml/rnn/modelPersistence.ts'
import { RnnRestoredPredictionCard } from './RnnRestoredPredictionCard'
import { isGanManifest, loadGanGenerator } from '../../ml/gan/modelPersistence.ts'
import { GanRestoredGenerationCard } from './GanRestoredGenerationCard'
import { CnnRestoredPredictionCard } from './CnnRestoredPredictionCard'
import { ModelReviewsSection } from './ModelReviewsSection'

const PAGE_SIZE = 8
type RegistryTab = 'published' | 'reviews'
const REGISTRY_TABS = [
  { id: 'published', label: 'Versiones publicadas' },
  { id: 'reviews', label: 'Revisión y aprobación' },
] as const
type RegistryFamilyFilter = FamilyFilter | 'gan'

type LoadedPredictor = Awaited<ReturnType<typeof loadDensePredictor>> | Awaited<ReturnType<typeof loadCnnPredictor>> | Awaited<ReturnType<typeof loadRnnPredictor>> | Awaited<ReturnType<typeof loadGanGenerator>>

/** Registro F5: solo miembros de proyecto, lectura de archivos privados JWT y sin CSV. */
export function ModelRegistryPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [permission, setPermission] = useState<'checking'|'allowed'|'denied'>('checking')
  const [projectName, setProjectName] = useState('')
  const [models, setModels] = useState<RegisteredModel[]>([])
  const [versions, setVersions] = useState<RegisteredVersion[]>([])
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<RegistryTab>('published')
  const [family, setFamily] = useState<RegistryFamilyFilter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<RegisteredVersion | null>(null)
  const predictor = useRef<LoadedPredictor | null>(null)
  // Impedir que descargas antiguas se muestren tras cambiar versión, filtro o proyecto.
  const loadGeneration = useRef(0)
  const filteredVersions = useMemo(() => versions.filter((item) => family === 'all' ||
    (isGanManifest(item.preprocessing_manifest) ? 'gan' : isRnnManifest(item.preprocessing_manifest) ? 'rnn' : isCnnManifest(item.preprocessing_manifest) ? 'cnn' : 'feedforward') === family), [versions, family])
  const pageVersions = useMemo(() => filteredVersions.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE), [filteredVersions,page])

  useEffect(() => {
    let current = true
    loadGeneration.current += 1
    predictor.current?.dispose(); predictor.current = null
    setSelected(null)
    setBusy(false)
    setPermission('checking')
    void (async () => {
      if (!supabase || !projectId || !userId) throw new Error('Sin sesión.')
      const [project, member] = await Promise.all([
        getProject(projectId),
        supabase.from('project_members').select('role').eq('project_id',projectId).eq('user_id',userId).maybeSingle(),
      ])
      if (member.error || !project || !member.data) throw new Error('Sin acceso técnico al proyecto.')
      const registry = await listRegisteredModels(projectId)
      if (current) {
        setProjectName(project.name)
        setModels(registry.models)
        setVersions(registry.versions)
        setPermission('allowed')
      }
    })().catch(() => { if (current) setPermission('denied') })
    return () => { current = false }
  }, [projectId,userId])

  useEffect(() => () => { loadGeneration.current += 1; predictor.current?.dispose(); predictor.current = null }, [])

  /** Al salir de Versiones, liberar pesos y descartar descargas aún pendientes. */
  function changeTab(next: string) {
    if (next !== 'published' && next !== 'reviews' || next === tab) return
    loadGeneration.current += 1
    predictor.current?.dispose()
    predictor.current = null
    setSelected(null)
    setBusy(false)
    setError('')
    setTab(next)
  }

  async function loadVersion(version: RegisteredVersion) {
    const generation = ++loadGeneration.current
    setBusy(true)
    setError('')
    setSelected(null)
    predictor.current?.dispose()
    predictor.current = null
    try {
      const bundle = await downloadModelVersion(version)
      if (generation !== loadGeneration.current) return
      const restored = isGanManifest(version.preprocessing_manifest)
        ? await loadGanGenerator(bundle, version.preprocessing_manifest)
        : isRnnManifest(version.preprocessing_manifest)
        ? await loadRnnPredictor(bundle, version.preprocessing_manifest)
        : isCnnManifest(version.preprocessing_manifest)
          ? await loadCnnPredictor(bundle, version.preprocessing_manifest)
          : await loadDensePredictor(bundle)
      // No conservar pesos si la pantalla cambió mientras se descargaba la versión.
      if (generation !== loadGeneration.current) { restored.dispose(); return }
      predictor.current = restored
      setSelected(version)
    } catch (cause) { if (generation === loadGeneration.current) setError(cause instanceof Error ? cause.message : 'No fue posible cargar el modelo.') }
    finally { if (generation === loadGeneration.current) setBusy(false) }
  }

  if (permission === 'checking') return <Surface className="p-6"><p role="status">Comprobando acceso a los modelos…</p></Surface>
  if (permission === 'denied') return <Notice tone="error">Se requiere membresía activa en el proyecto para acceder a sus modelos privados.</Notice>

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold">Modelos privados</h1>
      <p className="text-sm text-[var(--muted)]">{projectName} · Versiones inmutables, descargadas desde Storage privado bajo RLS.</p>
    </header>
    <Tabs label="Secciones de modelos privados" idPrefix="model-registry"
      items={REGISTRY_TABS} value={tab} onChange={changeTab} />
    <div id={`model-registry-panel-${tab}`} role="tabpanel"
      aria-labelledby={`model-registry-tab-${tab}`} tabIndex={0}
      className="min-w-0 space-y-6 focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
    {tab === 'published' ? <>
    <Surface className="space-y-4 p-5 sm:p-7">
      <div className="flex items-center gap-2"><Database size={19} aria-hidden="true"/><h2 className="text-lg font-semibold">Versiones publicadas</h2></div>
      <p className="text-sm text-[var(--muted)]">Los Ingenieros publican versiones desde el entrenamiento finalizado. Los miembros autorizados pueden recuperarlas para predecir sin el CSV.</p>
      <div className="max-w-xs"><SelectField id="registry-family" label="Familia de modelo" value={family} options={[{ value: 'all', label: 'Todas las familias' }, { value: 'feedforward', label: 'Feedforward' }, { value: 'cnn', label: 'CNN' }, { value: 'rnn', label: 'RNN' }, { value: 'gan', label: 'GAN' }]} onChange={(event) => { loadGeneration.current += 1; setFamily(event.target.value as RegistryFamilyFilter); setPage(1); setSelected(null); setBusy(false); predictor.current?.dispose(); predictor.current = null }}/></div>
      {filteredVersions.length === 0 ? <Notice>No hay versiones publicadas para este filtro.</Notice> : <div className="overflow-x-auto">
        <table className="w-full min-w-[630px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="p-3">Modelo</th><th className="p-3">Familia</th><th className="p-3">Versión</th><th className="p-3">Backend</th><th className="p-3">Fecha</th><th className="p-3">Acción</th></tr></thead>
          <tbody>{pageVersions.map((version) => <tr key={version.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-3 font-medium">{models.find((model) => model.id === version.model_id)?.name ?? 'Modelo'}</td>
            <td className="p-3">{isGanManifest(version.preprocessing_manifest) ? 'GAN' : isRnnManifest(version.preprocessing_manifest) ? 'RNN' : isCnnManifest(version.preprocessing_manifest) ? 'CNN' : 'Feedforward'}</td>
            <td className="p-3 tabular-nums">v{version.version}</td>
            <td className="p-3">{version.backend.toUpperCase()}</td>
            <td className="p-3">{new Date(version.created_at).toLocaleString('es-PE')}</td>
            <td className="p-3"><Button type="button" variant="outline" disabled={busy} aria-pressed={selected?.id === version.id} onClick={() => void loadVersion(version)}>
              <Download size={16}/> Cargar y predecir</Button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <Pagination page={page} pageSize={PAGE_SIZE} total={filteredVersions.length} onPageChange={setPage}/>
      {busy && <p role="status">Descargando y verificando el modelo…</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </Surface>
    {selected && <div className="space-y-4">
      <Notice tone="success"><ShieldCheck size={16} className="inline"/> Versión v{selected.version} cargada con integridad SHA-256 verificada. Los datos de entrada de predicción siguen siendo locales.</Notice>
      {isGanManifest(selected.preprocessing_manifest) ? <GanRestoredGenerationCard key={selected.id}
        dimension={selected.preprocessing_manifest.dimension}
        generate={async (count) => {
          const loaded = predictor.current
          if (!loaded || !('generate' in loaded)) throw new Error('El generador GAN restaurado ya no está disponible.')
          return loaded.generate(count)
        }}/>
      : isRnnManifest(selected.preprocessing_manifest) ? <RnnRestoredPredictionCard key={selected.id}
        manifest={selected.preprocessing_manifest}
        predict={async (window) => {
          const loaded = predictor.current
          if (!loaded || !('manifest' in loaded) || !('predict' in loaded)) throw new Error('La RNN restaurada no está disponible.')
          return loaded.predict(window)
        }}/>
      : isCnnManifest(selected.preprocessing_manifest) ? <CnnRestoredPredictionCard key={selected.id}
        input={(predictor.current as Awaited<ReturnType<typeof loadCnnPredictor>>).input}
        classNames={(predictor.current as Awaited<ReturnType<typeof loadCnnPredictor>>).classNames}
        predict={(pixels) => {
          const loaded = predictor.current
          if (!loaded || !('input' in loaded)) return Promise.reject(new Error('La CNN ya no está disponible.'))
          return loaded.predict(pixels)
        }}/>
        : <SessionPredictionCard key={selected.id} manifest={selected.preprocessing_manifest}
          predict={async (values) => {
            const loaded = predictor.current
            if (!loaded || 'input' in loaded || 'manifest' in loaded) throw new Error('El modelo Feedforward ya no está disponible.')
            return loaded.predict(values)
          }}/>} 
    </div>}
    </> : <ModelReviewsSection projectId={projectId} models={models} versions={versions} />}
    </div>
  </div>
}
