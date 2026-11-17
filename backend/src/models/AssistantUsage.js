const mongoose = require('mongoose');

/** One row per day. Used for the daily spending cap and for the admin usage numbers. */
const assistantUsageSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD (UTC)
    messages: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    unanswered: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AssistantUsage', assistantUsageSchema);
