const test = require('node:test')
const assert = require('node:assert/strict')
const Category = require('../src/domain/entities/Category')
const IncidentStatus = require('../src/domain/entities/IncidentStatus')
const IncidentStatusTransitions = require('../src/domain/services/IncidentStatusTransitions')

test('Category accepts the supported urban incident categories', () => {
  assert.deepEqual(Category.VALUES, ['bache', 'alumbrado', 'basura'])
  assert.equal(Category.create('bache').name, 'bache')
  assert.throws(() => Category.create('otro'), /categoría/)
})

test('IncidentStatus accepts the persisted incident statuses', () => {
  assert.deepEqual(IncidentStatus.VALUES, [
    'abierta',
    'en_proceso',
    'resuelta',
    'cerrada',
  ])
  assert.equal(IncidentStatus.create('abierta').value, 'abierta')
  assert.throws(() => IncidentStatus.create('reportada'), /estado/)
})

test('IncidentStatusTransitions allows only the next status in the workflow', () => {
  assert.equal(IncidentStatusTransitions.canTransition('abierta', 'en_proceso'), true)
  assert.equal(IncidentStatusTransitions.canTransition('en_proceso', 'resuelta'), true)
  assert.equal(IncidentStatusTransitions.canTransition('resuelta', 'cerrada'), true)
  assert.equal(IncidentStatusTransitions.canTransition('cerrada', 'abierta'), false)
  assert.equal(IncidentStatusTransitions.canTransition('abierta', 'cerrada'), false)
  assert.throws(
    () => IncidentStatusTransitions.assertCanTransition('abierta', 'resuelta'),
    /No se permite cambiar el estado/,
  )
})
