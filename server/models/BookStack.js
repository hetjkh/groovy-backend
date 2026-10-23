const mongoose = require('mongoose')

const stackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  bookIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
}, { timestamps: true })

module.exports = mongoose.models.BookStack || mongoose.model('BookStack', stackSchema)
