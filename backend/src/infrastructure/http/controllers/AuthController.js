function createAuthController({ registerUser, loginUser, staffLogin, getCurrentUser }) {
  return {
    async register(request, response) {
      const result = await registerUser.execute(request.body)
      response.status(201).json({ data: result })
    },

    async login(request, response) {
      const result = await loginUser.execute(request.body)
      response.status(200).json({ data: result })
    },

    async staffLogin(request, response) {
      const result = await staffLogin.execute(request.body)
      response.status(200).json({ data: result })
    },

    async currentUser(request, response) {
      const user = await getCurrentUser.execute(request.auth.userId)
      response.status(200).json({ data: user })
    },
  }
}

module.exports = createAuthController
