const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const mongoose = require('mongoose');

const env = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1); // Render/Railway sit behind a proxy; needed for correct client IPs (rate limiting)
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/server-to-server calls (no Origin header) and the configured frontends
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Paystack signs the RAW request body, so this path must be parsed as a Buffer BEFORE express.json().
app.use('/payments/webhook/paystack', express.raw({ type: '*/*', limit: '1mb' }));
app.use('/payments/webhook/payaza', express.raw({ type: '*/*', limit: '1mb' }));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . keys from user input (NoSQL injection)
app.use(compression());

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down', uptime: process.uptime() });
});

app.use(apiLimiter);
app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
