const fs = require('fs/promises')
const path = require('path')
async function removeFiles(urls) {
  const root = path.resolve(__dirname, 'uploads')
  for (const url of urls) {
    if (!url?.startsWith('/uploads/')) continue
    const target = path.resolve(__dirname, url.slice(1))
    if (!target.startsWith(root + path.sep)) continue
    await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
async function notifyPublication(book, user) {
  const followers = await require('./models/User').find({ following: user._id }).select('_id')
  if (followers.length) await require('./models/Notice').insertMany(followers.map(follower => ({ user: follower._id, title: 'New audiobook', text: `${user.name} published ${book.title}`, link: `/listen/${book._id}` })))
}
async function deleteBook(book) {
  await book.deleteOne()
  for (const name of ['Progress', 'Bookmark', 'LibraryItem']) await require('./models/' + name).deleteMany({ book: book._id })
  await require('./models/BookStack').updateMany({ bookIds: book._id }, { $pull: { bookIds: book._id } })
  await removeFiles([book.coverUrl, ...book.chapters.map(ch => ch.audioUrl)])
}
module.exports = { removeFiles, deleteBook, notifyPublication }
