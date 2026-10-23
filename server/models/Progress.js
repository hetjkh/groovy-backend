const mongoose = require('mongoose')

const progressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  chapterId: String,
  seconds: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  finished: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
})

progressSchema.index({ user: 1, book: 1 }, { unique: true })

module.exports = mongoose.models.Progress || mongoose.model('Progress', progressSchema)
