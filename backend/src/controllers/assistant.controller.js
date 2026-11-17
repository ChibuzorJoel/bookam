const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { KnowledgeEntry, AssistantGap, AssistantUsage } = require('../models');
const assistant = require('../services/assistant.service');
const env = require('../config/env');

// POST /public/assistant  (no login; rate limited; daily message cap)
exports.chat = asyncHandler(async (req, res) => {
  const out = await assistant.chat(req.body.messages);
  res.json({ status: 'success', data: { reply: out.reply, links: out.links.map(({ label, path, query, fragment }) => ({ label, path, query, fragment })), available: out.available } });
});

// ---------- admin ----------
exports.listKnowledge = asyncHandler(async (req, res) => {
  await assistant.ensureSeeded();
  const entries = await KnowledgeEntry.find().sort({ sort: 1, createdAt: 1 }).lean();
  res.json({ status: 'success', data: { entries } });
});

exports.createKnowledge = asyncHandler(async (req, res) => {
  const last = await KnowledgeEntry.findOne().sort({ sort: -1 }).select('sort').lean();
  const entry = await KnowledgeEntry.create({ ...req.body, sort: (last?.sort ?? 0) + 1 });
  res.status(201).json({ status: 'success', data: { entry } });
});

exports.updateKnowledge = asyncHandler(async (req, res) => {
  const entry = await KnowledgeEntry.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!entry) throw new AppError('Entry not found', 404, 'NOT_FOUND');
  res.json({ status: 'success', data: { entry } });
});

exports.deleteKnowledge = asyncHandler(async (req, res) => {
  const entry = await KnowledgeEntry.findByIdAndDelete(req.params.id);
  if (!entry) throw new AppError('Entry not found', 404, 'NOT_FOUND');
  res.json({ status: 'success', data: {} });
});

exports.listGaps = asyncHandler(async (req, res) => {
  const gaps = await AssistantGap.find({ status: 'open' }).sort({ count: -1, lastAskedAt: -1 }).limit(100).lean();
  res.json({ status: 'success', data: { gaps } });
});

// PATCH /admin/assistant/gaps/:id  { action: 'answer', answer } turns it into knowledge; { action: 'ignore' } hides it
exports.resolveGap = asyncHandler(async (req, res) => {
  const gap = await AssistantGap.findById(req.params.id);
  if (!gap) throw new AppError('Question not found', 404, 'NOT_FOUND');
  if (req.body.action === 'ignore') {
    gap.status = 'ignored';
    gap.count = 0;
    await gap.save();
    return res.json({ status: 'success', data: {} });
  }
  const last = await KnowledgeEntry.findOne().sort({ sort: -1 }).select('sort').lean();
  const entry = await KnowledgeEntry.create({ question: req.body.question || gap.question, answer: req.body.answer, sort: (last?.sort ?? 0) + 1 });
  gap.status = 'answered';
  await gap.save();
  res.status(201).json({ status: 'success', data: { entry } });
});

exports.usage = asyncHandler(async (req, res) => {
  const rows = await AssistantUsage.find().sort({ day: -1 }).limit(14).lean();
  res.json({
    status: 'success',
    data: {
      configured: Boolean(env.ANTHROPIC_API_KEY) && env.ASSISTANT_ENABLED,
      dailyCap: env.ASSISTANT_DAILY_MESSAGE_CAP,
      model: env.ASSISTANT_MODEL,
      days: rows,
    },
  });
});
