const express = require('express')
const User = require('../models/User')
const Book = require('../models/Book')
const { optionalAuth } = require('../middleware/auth')

const router = require('../router')()

router.get('/:id', optionalAuth, async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json({ error: 'Profile not found' })
  const isSelf = req.user && String(req.user._id) === String(user._id)
  const books = await Book.find({ owner: user._id, visibility: 'public' }).sort({ plays: -1 })
  const following = Boolean(req.user?.following.some(id => String(id) === String(user._id)))
  res.json({
    user: user.public(isSelf),
    following,
    books: books.map(book => book.toCard(req.user?._id)),
    stats: {
      publicBooks: books.length,
      plays: books.reduce((total, book) => total + book.plays, 0),
      followers: user.followers.length,
    },
  })
})

module.exports = router
