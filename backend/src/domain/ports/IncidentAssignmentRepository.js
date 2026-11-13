class IncidentAssignmentRepository {
  async listOperational() {
    throw new Error('IncidentAssignmentRepository.listOperational debe ser implementado.')
  }

  async findReception() {
    throw new Error('IncidentAssignmentRepository.findReception debe ser implementado.')
  }

  async assign() {
    throw new Error('IncidentAssignmentRepository.assign debe ser implementado.')
  }

  async history() {
    throw new Error('IncidentAssignmentRepository.history debe ser implementado.')
  }
}

module.exports = IncidentAssignmentRepository
