class IncidentRepository {
  async create() {
    throw new Error('IncidentRepository.create debe ser implementado.')
  }

  async findAll() {
    throw new Error('IncidentRepository.findAll debe ser implementado.')
  }

  async getHeatmapData() {
    throw new Error('IncidentRepository.getHeatmapData debe ser implementado.')
  }

  // Both mutation methods return the committed incident and any persisted web notice.
  async update() {
    throw new Error('IncidentRepository.update debe ser implementado.')
  }

  async updateStatus() {
    throw new Error('IncidentRepository.updateStatus debe ser implementado.')
  }

  async archive() {
    throw new Error('IncidentRepository.archive debe ser implementado.')
  }
}

module.exports = IncidentRepository
