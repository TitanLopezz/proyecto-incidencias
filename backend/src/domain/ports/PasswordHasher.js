class PasswordHasher {
  async hash() {
    throw new Error('PasswordHasher.hash debe ser implementado.')
  }

  async compare() {
    throw new Error('PasswordHasher.compare debe ser implementado.')
  }
}

module.exports = PasswordHasher
