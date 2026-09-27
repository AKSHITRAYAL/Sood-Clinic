const express = require('express');
const multer = require('multer');
const router = express.Router();
const path = require('path');

// Set up storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // specify upload directory
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // unique file name
  }
});

const upload = multer({ storage: storage });

// Define the route for file upload
router.post('/upload', upload.single('profilePic'), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'Please upload a file' });
  }
  const profilePicPath = `/uploads/${req.file.filename}`;
  res.send({ filePath: profilePicPath, message: 'File uploaded successfully' });
});

router.get('/homed', (req, res) => {
    return res.json({ 'status': 'work' })
})

module.exports = router;
