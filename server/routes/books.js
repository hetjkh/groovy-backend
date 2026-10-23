const express = require('express')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const Book = require('../models/Book')
const Progress = require('../models/Progress')
const User = require('../models/User')
const Notice = require('../models/Notice')
const { requireAuth, optionalAuth } = require('../middleware/auth')

const router = require('../router')()
const uploadDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(path.join(uploadDir, 'audio'), { recursive: true })
fs.mkdirSync(path.join(uploadDir, 'covers'), { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, file, cb) => cb(null, file.fieldname === 'cover' ? path.join(uploadDir, 'covers') : path.join(uploadDir, 'audio')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '') || '.bin'}`),
})

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'cover') return cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname))
    cb(null, /audio\//.test(file.mimetype) || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.originalname || ''))
  },
})

function prunePresence(book) {
  const cutoff = Date.now() - 35000
  book.presence = book.presence.filter(item => new Date(item.at).getTime() > cutoff)
}

router.get('/public', optionalAuth, async (req, res) => {
  const query = String(req.query.q || '').trim()
  const genre = String(req.query.genre || '').trim()
  const filter = { visibility: 'public' }
  if (genre) filter.genre = genre
  if (query) {
    const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ title: rx }, { authorName: rx }, { narrator: rx }, { description: rx }, { series: rx }]
  }
  const books = await Book.find(filter).populate('owner', 'name avatar email bio followers following createdAt').sort({ plays: -1, createdAt: -1 }).limit(40)
  res.json({ books: books.map(book => book.toCard(req.user?._id)) })
})

router.get('/live', optionalAuth, async (_req, res) => {
  const books = await Book.find({ visibility: 'public' }).populate('owner', 'name avatar email bio followers following createdAt')
  const live = books.map(book => ({ ...book.toCard(), live: book.liveCount() })).filter(book => book.live > 0).sort((a, b) => b.live - a.live)
  res.json({ live, listeners: live.reduce((total, book) => total + book.live, 0) })
})

router.get('/narrators', optionalAuth, async (_req, res) => {
  const books = await Book.find({ visibility: 'public', narrator: { $ne: '' } })
  const map = new Map()
  books.forEach(book => {
    const key = book.narrator
    if (!map.has(key)) map.set(key, { name: key, books: [], plays: 0 })
    const entry = map.get(key)
    entry.books.push(book.toCard())
    entry.plays += book.plays
  })
  res.json({ narrators: [...map.values()].sort((a, b) => b.plays - a.plays) })
})

router.get('/series', optionalAuth, async (req, res) => {
  const name = String(req.query.name || '').trim()
  const filter = { visibility: 'public', series: { $ne: '' } }
  if (name) filter.series = name
  const books = await Book.find(filter).sort({ series: 1, seriesIndex: 1 })
  res.json({ books: books.map(book => book.toCard(req.user?._id)) })
})

router.get('/recommend', optionalAuth, async (req, res) => {
  const genre = req.user?.favoriteGenre
  const filter = { visibility: 'public' }
  if (genre) filter.genre = genre
  const books = await Book.find(filter).sort({ plays: -1 }).limit(12)
  res.json({ books: books.map(book => book.toCard(req.user?._id)) })
})

router.get('/authors', optionalAuth, async (req, res) => {
  const books = await Book.find({ visibility: 'public' }).populate('owner', 'name avatar bio role favoriteGenre isDemo')
  const map = new Map()
  books.forEach(book => {
    const owner = book.owner
    if (!owner) return
    const key = String(owner._id)
    if (!map.has(key)) {
      map.set(key, {
        id: owner._id,
        name: owner.name,
        image: owner.avatar || '',
        isDemo: Boolean(owner.isDemo),
        genre: book.genre,
        listeners: '0 books',
        books: [],
      })
    }
    map.get(key).books.push(book.toCard(req.user?._id))
  })
  map.forEach(entry => { entry.listeners = `${entry.books.length} book${entry.books.length === 1 ? '' : 's'}` })
  res.json({ authors: [...map.values()] })
})

router.get('/mine', requireAuth, async (req, res) => {
  const books = await Book.find({ owner: req.user._id }).populate('owner', 'name avatar email bio followers following createdAt').sort({ updatedAt: -1 })
  res.json({ books: books.map(book => book.toCard(req.user._id)) })
})

router.get('/charts', optionalAuth, async (req, res) => {
  const books = await Book.find({ visibility: 'public' }).sort({ plays: -1 }).limit(200)
  const cards = books.map(book => book.toCard(req.user?._id))
  if (req.query.sort === 'rating') cards.sort((a,b) => b.rating - a.rating || b.ratingCount - a.ratingCount)
  if (req.query.sort === 'newest') cards.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ books: cards.slice(0,40) })
})
router.get('/stations', optionalAuth, async (req, res) => {
  const filter = { visibility: 'public' }
  if (req.query.genre) filter.genre = String(req.query.genre)
  const books = await Book.find(filter).sort({ plays: -1 }).limit(30)
  res.json({ books: books.map(book => book.toCard(req.user?._id)) })
})
router.get('/:id', optionalAuth, async (req, res) => {
  const book = await Book.findById(req.params.id).populate('owner', 'name avatar email bio followers following createdAt').populate('comments.user', 'name avatar').populate('ratings.user', 'name avatar')
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const isOwner = req.user && String(book.owner._id) === String(req.user._id)
  if (book.visibility === 'private' && !isOwner) return res.status(403).json({ error: 'This book is private' })
  prunePresence(book)
  const progress = req.user ? await Progress.findOne({ user: req.user._id, book: book._id }) : null
  const related = book.series ? await Book.find({ visibility: 'public', series: book.series, _id: { $ne: book._id } }).sort({ seriesIndex: 1 }) : []
  res.json({ book: { ...book.toCard(req.user?._id), comments: book.comments, ratings: book.ratings, progress }, seriesBooks: related.map(item => item.toCard(req.user?._id)) })
})

router.post('/', requireAuth, upload.fields([{ name: 'audio', maxCount: 24 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files?.audio || []
    if (!files.length) return res.status(400).json({ error: 'Add at least one audio file' })
    const cover = req.files?.cover?.[0]
    const titles = [].concat(req.body.chapterTitles || req.body.chapterTitle || [])
    const book = await Book.create({
      owner: req.user._id,
      title: String(req.body.title || '').trim() || 'Untitled book',
      description: String(req.body.description || '').trim(),
      genre: String(req.body.genre || 'Fiction').trim(),
      narrator: String(req.body.narrator || req.user.name).trim(),
      authorName: String(req.body.authorName || req.user.name).trim(),
      spokenLanguage: String(req.body.language || 'English').trim(),
      series: String(req.body.series || '').trim(),
      year: String(req.body.year || '').trim(),
      seriesIndex: Number(req.body.seriesIndex) || 1,
      sampleChapter: Number(req.body.sampleChapter) || 1,
      visibility: req.body.visibility === 'public' ? 'public' : 'private',
      coverUrl: cover ? `/uploads/covers/${cover.filename}` : '',
      chapters: files.map((file, index) => ({
        title: String(titles[index] || '').trim() || file.originalname.replace(/\.[^.]+$/, '') || `Chapter ${index + 1}`,
        audioUrl: `/uploads/audio/${file.filename}`,
        duration: Number(req.body.duration) || 0,
        index: index + 1,
      })),
    })
    if (book.visibility === 'public') {
      const followers = await User.find({ following: req.user._id })
      await Notice.insertMany(followers.map(follower => ({
        user: follower._id,
        title: 'New book from someone you follow',
        text: `${req.user.name} published “${book.title}”.`,
        link: `/listen/${book._id}`,
      })))
    }
    res.status(201).json({ book: book.toCard(req.user._id) })
  } catch (error) {
    await require('../media').removeFiles(Object.values(req.files || {}).flat().map(file => '/uploads/' + (file.fieldname === 'cover' ? 'covers' : 'audio') + '/' + file.filename))
    res.status(400).json({ error: error.message || 'Could not upload book' })
  }
})

router.patch('/:id', requireAuth, async (req, res, next) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (String(book.owner) !== String(req.user._id)) return res.status(403).json({ error: 'Not your book' })
  next()
}, upload.fields([{ name: 'audio', maxCount: 24 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (String(book.owner) !== String(req.user._id)) return res.status(403).json({ error: 'Not your book' })
  ;['title', 'description', 'genre', 'narrator', 'authorName', 'series', 'year'].forEach(field => {
    if (req.body[field] != null) book[field] = String(req.body[field]).trim()
  })
  if (req.body.language != null) { book.spokenLanguage = String(req.body.language).trim(); book.language = undefined }
  const wasPrivate = book.visibility === 'private'
  if (req.body.visibility) book.visibility = req.body.visibility === 'public' ? 'public' : 'private'
  if (req.body.seriesIndex) book.seriesIndex = Number(req.body.seriesIndex) || 1
  if (req.body.sampleChapter) book.sampleChapter = Number(req.body.sampleChapter) || 1
  const oldMedia = [book.coverUrl, ...book.chapters.map(ch => ch.audioUrl)]
  if (req.body.chapters) {
    const chapters = JSON.parse(req.body.chapters)
    if (!Array.isArray(chapters) || !chapters.length) throw Object.assign(new Error('Keep at least one chapter'), { status: 400 })
    const existing = new Map(book.chapters.map(ch => [String(ch._id), ch]))
    if (new Set(chapters.map(ch => ch.id)).size !== chapters.length || chapters.some(ch => !existing.has(ch.id))) throw Object.assign(new Error('Invalid chapters'), { status: 400 })
    book.chapters = chapters.map((ch, i) => ({ ...existing.get(ch.id).toObject(), title: String(ch.title || '').trim() || 'Chapter ' + (i+1), index: i+1 }))
  }
  const cover = req.files?.cover?.[0]
  if (cover) book.coverUrl = `/uploads/covers/${cover.filename}`
  const files = req.files?.audio || []
  const titles = [].concat(req.body.chapterTitles || [])
  const replacementIds = [].concat(req.body.replacementIds || [])
  files.forEach((file, index) => {
    const replacement = book.chapters.find(ch => String(ch._id) === replacementIds[index])
    if (replacement) { replacement.audioUrl = `/uploads/audio/${file.filename}`; replacement.duration = 0; return }
    book.chapters.push({
      title: String(titles[index] || '').trim() || file.originalname.replace(/\.[^.]+$/, '') || `Chapter ${book.chapters.length + 1}`,
      audioUrl: `/uploads/audio/${file.filename}`,
      duration: 0,
      index: book.chapters.length + 1,
    })
  })
  if (Array.isArray(req.body.rename) || req.body.chapterNames) {
    const names = [].concat(req.body.chapterNames || [])
    names.forEach((name, index) => { if (book.chapters[index] && name) book.chapters[index].title = String(name) })
  }
  await book.save()
  await require('../media').removeFiles(oldMedia.filter(url => url && url !== book.coverUrl && !book.chapters.some(ch => ch.audioUrl === url)))
  if (wasPrivate && book.visibility === 'public') await require('../media').notifyPublication(book, req.user)
  res.json({ book: book.toCard(req.user._id) })
})

router.delete('/:id', requireAuth, async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (String(book.owner) !== String(req.user._id)) return res.status(403).json({ error: 'Not your book' })
  await require('../media').deleteBook(book)
  res.json({ ok: true })
})

router.post('/:id/play', optionalAuth, async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (!require('../access').canRead(book, req.user)) return res.status(403).json({ error: 'Private book' })
  const listenerKey = String(req.user?._id || req.body.guestId || req.ip)
  await Book.updateOne({ _id: book._id, listenerIds: { $ne: listenerKey } }, { $addToSet: { listenerIds: listenerKey }, $inc: { uniqueListeners: 1 } })
  await Book.updateOne({ _id: book._id }, { $inc: { plays: 1 } })
  const updated = await Book.findById(book._id)
  res.json({ plays: updated.plays, uniqueListeners: updated.uniqueListeners })
})

router.post('/:id/presence', optionalAuth, async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (!require('../access').canRead(book, req.user)) return res.status(403).json({ error: 'Private book' })
  prunePresence(book)
  const guestId = String(req.body.guestId || req.ip)
  const userId = req.user?._id
  const identity = userId ? { user: userId } : { guestId }
  await Book.updateOne({ _id: book._id }, { $pull: { presence: { $or: [{ at: { $lt: new Date(Date.now() - 35000) } }, identity] } } })
  await Book.updateOne({ _id: book._id }, { $push: { presence: { user: userId, guestId, at: new Date() } } })
  const updated = await Book.findById(book._id)
  const live = updated.liveCount()
  req.app.get('io')?.to(`book:${book._id}`).emit('live', { bookId: String(book._id), live })
  res.json({ live })
})

router.post('/:id/like', requireAuth, async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (!require('../access').canRead(book, req.user)) return res.status(403).json({ error: 'Private book' })
  const liked = book.likedBy.some(id => String(id) === String(req.user._id))
  book.likedBy = liked ? book.likedBy.filter(id => String(id) !== String(req.user._id)) : [...book.likedBy, req.user._id]
  await book.save()
  res.json({ liked: !liked, likes: book.likedBy.length })
})

router.post('/:id/rate', requireAuth, async (req, res) => {
  const book = await Book.findById(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (!require('../access').canRead(book, req.user)) return res.status(403).json({ error: 'Private book' })
  const stars = Math.min(5, Math.max(1, Number(req.body.stars) || 5))
  const text = String(req.body.text || '').trim()
  const existing = book.ratings.find(item => String(item.user) === String(req.user._id))
  if (existing) { existing.stars = stars; existing.text = text }
  else book.ratings.push({ user: req.user._id, stars, text })
  await book.save()
  await book.populate('ratings.user', 'name avatar')
  res.json({ ratings: book.ratings, rating: book.toCard().rating })
})

router.post('/:id/comments', requireAuth, async (req, res) => {
  const book = await Book.findById(req.params.id).populate('comments.user', 'name avatar')
  if (!book) return res.status(404).json({ error: 'Book not found' })
  if (!require('../access').canRead(book, req.user)) return res.status(403).json({ error: 'Private book' })
  const text = String(req.body.text || '').trim()
  if (!text) return res.status(400).json({ error: 'Write a comment' })
  book.comments.push({ user: req.user._id, text })
  await book.save()
  await book.populate('comments.user', 'name avatar')
  res.status(201).json({ comments: book.comments })
})

module.exports = router
