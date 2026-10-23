const Book = require('./models/Book')
function canRead(book, user) {
  return Boolean(book && (book.visibility === 'public' || (user && String(book.owner?._id || book.owner) === String(user._id))))
}
function readable(user) { return user ? { $or: [{ visibility: 'public' }, { owner: user._id }] } : { visibility: 'public' } }
async function accessibleBook(id, user) {
  const book = await Book.findById(id)
  if (!book) throw Object.assign(new Error('Book not found'), { status: 404 })
  if (!canRead(book, user)) throw Object.assign(new Error('This book is private'), { status: 403 })
  return book
}
module.exports = { canRead, readable, accessibleBook }
