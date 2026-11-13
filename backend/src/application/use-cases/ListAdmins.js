class ListAdmins {
  constructor(userRepository) {
    this.userRepository = userRepository
  }

  execute() {
    return this.userRepository.findAdministrators()
  }
}

module.exports = ListAdmins
