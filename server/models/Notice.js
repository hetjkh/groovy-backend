const mongoose = require('mongoose')

const noticeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: String,
  text: String,
  link: String,
  read: { type: Boolean, default: false },
}, { timestamps: true })

module.exports = mongoose.models.Notice || mongoose.model('Notice', noticeSchema)
