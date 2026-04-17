const mongoose = require('mongoose');

const connectDB = async () => {
  // Reuse existing connection in serverless warm instances
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    // ✅ FIXED: Throw instead of process.exit() — never call exit() in serverless
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = connectDB;
