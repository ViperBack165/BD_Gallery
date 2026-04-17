require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Connect to DB (non-blocking for serverless)
connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/media', require('./routes/media'));

app.get('/', (req, res) => res.send('BD Gallery API running'));

// ✅ FIXED: Export app instead of calling app.listen()
// Vercel runs serverless functions — no persistent server needed
module.exports = app;
