const multer = require('multer');

// ✅ memoryStorage is correct for Vercel (no disk access)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('File type not allowed'), false);
};

// ✅ FIXED: Vercel has a 4.5MB request body limit for Serverless Functions.
// For video uploads, you MUST use Cloudinary's direct upload (from the frontend)
// instead of routing through this API. Keep this limit low for images only.
const limits = {
  fileSize: 10 * 1024 * 1024 // 10MB max — only images should go through here
};

module.exports = multer({ storage, fileFilter, limits });
