const express = require('express')
const mongoose = require('mongoose')
module.exports = function router() {
  const result = express.Router()
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    const register = result[method].bind(result)
    result[method] = (path, ...handlers) => register(path, ...handlers.map(handler => (req, res, next) => {
      try { Promise.resolve(handler(req, res, next)).catch(next) } catch (error) { next(error) }
    }))
  }
  for (const param of ['id', 'bookId']) result.param(param, (req, res, next, value) => {
    if (!mongoose.isObjectIdOrHexString(value)) return res.status(400).json({ error: 'Invalid identifier' })
    next()
  })
  return result
}
