import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isActivePlatformAdmin, isAdminAction, validEmail, validDisplayName, validUuid,
  validStatus, mayManageUser, validPage,
} from '../supabase/functions/admin-users/policy.ts'

test('solo un administrador ACTIVO de base de datos puede operar', () => {
  assert.equal(isActivePlatformAdmin({status:'active',is_platform_admin:true}),true)
  assert.equal(isActivePlatformAdmin({status:'inactive',is_platform_admin:true}),false)
  assert.equal(isActivePlatformAdmin({status:'active',is_platform_admin:false}),false)
  assert.equal(isActivePlatformAdmin(null),false)
  assert.equal(isActivePlatformAdmin({status:'active',is_platform_admin:'true'}),false)
})

test('ninguna cuenta gestiona su propio estado ni otra cuenta global', () => {
  const actor = '11111111-1111-4111-8111-111111111111'
  assert.equal(mayManageUser(actor,{id:actor,status:'active',is_platform_admin:false}),false)
  assert.equal(mayManageUser(actor,{id:'22222222-2222-4222-8222-222222222222',status:'active',is_platform_admin:true}),false)
  assert.equal(mayManageUser(actor,{id:'22222222-2222-4222-8222-222222222222',status:'inactive',is_platform_admin:false}),true)
})

test('sólo acepta acciones previstas, correos, estados e identificadores válidos', () => {
  assert.equal(isAdminAction('promote_admin'),false)
  for(const action of ['list','create','set_status','reset_password']) assert.equal(isAdminAction(action),true)
  assert.equal(validEmail('demo@example.com'),true)
  assert.equal(validEmail('x'.repeat(260)+'@test.com'),false)
  assert.equal(validEmail('no-email'),false)
  assert.equal(validDisplayName('Nombre de prueba'),true)
  assert.equal(validDisplayName(' '),false)
  assert.equal(validStatus('blocked'),false)
  assert.equal(validStatus('inactive'),true)
  assert.equal(validUuid('11111111-1111-4111-8111-111111111111'),true)
  assert.equal(validUuid('no-uuid'),false)
  assert.equal(validPage(-1),1)
  assert.equal(validPage(2),2)
})
