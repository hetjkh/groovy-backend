const express = require('express')
const Bookmark = require('../models/Bookmark')
const LibraryItem = require('../models/LibraryItem')
const BookStack = require('../models/BookStack')
const Notice = require('../models/Notice')
const Book = require('../models/Book')
const { canRead, readable, accessibleBook } = require('../access')
const Progress = require('../models/Progress')
const { requireAuth } = require('../middleware/auth')

const router = require('../router')()

function card(item, userId) {
  return item?.toCard ? item.toCard(userId) : item
}

router.get('/library', requireAuth, async (req, res) => {
  const status = req.query.status
  const filter = { user: req.user._id }
  if (status) filter.status = status
  const items = await LibraryItem.find(filter).populate('book').sort({ updatedAt: -1 })
  const progress = await Progress.find({ user: req.user._id })
  const progressByBook = Object.fromEntries(progress.map(item => [String(item.book), item]))
  res.json({
    items: items.filter(item => canRead(item.book, req.user)).map(item => ({
      id: item._id,
      status: item.status,
      book: card(item.book, req.user._id),
      progress: progressByBook[String(item.book._id)] || null,
    })),
  })
})

router.post('/library', requireAuth, async (req, res) => {
  const book = await accessibleBook(req.body.bookId, req.user)
  const status = ['saved', 'wishlist', 'in_progress', 'finished'].includes(req.body.status) ? req.body.status : 'saved'
  const item = await LibraryItem.findOneAndUpdate(
    { user: req.user._id, book: book._id },
    { status },
    { upsert: true, new: true },
  )
  res.json({ item })
})

router.delete('/library/:bookId', requireAuth, async (req, res) => {
  await LibraryItem.deleteOne({ user: req.user._id, book: req.params.bookId })
  res.json({ ok: true })
})

router.get('/bookmarks', requireAuth, async (req, res) => {
  const filter = { user: req.user._id }
  if (req.query.bookId) filter.book = req.query.bookId
  const allowed = await Book.find(require('../access').readable(req.user)).select('_id')
  filter.book = { $in: allowed.filter(book => !req.query.bookId || String(book._id) === String(req.query.bookId)).map(book => book._id) }
  const bookmarks = await Bookmark.find(filter).sort({ createdAt: -1 }).limit(100)
  res.json({ bookmarks })
})

router.post('/bookmarks', requireAuth, async (req, res) => {
  const book = await accessibleBook(req.body.bookId, req.user)
  if (!book.chapters.some(ch => String(ch._id) === String(req.body.chapterId))) return res.status(400).json({ error: 'Chapter not found' })
  const bookmark = await Bookmark.create({
    user: req.user._id,
    book: req.body.bookId,
    chapterId: req.body.chapterId,
    chapterTitle: req.body.chapterTitle || '',
    seconds: Number(req.body.seconds) || 0,
    note: String(req.body.note || '').slice(0, 280),
  })
  res.status(201).json({ bookmark })
})

router.delete('/bookmarks/:id', requireAuth, async (req, res) => {
  await Bookmark.deleteOne({ _id: req.params.id, user: req.user._id })
  res.json({ ok: true })
})

router.patch('/bookmarks/:id', requireAuth, async (req, res) => {
  const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id })
  if (!bookmark) return res.status(404).json({ error: 'Bookmark not found' })
  await accessibleBook(bookmark.book, req.user)
  bookmark.note = String(req.body.note || '').trim().slice(0, 280)
  await bookmark.save()
  res.json({ bookmark })
})

router.get('/stacks', requireAuth, async (req, res) => {
  const stacks = await BookStack.find({ user: req.user._id }).sort({ updatedAt: -1 })
  const books = await Book.find({ ...readable(req.user), _id: { $in: stacks.flatMap(stack => stack.bookIds) } })
  const byId = Object.fromEntries(books.map(book => [String(book._id), book.toCard(req.user._id)]))
  res.json({
    stacks: stacks.map(stack => ({
      id: stack._id,
      name: stack.name,
      books: stack.bookIds.map(id => byId[String(id)]).filter(Boolean),
    })),
  })
})

router.post('/stacks', requireAuth, async (req, res) => {
  const stack = await BookStack.create({ user: req.user._id, name: String(req.body.name || 'Night stack').trim() || 'Night stack', bookIds: [] })
  res.status(201).json({ stack })
})

router.post('/stacks/:id/books', requireAuth, async (req, res) => {
  const stack = await BookStack.findOne({ _id: req.params.id, user: req.user._id })
  if (!stack) return res.status(404).json({ error: 'Stack not found' })
  if (req.body.bookId) await accessibleBook(req.body.bookId, req.user)
  if (req.body.bookId && !stack.bookIds.some(id => String(id) === String(req.body.bookId))) stack.bookIds.push(req.body.bookId)
  if (req.body.name) stack.name = String(req.body.name).trim()
  await stack.save()
  res.json({ stack })
})

router.delete('/stacks/:id', requireAuth, async (req, res) => {
  await BookStack.deleteOne({ _id: req.params.id, user: req.user._id })
  res.json({ ok: true })
})

router.get('/notices', requireAuth, async (req, res) => {
  const notices = await Notice.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(40)
  res.json({ notices, unread: notices.filter(item => !item.read).length })
})

router.post('/notices/read', requireAuth, async (req, res) => {
  await Notice.updateMany({ user: req.user._id, read: false }, { read: true })
  res.json({ ok: true })
})

router.patch('/stacks/:id', requireAuth, async (req, res) => {
  const stack = await BookStack.findOne({ _id: req.params.id, user: req.user._id })
  if (!stack) return res.status(404).json({ error: 'Stack not found' })
  if (req.body.name != null) stack.name = String(req.body.name).trim()
  if (req.body.bookIds) {
    if (!Array.isArray(req.body.bookIds) || req.body.bookIds.length > 200) return res.status(400).json({ error: 'Invalid book order' })
    for (const id of req.body.bookIds) await accessibleBook(id, req.user)
    stack.bookIds = [...new Set(req.body.bookIds)]
  }
  await stack.save()
  res.json({ stack })
})
module.exports = router
