const ValidationError = require('../errors/ValidationError')

class Category {
  constructor(name) {
    this.name = name
  }

  static create(name) {
    if (!Category.VALUES.includes(name)) {
      throw new ValidationError('La categoría de la incidencia no es válida.')
    }

    return new Category(name)
  }
}

Category.VALUES = Object.freeze(['bache', 'alumbrado', 'basura'])

module.exports = Category
