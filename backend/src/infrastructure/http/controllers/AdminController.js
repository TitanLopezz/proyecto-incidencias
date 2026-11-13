function createAdminController({ createAdmin, listAdmins }) {
  return {
    async create(request, response) {
      const admin = await createAdmin.execute(request.body, request.auth.userId)
      response.status(201).json({ data: admin })
    },

    async list(_request, response) {
      const admins = await listAdmins.execute()
      response.status(200).json({ data: admins })
    },
  }
}

module.exports = createAdminController
