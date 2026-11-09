// Pruebas estructurales aisladas de la política de revisión; sin conexión remota.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/202611090009_model_reviews.sql', 'utf8')
const ui = readFileSync('src/features/models/ModelReviewsSection.tsx', 'utf8')
const service = readFileSync('src/services/modelReviews.ts', 'utf8')

const t = (value) => value.replace(/\s+/g, ' ')

test('tabla de eventos independiente y RLS activo', () => {
  assert.match(sql, /CREATE TABLE public\.model_review_events/)
  assert.match(sql, /ALTER TABLE public\.model_review_events ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.model_review_events FROM public, anon, authenticated/)
  assert.match(sql, /GRANT SELECT ON public\.model_review_events TO authenticated/)
})

test('sin INSERT/UPDATE/DELETE directo en tabla de revisión', () => {
  assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE)/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.decide_model_review\(uuid,text,text\) TO authenticated/)
})

test('roles estrictos; Admin global no hereda permiso técnico', () => {
  assert.match(t(sql), /private\.has_project_role\(v_version\.project_id, ARRAY\['reviewer'\]::text\[\]\)/)
  assert.doesNotMatch(sql, /private\.is_platform_admin\(/)
  assert.match(sql, /private\.has_project_role\(project_id/)
})

test('no puede revisar quien entrenó o publicó su versión', () => {
  assert.match(sql, /v_version\.created_by = v_actor/)
  assert.match(sql, /r\.created_by = v_actor/)
  assert.match(sql, /m\.created_by = v_actor/)
})

test('transiciones de revisión estrictas y terminales', () => {
  assert.match(sql, /v_current = 'draft' AND p_decision = 'reviewed'/)
  assert.match(sql, /v_current = 'reviewed' AND p_decision IN \('approved','rejected'\)/)
  assert.match(sql, /v_current = 'approved' AND p_decision = 'retired'/)
  assert.doesNotMatch(sql, /UPDATE public\.model_versions/i)
})

test('bloqueo serializa decisiones y registro audita misma transacción', () => {
  assert.match(sql, /FOR UPDATE/)
  assert.match(sql, /INSERT INTO public\.model_review_events/)
  assert.match(sql, /INSERT INTO public\.audit_events/)
  assert.match(sql, /'model_approved','model_rejected','model_retired'/)
})

test('comentario obligatorio de 10 caracteres para rechazar o retirar', () => {
  assert.match(sql, /p_decision IN \('rejected','retired'\) AND char_length\(v_note\) < 10/)
  assert.match(service, /note\.trim\(\)\.length < 10/)
})

test('el frontend utiliza RPC, nunca escribe en model_versions', () => {
  assert.match(service, /\.rpc\('decide_model_review'/)
  assert.doesNotMatch(service, /\.from\('model_versions'\)/)
  assert.match(ui, /<ModelReviewsSection|function ModelReviewsSection/)
  assert.match(ui, /<Modal open=/)
  assert.match(ui, /<Pagination page=/)
  assert.match(ui, /listModelReviews\(projectId\)/)
})

test('historial visible a miembros y presentación de decisiones', () => {
  assert.match(ui, /Historial de decisiones/)
  assert.match(ui, /allowedReviewDecisions\[status\]/)
  assert.match(ui, /role === 'reviewer'/)
  assert.match(ui, /authoredBySelf/)
})
