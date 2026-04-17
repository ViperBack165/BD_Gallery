const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { upload: uploadMedia, getAll, remove, storageInfo } = require('../controllers/mediaController');

router.use(auth);
router.get('/', getAll);
router.post('/upload', upload.single('file'), uploadMedia);
router.delete('/:id', remove);
router.get('/storage', storageInfo);

module.exports = router;
EOF