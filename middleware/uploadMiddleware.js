"use strict";
const multer = require("multer");
const { uploadToGCS } = require("../config/googleCloudStorage");
const {
  addWatermark,
  addDiagonalWatermark,
  optimizeImage,
} = require("../utils/watermark");
const path = require("path");

// File type validators
const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

// Configure multer to use memory storage (we'll upload directly to GCS)
const storage = multer.memoryStorage();

// File filter for images only
const imageFileFilter = (req, file, cb) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed."
      ),
      false
    );
  }
};

// File filter for all file types
const anyFileFilter = (req, file, cb) => {
  const allowedTypes = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only images and documents (PDF, Word, Excel, TXT, CSV) are allowed."
      ),
      false
    );
  }
};

// Base multer configurations
const createMulterUpload = (fileFilter, limits = {}) => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: limits.fileSize || 10 * 1024 * 1024, // 10MB default
      files: limits.files || 10, // Max 10 files default
    },
  });
};

// Multer instances
const uploadImage = createMulterUpload(imageFileFilter);
const uploadFile = createMulterUpload(anyFileFilter);

/**
 * Process and upload file to GCS
 * @param {Object} file - Multer file object
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - File info with GCS URL
 */
const processAndUploadFile = async (file, options = {}) => {
  try {
    const {
      watermark = null,
      watermarkType = "corner", // 'corner' or 'diagonal'
      optimize = true,
      folder = "uploads",
    } = options;

    let fileBuffer = file.buffer;
    const isImage = IMAGE_MIME_TYPES.includes(file.mimetype);

    // Process images
    if (isImage) {
      // Optimize image
      if (optimize) {
        fileBuffer = await optimizeImage(fileBuffer, {
          maxWidth: 2000,
          maxHeight: 2000,
          quality: 80,
        });
      }

      // Add watermark if specified
      if (watermark) {
        if (watermarkType === "diagonal") {
          fileBuffer = await addDiagonalWatermark(fileBuffer, watermark);
        } else {
          fileBuffer = await addWatermark(fileBuffer, watermark, {
            position: "southeast",
            fontSize: 48,
            opacity: 0.5,
          });
        }
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${folder}/${timestamp}-${randomString}-${safeBaseName}${extension}`;

    // Upload to GCS
    const publicUrl = await uploadToGCS(fileBuffer, filename, file.mimetype);

    return {
      originalName: file.originalname,
      filename: filename,
      url: publicUrl,
      mimetype: file.mimetype,
      size: fileBuffer.length,
      fieldName: file.fieldname,
    };
  } catch (error) {
    console.error("Error processing and uploading file:", error);
    throw error;
  }
};

/**
 * Middleware to upload single image with watermark support
 * Usage: uploadSingleImage('fieldName')
 */
const uploadSingleImage = (fieldName) => {
  return async (req, res, next) => {
    const upload = uploadImage.single(fieldName);

    upload(req, res, async (err) => {
      if (err) {
        return handleUploadError(err, res);
      }

      if (!req.file) {
        return next();
      }

      try {
        const watermark = req.body.watermark || "craftory";
        const watermarkType = req.body.watermarkType || "corner";
        const optimize = req.body.optimize !== "false";
        const folder = req.body.folder || "images";

        const fileInfo = await processAndUploadFile(req.file, {
          watermark,
          watermarkType,
          optimize,
          folder,
        });

        // Add file info to request body for database saving
        req.body.imageUrl = fileInfo.url;
        req.body.imageData = fileInfo;

        // Also keep in req for backward compatibility
        req.uploadedFile = fileInfo;

        next();
      } catch (error) {
        console.error("Error uploading single image:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload image",
          error: error.message,
        });
      }
    });
  };
};

/**
 * Middleware to upload multiple images with watermark support
 * Usage: uploadMultipleImages('fieldName', 5)
 */
const uploadMultipleImages = (fieldName, maxCount = 10) => {
  return async (req, res, next) => {
    const upload = uploadImage.array(fieldName, maxCount);

    upload(req, res, async (err) => {
      if (err) {
        return handleUploadError(err, res);
      }

      if (!req.files || req.files.length === 0) {
        return next();
      }

      try {
        const watermark = req.body.watermark || "craftory";
        const watermarkType = req.body.watermarkType || "corner";
        const optimize = req.body.optimize !== "false";
        const folder = req.body.folder || "images";

        const uploadPromises = req.files.map((file) =>
          processAndUploadFile(file, {
            watermark,
            watermarkType,
            optimize,
            folder,
          })
        );

        const filesInfo = await Promise.all(uploadPromises);

        // Add files info to request body for database saving
        req.body.imageUrls = filesInfo.map((f) => f.url);
        req.body.imagesData = filesInfo;

        // Also keep in req for backward compatibility
        req.uploadedFiles = filesInfo;

        next();
      } catch (error) {
        console.error("Error uploading multiple images:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload images",
          error: error.message,
        });
      }
    });
  };
};

/**
 * Middleware to upload single file (any type)
 * Usage: uploadSingleFile('fieldName')
 */
const uploadSingleFile = (fieldName) => {
  return async (req, res, next) => {
    const upload = uploadFile.single(fieldName);

    upload(req, res, async (err) => {
      if (err) {
        return handleUploadError(err, res);
      }

      if (!req.file) {
        return next();
      }

      try {
        const isImage = IMAGE_MIME_TYPES.includes(req.file.mimetype);
        const watermark =
          isImage && req.body.watermark ? req.body.watermark : null;
        const watermarkType = req.body.watermarkType || "corner";
        const optimize = isImage && req.body.optimize !== "false";
        const folder = req.body.folder || "files";

        const fileInfo = await processAndUploadFile(req.file, {
          watermark,
          watermarkType,
          optimize,
          folder,
        });

        // Add file info to request body for database saving
        req.body.fileUrl = fileInfo.url;
        req.body.fileData = fileInfo;

        // Also keep in req for backward compatibility
        req.uploadedFile = fileInfo;

        next();
      } catch (error) {
        console.error("Error uploading single file:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload file",
          error: error.message,
        });
      }
    });
  };
};

/**
 * Middleware to upload multiple files (any type)
 * Usage: uploadMultipleFiles('fieldName', 5)
 */
const uploadMultipleFiles = (fieldName, maxCount = 10) => {
  return async (req, res, next) => {
    const upload = uploadFile.array(fieldName, maxCount);

    upload(req, res, async (err) => {
      if (err) {
        return handleUploadError(err, res);
      }

      if (!req.files || req.files.length === 0) {
        return next();
      }

      try {
        const folder = req.body.folder || "files";

        const uploadPromises = req.files.map((file) => {
          const isImage = IMAGE_MIME_TYPES.includes(file.mimetype);
          const watermark =
            isImage && req.body.watermark ? req.body.watermark : null;
          const watermarkType = req.body.watermarkType || "corner";
          const optimize = isImage && req.body.optimize !== "false";

          return processAndUploadFile(file, {
            watermark,
            watermarkType,
            optimize,
            folder,
          });
        });

        const filesInfo = await Promise.all(uploadPromises);

        // Add files info to request body for database saving
        req.body.fileUrls = filesInfo.map((f) => f.url);
        req.body.filesData = filesInfo;

        // Also keep in req for backward compatibility
        req.uploadedFiles = filesInfo;

        next();
      } catch (error) {
        console.error("Error uploading multiple files:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload files",
          error: error.message,
        });
      }
    });
  };
};

/**
 * Middleware to upload multiple fields with mixed files
 * Usage: uploadFields([{ name: 'avatar', maxCount: 1 }, { name: 'gallery', maxCount: 8 }])
 */
const uploadFields = (fields) => {
  return async (req, res, next) => {
    const upload = uploadFile.fields(fields);

    upload(req, res, async (err) => {
      if (err) {
        return handleUploadError(err, res);
      }

      if (!req.files || Object.keys(req.files).length === 0) {
        return next();
      }

      try {
        const folder = req.body.folder || "files";
        const uploadedFields = {};

        // Process each field
        for (const [fieldName, files] of Object.entries(req.files)) {
          const uploadPromises = files.map((file) => {
            const isImage = IMAGE_MIME_TYPES.includes(file.mimetype);
            const watermark =
              isImage && req.body.watermark ? req.body.watermark : null;
            const watermarkType = req.body.watermarkType || "corner";
            const optimize = isImage && req.body.optimize !== "false";

            return processAndUploadFile(file, {
              watermark,
              watermarkType,
              optimize,
              folder: `${folder}/${fieldName}`,
            });
          });

          uploadedFields[fieldName] = await Promise.all(uploadPromises);
        }

        // Add files info to request body
        req.body.uploadedFields = uploadedFields;
        req.uploadedFields = uploadedFields;

        next();
      } catch (error) {
        console.error("Error uploading fields:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload files",
          error: error.message,
        });
      }
    });
  };
};

/**
 * Handle multer and upload errors
 */
const handleUploadError = (error, res) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File too large. Maximum size is 10MB.",
        statusCode: 413,
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files.",
        statusCode: 400,
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field.",
        statusCode: 400,
      });
    }
  }

  return res.status(400).json({
    success: false,
    message: error.message || "File upload failed",
    statusCode: 400,
  });
};

module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
  uploadSingleFile,
  uploadMultipleFiles,
  uploadFields,
};
