const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const User = require('../models/User')
const { signUser, setAuthCookie, requireAuth, optionalAuth } = require('../middleware/auth')

const { hashToken, sendAccountEmail } = require('../mail')
const { clientOrigin } = require('../clientOrigins').getClientConfig()
const router = require('../router')()
const googleReady = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

if (googleReady) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: (process.env.API_ORIGIN || 'http://localhost:4000') + '/auth/google/callback',
  }, async (_access, _refresh, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value
      if (!email) return done(null, false)
      let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] })
      if (!user) {
        user = await User.create({
          name: profile.displayName || email.split('@')[0],
          email,
          googleId: profile.id,
          avatar: profile.photos?.[0]?.value || '',
        })
      } else if (!user.googleId) {
        user.googleId = profile.id
        if (!user.avatar) user.avatar = profile.photos?.[0]?.value || ''
        await user.save()
      }
      done(null, user)
    } catch (error) {
      done(error)
    }
  }))
}

router.get('/config', (_req, res) => res.json({ google: googleReady }))

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    if (name.length < 2) return res.status(400).json({ error: 'Name is too short' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (await User.findOne({ email })) return res.status(409).json({ error: 'An account with this email already exists' })
    const verifyToken = crypto.randomBytes(20).toString('hex')
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), verifyToken: hashToken(verifyToken), verifyExpires: new Date(Date.now() + 3600000) })
    const token = signUser(user)
    setAuthCookie(res, token)
    const emailSent = await sendAccountEmail(email, 'verify', verifyToken).catch(() => false)
    res.status(201).json({ user: user.public(true), token, emailSent })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not create account' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    const user = await User.findOne({ email })
    if (!user?.passwordHash) return res.status(401).json({ error: 'Invalid email or password' })
    if (!await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password' })
    const token = signUser(user)
    setAuthCookie(res, token)
    res.json({ user: user.public(true), token })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not sign in' })
  }
})

router.post('/logout', optionalAuth, async (req, res) => {
  if (req.user) await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } })
  res.clearCookie('groovy_token', { path: '/' })
  res.json({ ok: true })
})

router.get('/me', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ user: null })
  res.json({ user: req.user.public(true) })
})

router.post('/forgot', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const user = await User.findOne({ email })
  if (!user) return res.json({ ok: true })
  const raw = crypto.randomBytes(32).toString('hex')
  user.resetToken = hashToken(raw)
  user.resetExpires = new Date(Date.now() + 1000 * 60 * 60)
  await user.save()
  await sendAccountEmail(email, 'reset', raw).catch(() => false)
  res.json({ ok: true })
})

router.post('/reset', async (req, res) => {
  const user = await User.findOne({ resetToken: hashToken(req.body.token || ''), resetExpires: { $gt: new Date() } })
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or expired' })
  const password = String(req.body.password || '')
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  user.passwordHash = await bcrypt.hash(password, 10)
  user.tokenVersion = (user.tokenVersion || 0) + 1
  user.resetToken = undefined
  user.resetExpires = undefined
  await user.save()
  res.json({ ok: true })
})

router.post('/verify', async (req, res) => {
  const user = await User.findOne({ verifyToken: hashToken(req.body.token || ''), verifyExpires: { $gt: new Date() } })
  if (!user) return res.status(400).json({ error: 'This verification link is invalid' })
  user.emailVerified = true
  user.verifyToken = undefined
  await user.save()
  res.json({ ok: true, user: user.public(true) })
})

router.post('/verify/send', requireAuth, async (req, res) => {
  const raw = crypto.randomBytes(32).toString('hex')
  req.user.verifyToken = hashToken(raw)
  req.user.verifyExpires = new Date(Date.now() + 3600000)
  await req.user.save()
  const sent = await sendAccountEmail(req.user.email, 'verify', raw)
  if (!sent) return res.status(503).json({ error: 'Email delivery is not configured yet' })
  res.json({ ok: true })
})

if (googleReady) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }))
  router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${clientOrigin}/login?error=google` }), (req, res) => {
    const token = signUser(req.user)
    setAuthCookie(res, token)
    res.redirect(`${clientOrigin}/dashboard`)
  })
}

module.exports = router
