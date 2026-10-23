const mongoose = require('mongoose')

const librarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  status: { type: String, enum: ['saved', 'wishlist', 'in_progress', 'finished'], default: 'saved' },
}, { timestamps: true })

librarySchema.index({ user: 1, book: 1 }, { unique: true })

module.exports = mongoose.models.LibraryItem || mongoose.model('LibraryItem', librarySchema)
