const cloudinary = require('../config/cloudinary');
const Media = require('../models/Media');
const User = require('../models/User');

const IMAGE_LIMIT = 10 * 1024 * 1024;  // 10MB
const VIDEO_LIMIT = 100 * 1024 * 1024; // 100MB

exports.upload = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file' });

    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');

    if (isImage && file.size > IMAGE_LIMIT) return res.status(400).json({ message: 'Image max 10MB' });
    if (isVideo && file.size > VIDEO_LIMIT) return res.status(400).json({ message: 'Video max 100MB' });

    const user = await User.findById(req.user.id);
    if (user.usedStorage + file.size > user.storageLimit)
      return res.status(400).json({ message: 'Storage limit reached (15GB)' });

    // upload to cloudinary
    const resourceType = isVideo ? 'video' : 'image';
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder: `bd-gallery/${req.user.id}` },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(file.buffer);
    });

    // video thumbnail via cloudinary
    let thumbnailUrl = null;
    if (isVideo) {
      thumbnailUrl = cloudinary.url(uploadResult.public_id, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [{ start_offset: '0' }]
      });
    }

    const media = await Media.create({
      user: req.user.id,
      filename: file.originalname,
      url: uploadResult.secure_url,
      thumbnailUrl,
      publicId: uploadResult.public_id,
      type: isVideo ? 'video' : 'image',
      size: file.size,
      mimeType: file.mimetype,
    });

    await User.findByIdAndUpdate(req.user.id, { $inc: { usedStorage: file.size } });

    res.status(201).json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const media = await Media.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, user: req.user.id });
    if (!media) return res.status(404).json({ message: 'Not found' });

    await cloudinary.uploader.destroy(media.publicId, { resource_type: media.type });
    await User.findByIdAndUpdate(req.user.id, { $inc: { usedStorage: -media.size } });
    await media.deleteOne();

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.storageInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('usedStorage storageLimit');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
EOF