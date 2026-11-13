function authorizeRoles(...allowedRoles) {
  return (request, response, next) => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      return response.status(403).json({
        error: { message: 'No tienes permisos para realizar esta acción.' },
      })
    }

    return next()
  }
}

authorizeRoles.CITIZEN = 'citizen'
authorizeRoles.ADMIN = 'admin'
authorizeRoles.SUPERADMIN = 'superadmin'

module.exports = authorizeRoles
