const mongoose = require('mongoose');

/** A visitor question the assistant could not answer. Admin answers it once and it becomes a KnowledgeEntry. */
const assistantGapSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // lower-cased, trimmed question; groups repeats
    question: { type: String, required: true, maxlength: 300 },
    count: { type: Number, default: 1 },
    status: { type: String, enum: ['open', 'answered', 'ignored'], default: 'open' },
    lastAskedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

assistantGapSchema.index({ status: 1, count: -1 });

module.exports = mongoose.model('AssistantGap', assistantGapSchema);
