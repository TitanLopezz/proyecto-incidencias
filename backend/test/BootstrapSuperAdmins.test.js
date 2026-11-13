const test = require('node:test')
const assert = require('node:assert/strict')
const { readSuperAdminCredentials } = require('../src/infrastructure/database/bootstrapSuperAdmins')

test('superadmin seed reads the two passwords from the environment', () => {
  const credentials = readSuperAdminCredentials({
    SUPERADMIN1_PASSWORD: 'First-secret-123',
    SUPERADMIN2_PASSWORD: 'Second-secret-456',
  })

  assert.deepEqual(credentials, [
    {
      name: 'Superadministrador 1',
      email: 'superadmin1@incidencias.local',
      password: 'First-secret-123',
    },
    {
      name: 'Superadministrador 2',
      email: 'superadmin2@incidencias.local',
      password: 'Second-secret-456',
    },
  ])
})

test('superadmin seed rejects missing or invalid passwords', () => {
  assert.throws(
    () => readSuperAdminCredentials({ SUPERADMIN1_PASSWORD: 'Long-enough-password' }),
    /SUPERADMIN2_PASSWORD/,
  )
  assert.throws(
    () => readSuperAdminCredentials({
      SUPERADMIN1_PASSWORD: 'short',
      SUPERADMIN2_PASSWORD: 'Second-secret-456',
    }),
    /SUPERADMIN1_PASSWORD/,
  )
  assert.throws(
    () => readSuperAdminCredentials({
      SUPERADMIN1_PASSWORD: 'a'.repeat(73),
      SUPERADMIN2_PASSWORD: 'Second-secret-456',
    }),
    /SUPERADMIN1_PASSWORD/,
  )
})
