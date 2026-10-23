const express = require('express')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const Book = require('../models/Book')
const Progress = require('../models/Progress')
const LibraryItem = require('../models/LibraryItem')
const { canRead, accessibleBook } = require('../access')
const ListeningDay = require('../models/ListeningDay')
const Bookmark = require('../models/Bookmark')
const User = require('../models/User')
const { requireAuth } = require('../middleware/auth')

const router = require('../router')()
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars')
fs.mkdirSync(avatarDir, { recursive: true })
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '') || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname)),
})
const profileFields = ['name', 'bio', 'location', 'website', 'role', 'favoriteGenre', 'languages', 'pronouns']

router.patch('/profile', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    profileFields.forEach(field => {
      if (req.body[field] != null) req.user[field] = String(req.body[field]).trim()
    })
    if (req.user.name.length < 2) return res.status(400).json({ error: 'Name is too short' })
    if (req.file) req.user.avatar = `/uploads/avatars/${req.file.filename}`
    await req.user.save()
    res.json({ user: req.user.public(true) })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save profile' })
  }
})

router.get('/dashboard', requireAuth, async (req, res) => {
  const books = await Book.find({ owner: req.user._id }).sort({ updatedAt: -1 })
  const live = books.reduce((total, book) => total + book.liveCount(), 0)
  const progress = await Progress.find({ user: req.user._id }).populate('book').sort({ updatedAt: -1 }).limit(8)
  res.json({
    user: req.user.public(true),
    stats: {
      books: books.length,
      publicBooks: books.filter(book => book.visibility === 'public').length,
      plays: books.reduce((total, book) => total + book.plays, 0),
      likes: books.reduce((total, book) => total + book.likedBy.length, 0),
      uniqueListeners: books.reduce((total, book) => total + book.uniqueListeners, 0),
      live,
      followers: req.user.followers.length,
    },
    books: books.map(book => book.toCard(req.user._id)),
    continueListening: progress.filter(item => canRead(item.book, req.user)).map(item => ({
      book: item.book.toCard?.(req.user._id) || item.book,
      chapterId: item.chapterId,
      seconds: item.seconds,
    })),
  })
})

router.patch('/settings', requireAuth, async (req, res) => {
  for (const [key, max] of [['sleepMinutes', 120], ['weeklyGoal', 10080], ['monthlyGoal', 100]]) if (req.body[key] != null) req.user[key] = Math.min(max, Math.max(0, Number(req.body[key]) || 0))
  if (req.body.playbackRate != null) req.user.playbackRate = Math.min(2, Math.max(0.5, Number(req.body.playbackRate) || 1))
  await req.user.save()
  res.json({ user: req.user.public(true) })
})

router.post('/progress', requireAuth, async (req, res) => {
  const { bookId, chapterId, seconds, duration, finished } = req.body
  const book = await accessibleBook(bookId, req.user)
  if (!book.chapters.some(ch => String(ch._id) === String(chapterId))) return res.status(400).json({ error: 'Chapter not found' })
  const done = Boolean(finished)
  const old = await Progress.findOne({ user: req.user._id, book: bookId })
  const elapsed = old ? Math.min(60, Math.max(0, (Date.now() - new Date(old.updatedAt).getTime()) / 1000)) : 0
  const listened = Math.min(elapsed, Math.max(0, Number(req.body.listenedSeconds) || 0))
  if (listened) await ListeningDay.findOneAndUpdate({ user: req.user._id, day: require('../listeningDate')(req.body.timeZone) }, { $inc: { seconds: listened } }, { upsert: true })
  const doc = await Progress.findOneAndUpdate(
    { user: req.user._id, book: bookId },
    { chapterId, seconds: Math.max(0, Math.min(604800, Number(seconds) || 0)), duration: Math.max(0, Math.min(604800, Number(duration) || 0)), finished: done, updatedAt: new Date() },
    { upsert: true, new: true },
  )
  await LibraryItem.findOneAndUpdate(
    { user: req.user._id, book: bookId },
    { status: done ? 'finished' : 'in_progress' },
    { upsert: true, new: true },
  )
  res.json({ progress: doc })
})

