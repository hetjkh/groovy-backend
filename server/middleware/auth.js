const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const configured = process.env.JWT_SECRET
if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32 || configured === 'change-me')) throw new Error('Set a random JWT_SECRET of at least 32 characters')
const secret = configured && configured !== 'change-me' ? configured : crypto.randomBytes(48).toString('hex')
const User = require('../models/User')

function readToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.groovy_token || ''
}

function signUser(user) {
  return jwt.sign({ id: user._id, version: user.tokenVersion || 0 }, secret, { expiresIn: '14d' })
}

function setAuthCookie(res, token) {
  res.cookie('groovy_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

async function optionalAuth(req, _res, next) {
  try {
    const token = readToken(req)
    if (!token) return next()
    const payload = jwt.verify(token, secret)
    req.user = await User.findById(payload.id)
    if (req.user && (req.user.tokenVersion || 0) !== (payload.version || 0)) req.user = null
  } catch { /* guests can still browse public books */ }
  next()
}

async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in' })
    next()
  })
}

module.exports = { signUser, setAuthCookie, optionalAuth, requireAuth }
