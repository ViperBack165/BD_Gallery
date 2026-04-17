const mediaSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  url: { type: String, required: true },
  thumbnailUrl: { type: String },
  publicId: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], required: true },
  size: { type: Number, required: true }, // bytes
  mimeType: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Media', mediaSchema);
EOF