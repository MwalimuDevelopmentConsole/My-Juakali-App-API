// =============================================
// CONFIG/CLOUDINARY.JS - Cloudinary Configuration
// =============================================
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Accept images and videos
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

// =============================================
// CLOUDINARY STORAGE CONFIGURATIONS
// =============================================

// Product images storage configuration
const createCloudinaryStorage = (folder, transformations = []) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv'],
      resource_type: 'auto',
      transformation: transformations.length > 0 ? transformations : [
        { width: 1200, height: 900, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    }
  });
};

// Different storage configurations for different use cases
const storageConfigs = {
  // Product images - high quality, large size
  products: createCloudinaryStorage('myjuakali/products', [
    { width: 1200, height: 900, crop: 'limit' },
    { quality: 'auto:good' },
    { fetch_format: 'auto' }
  ]),
  
  // Profile avatars - smaller, square
  avatars: createCloudinaryStorage('myjuakali/avatars', [
    { width: 400, height: 400, crop: 'fill', gravity: 'face' },
    { quality: 'auto:good' },
    { fetch_format: 'auto' }
  ]),
  
  // Category images - medium size
  categories: createCloudinaryStorage('myjuakali/categories', [
    { width: 600, height: 400, crop: 'fill' },
    { quality: 'auto:good' },
    { fetch_format: 'auto' }
  ]),
  
  // Documents - no image transformation
  documents: createCloudinaryStorage('myjuakali/documents', []),
  
  // Message attachments - smaller size
  messages: createCloudinaryStorage('myjuakali/messages', [
    { width: 800, height: 600, crop: 'limit' },
    { quality: 'auto:good' },
    { fetch_format: 'auto' }
  ])
};

// =============================================
// MULTER UPLOAD CONFIGURATIONS
// =============================================

// Create upload middleware for different use cases
const createUploadMiddleware = (storageType, maxFiles = 10, maxSize = 50) => {
  const storage = storageConfigs[storageType] || storageConfigs.products;
  
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: maxSize * 1024 * 1024, // Convert MB to bytes
      files: maxFiles
    }
  });
};

// Pre-configured upload middlewares
const uploadMiddleware = {
  // Products - up to 15 files, 50MB each
  products: createUploadMiddleware('products', 15, 50),
  
  // Single avatar upload
  avatar: createUploadMiddleware('avatars', 1, 10),
  
  // Category images
  categories: createUploadMiddleware('categories', 1, 10),
  
  // Message attachments - up to 5 files, 20MB each
  messages: createUploadMiddleware('messages', 5, 20),
  
  // Documents - up to 10 files, 100MB each
  documents: createUploadMiddleware('documents', 10, 100)
};

// =============================================
// MANUAL UPLOAD FUNCTIONS
// =============================================

// Manual upload to Cloudinary (for more control)
const uploadToCloudinary = async (file, options = {}) => {
  const {
    folder = 'myjuakali/misc',
    transformation = [
      { width: 1200, height: 900, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    public_id_prefix = ''
  } = options;

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder,
      resource_type: 'auto',
      transformation: transformation,
      public_id: public_id_prefix ? `${public_id_prefix}-${Date.now()}-${Math.round(Math.random() * 1E9)}` : undefined
    };

    // Handle different input types
    if (file.buffer) {
      // File from memory storage
      cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format,
              bytes: result.bytes,
              resourceType: result.resource_type
            });
          }
        }
      ).end(file.buffer);
    } else if (file.path) {
      // File from disk
      cloudinary.uploader.upload(file.path, uploadOptions)
        .then(result => {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            resourceType: result.resource_type
          });
        })
        .catch(reject);
    } else {
      reject(new Error('Invalid file format'));
    }
  });
};

// Upload multiple files
const uploadMultipleToCloudinary = async (files, options = {}) => {
  const uploadPromises = files.map(file => uploadToCloudinary(file, options));
  return Promise.all(uploadPromises);
};

// =============================================
// DELETION FUNCTIONS
// =============================================

// Delete single file from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    throw error;
  }
};

// Delete multiple files from Cloudinary
const deleteMultipleFromCloudinary = async (publicIds, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary bulk deletion error:', error);
    throw error;
  }
};

// =============================================
// UTILITY FUNCTIONS
// =============================================

// Get Cloudinary URL with transformations
const getTransformedUrl = (publicId, transformations) => {
  return cloudinary.url(publicId, {
    transformation: transformations,
    secure: true
  });
};

// Generate thumbnail URL
const getThumbnailUrl = (publicId, width = 300, height = 300) => {
  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop: 'fill' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    secure: true
  });
};

// Check if file is video
const isVideo = (publicId) => {
  return cloudinary.api.resource(publicId)
    .then(resource => resource.resource_type === 'video')
    .catch(() => false);
};

// =============================================
// MIDDLEWARE HELPERS
// =============================================

// Middleware to handle Cloudinary upload errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size allowed is specified per endpoint.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum number of files exceeded.'
      });
    }
  }
  
  if (error.message.includes('Only image and video files')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only images and videos are allowed.'
    });
  }
  
  return res.status(500).json({
    success: false,
    message: 'File upload error',
    error: error.message
  });
};

// Middleware to process uploaded files and add metadata
const processUploadedFiles = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    req.uploadedFiles = req.files.map(file => ({
      url: file.path, // Cloudinary URL
      publicId: file.filename, // Cloudinary public ID
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      width: file.width,
      height: file.height,
      format: file.format
    }));
  }
  next();
};

// =============================================
// EXPORTS
// =============================================

module.exports = {
  // Core cloudinary instance
  cloudinary,
  
  // Storage configurations
  storageConfigs,
  
  // Upload middlewares
  uploadMiddleware,
  
  // Manual upload functions
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  
  // Deletion functions
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  
  // Utility functions
  getTransformedUrl,
  getThumbnailUrl,
  isVideo,
  
  // Middleware helpers
  handleUploadError,
  processUploadedFiles,
  
  // Create custom upload middleware
  createUploadMiddleware,
  createCloudinaryStorage
};