router.post('/follow/:id', requireAuth, async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ error: 'You cannot follow yourself' })
  const target = await User.findById(req.params.id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  const following = req.user.following.some(id => String(id) === String(target._id))
  if (following) {
    req.user.following = req.user.following.filter(id => String(id) !== String(target._id))
    target.followers = target.followers.filter(id => String(id) !== String(req.user._id))
  } else {
    req.user.following.push(target._id)
    target.followers.push(req.user._id)
  }
  await req.user.save()
  await target.save()
  res.json({ following: !following, followers: target.followers.length })
})


router.get('/listening-dashboard', requireAuth, async (req, res) => {
  const progress = (await Progress.find({ user: req.user._id }).populate('book').sort({ updatedAt: -1 })).filter(item => canRead(item.book, req.user))
  const library = (await LibraryItem.find({ user: req.user._id }).populate('book')).filter(item => canRead(item.book, req.user))
  const bookmarks = (await Bookmark.find({ user: req.user._id }).populate('book').sort({ createdAt: -1 }).limit(30)).filter(item => canRead(item.book, req.user))
  const today = require('../listeningDate')(req.query.timeZone)
  const weekStart = new Date(today + 'T00:00:00Z'); weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7)
  const days = await ListeningDay.find({ user: req.user._id, day: { $gte: weekStart.toISOString().slice(0, 10) } })
  const finished = library.filter(item => item.status === 'finished')
  const genres = [...new Set([req.user.favoriteGenre, ...finished.map(item => item.book.genre)])]
  const recommendations = await Book.find({ visibility: 'public', genre: { $in: genres }, _id: { $nin: library.map(item => item.book._id) } }).sort({ plays: -1 }).limit(8)
  const updates = await Book.find({ visibility: 'public', owner: { $in: req.user.following } }).sort({ createdAt: -1 }).limit(8)
  const entry = item => ({ book: item.book.toCard(req.user._id), chapterId: item.chapterId, seconds: item.seconds, duration: item.duration, finished: item.finished, updatedAt: item.updatedAt })
  res.json({
    summary: { todayMinutes: days.filter(day => day.day === today).reduce((n, day) => n + day.seconds, 0) / 60, weekMinutes: days.reduce((n, day) => n + day.seconds, 0) / 60, started: progress.length, completed: finished.length, monthlyCompleted: finished.filter(item => require('../listeningDate')(req.query.timeZone, new Date(item.updatedAt)).slice(0,7) === today.slice(0,7)).length },
    counts: Object.fromEntries(['in_progress', 'finished', 'saved', 'wishlist'].map(status => [status, library.filter(item => item.status === status).length])),
    continueListening: progress.filter(item => !item.finished).slice(0,6).map(entry),
    history: progress.slice(0,20).map(entry), bookmarks: bookmarks.slice(0,8).map(item => ({ ...item.toObject(), book: item.book.toCard(req.user._id) })),
    recommendations: recommendations.map(book => book.toCard(req.user._id)), updates: updates.map(book => book.toCard(req.user._id)), user: req.user.public(true),
  })
})
router.get('/player-state', requireAuth, async (req, res) => {
  const state = req.user.clientState || {}
  const ids = [...(state.liked || []), ...(state.history || []), ...(state.playlists || []).flatMap(item => item.trackIds || [])].filter(id => /^[a-f0-9]{24}$/i.test(id))
  const books = await Book.find({ ...require('../access').readable(req.user), 'chapters._id': { $in: ids } })
  res.json({ state, books: books.map(book => book.toCard(req.user._id)) })
})
router.put('/player-state', requireAuth, async (req, res) => {
  const input = req.body
  const ids = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)))].slice(0,500) : []
  const state = { liked: ids(input.liked), history: ids(input.history), playlists: Array.isArray(input.playlists) ? input.playlists.slice(0,100).map(item => ({ id: String(item.id || '').slice(0,80), name: String(item.name || '').slice(0,80), trackIds: ids(item.trackIds) })) : [] }
  await User.updateOne({ _id: req.user._id }, { $set: { clientState: state } })
  res.json({ ok: true })
})
module.exports = router
