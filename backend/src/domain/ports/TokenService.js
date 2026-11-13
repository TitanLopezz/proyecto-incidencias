class TokenService {
  issue() {
    throw new Error('TokenService.issue debe ser implementado.')
  }

  verify() {
    throw new Error('TokenService.verify debe ser implementado.')
  }
}

module.exports = TokenService
