const mongoose = require('mongoose');

/** One question and answer the website assistant may use. Admins edit these; no retraining needed. */
const knowledgeEntrySchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 1500 },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

knowledgeEntrySchema.index({ active: 1, sort: 1, createdAt: 1 });

module.exports = mongoose.model('KnowledgeEntry', knowledgeEntrySchema);
