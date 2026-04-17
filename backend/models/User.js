
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  usedStorage: { type: Number, default: 0 }, // bytes
  storageLimit: { type: Number, default: 15 * 1024 * 1024 * 1024 }, // 15GB
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
EOF
