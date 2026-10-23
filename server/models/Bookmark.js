const mongoose = require('mongoose')

const bookmarkSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  chapterId: String,
  chapterTitle: String,
  seconds: { type: Number, default: 0 },
  note: { type: String, default: '', maxlength: 280 },
}, { timestamps: true })

module.exports = mongoose.models.Bookmark || mongoose.model('Bookmark', bookmarkSchema)
