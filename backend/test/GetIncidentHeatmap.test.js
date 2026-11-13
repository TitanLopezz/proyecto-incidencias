const test = require('node:test')
const assert = require('node:assert/strict')
const GetIncidentHeatmap = require('../src/application/use-cases/GetIncidentHeatmap')
const ForbiddenError = require('../src/domain/errors/ForbiddenError')

test('GetIncidentHeatmap returns repository points for administrators', async () => {
  const points = [{ lat: 16.7569, lng: -93.1292, weight: 1 }]
  let repositoryCalled = false
  const useCase = new GetIncidentHeatmap({
    async getHeatmapData() {
      repositoryCalled = true
      return points
    },
  })

  assert.equal(await useCase.execute({ role: 'admin' }), points)
  assert.equal(repositoryCalled, true)
  assert.equal(await useCase.execute({ role: 'superadmin' }), points)
})

test('GetIncidentHeatmap rejects non-staff roles before querying the repository', async () => {
  let repositoryCalled = false
  const useCase = new GetIncidentHeatmap({
    async getHeatmapData() {
      repositoryCalled = true
      return []
    },
  })

  await assert.rejects(useCase.execute({ role: 'citizen' }), ForbiddenError)
  await assert.rejects(useCase.execute({ role: undefined }), ForbiddenError)
  assert.equal(repositoryCalled, false)
})
