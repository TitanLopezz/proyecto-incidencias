const test = require('node:test')
const assert = require('node:assert/strict')
const GetSpatialClusters = require('../src/application/use-cases/GetSpatialClusters')
const createController = require('../src/infrastructure/http/controllers/incidentController')

test('cluster endpoint passes validated metric parameters to the configured use case', async () => {
  const useCase = new GetSpatialClusters({
    async getSpatialClusters(input) {
      assert.deepEqual(input, { epsMeters: 300, minPoints: 3 })
      return [{ cluster_id: 0 }]
    },
  })
  const controller = createController({ getSpatialClusters: useCase })
  const response = { status(code) { assert.equal(code, 200); return this },
    json(body) { assert.deepEqual(body.data, [{ cluster_id: 0 }]) } }
  await controller.clusters({ auth: { role: 'admin' }, query: { epsMeters: '300', minPoints: '3' } }, response)
  await assert.rejects(useCase.execute({ role: 'citizen' }), /Solo el personal/)
  for (const epsMeters of [0, -1, Infinity, NaN, 10001]) {
    await assert.rejects(useCase.execute({ role: 'admin', epsMeters }), /epsMeters/)
  }
  await assert.rejects(useCase.execute({ role: 'admin', minPoints: 2.5 }), /minPoints/)
})
