'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Create uploads directory
ensureDirectoryExists('uploads/');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`Uploading file to: uploads/`);
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const safeFilename = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}-${safeFilename}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware to handle multer errors
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      console.error('File too large:', error);
      return res.status(413).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.',
        statusCode: 413
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      console.error('Unexpected file field:', error);
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
        statusCode: 400
      });
    }
  }

  if (error.message === 'Only image files are allowed') {
    console.error('Invalid file type:', error);
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed',
      statusCode: 400
    });
  }

  next(error);
};

module.exports = {
  upload,
  handleMulterError
};
