"use strict";
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { uploadToBunnyCDN } = require('../utils/bunnyCdn');

// Ensure upload directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Create uploads directory
ensureDirectoryExists("uploads/");
ensureDirectoryExists("uploads/temp/");
ensureDirectoryExists("uploads/optimized/");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("Uploading file to: uploads/temp/");
    cb(null, "uploads/temp/");
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const safeFilename = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${safeFilename}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

// Process image: add watermark and optimize
const processImage = async (filePath, businessName) => {
  try {
    let image = sharp(filePath);
    let metadata = await image.metadata();
    
    // Resize if image is too large (max 1920px width) - Standardize maximum dimension
    if (metadata.width > 1920) {
      image = image.resize(1920, null, {
        withoutEnlargement: true,
        fit: 'inside'
      });
      
      // Get new dimensions after resize
      const resizedBuffer = await image.toBuffer();
      image = sharp(resizedBuffer);
      metadata = await image.metadata();
    }
    
    // Watermark Configuration - Minimal & Professional
    // Placing it in bottom-right corner with subtle styling
    const width = metadata.width;
    const height = metadata.height;
    
    // Calculate padding (3% of smaller dimension for consistent spacing)
    const padding = Math.floor(Math.min(width, height) * 0.03);
    
    // Font size relative to image width (approx 2.5%, min 14px)
    const fontSize = Math.max(Math.floor(width * 0.025), 14);
    
    const text = (businessName || "Craftory").toUpperCase();
    
    // Create professional SVG watermark
    // White text with subtle drop shadow for visibility on any background
    // Bottom-right aligned
    const svgWatermark = `
      <svg width="${width}" height="${height}">
        <style>
          .watermark { 
            fill: rgba(255, 255, 255, 0.7);
            font-size: ${fontSize}px; 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            font-weight: 500;
            text-anchor: end;
            filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.5));
            letter-spacing: 0.05em;
          }
        </style>
        <text x="${width - padding}" y="${height - padding}" class="watermark">${text}</text>
      </svg>
    `;
    
    const watermarkBuffer = Buffer.from(svgWatermark);
    
    // Always output as WebP (most lightweight format)
    const outputPath = filePath.replace('/temp/', '/optimized/').replace(path.extname(filePath), '.webp');
    
    // Add watermark and convert to WebP
    // Using default 'over' blend mode which is standard for overlays
    await image
      .composite([
        { input: watermarkBuffer, top: 0, left: 0 }
      ])
      .webp({ 
        quality: 85,
        effort: 6
      })
      .toFile(outputPath);
    
    // Robust cleanup of temp file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn("Warning: Could not delete temp file:", filePath);
    }
    
    // Upload to BunnyCDN
    try {
      if (process.env.BUNNY_API_KEY && process.env.BUNNY_STORAGE_NAME) {
         await uploadToBunnyCDN(outputPath);
         console.log(`✅ Uploaded to BunnyCDN: ${path.basename(outputPath)}`);
      }
    } catch (uploadError) {
      console.error("BunnyCDN upload failed:", uploadError.message);
    }

    return {
      originalPath: filePath,
      optimizedPath: outputPath,
      filename: path.basename(outputPath)
    };
  } catch (error) {
    console.error("Error processing image:", error);
    // Don't throw error to prevent crashing entire upload if one image fails
    // Return null or error object if needed, but for now we log it
    return null;
  }
};

// Middleware to process uploaded images ASYNCHRONOUSLY
const processUploadedImages = async (req, res, next) => {
  try {
    const businessName = req.body.businessName || "";
    
    // Store original file info for immediate response
    if (req.file) {
      req.file.processingStatus = 'pending';
    } else if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach(file => file.processingStatus = 'pending');
      } else {
        for (const fieldName in req.files) {
          req.files[fieldName].forEach(file => file.processingStatus = 'pending');
        }
      }
    }
    
    // Move to next middleware immediately - don't wait for processing
    next();
    
    // Process images in the background (non-blocking)
    setImmediate(async () => {
      try {
        if (req.file) {
          await processImage(req.file.path, businessName);
        } else if (req.files) {
          if (Array.isArray(req.files)) {
            await Promise.all(
              req.files.map(file => processImage(file.path, businessName))
            );
          } else {
            const promises = [];
            for (const fieldName in req.files) {
              promises.push(
                ...req.files[fieldName].map(file => processImage(file.path, businessName))
              );
            }
            await Promise.all(promises);
          }
        }
        console.log('✅ Background image processing completed');
      } catch (error) {
        console.error("Background image processing error:", error);
      }
    });
    
  } catch (error) {
    console.error("Error in processUploadedImages middleware:", error);
    next(error);
  }
};

// Middleware to handle multer errors
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      console.error("File too large:", error);
      return res.status(413).json({
        success: false,
        message: "File too large. Maximum size is 10MB.",
        statusCode: 413,
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      console.error("Unexpected file field:", error);
      return res.status(400).json({
        success: false,
        message: "Unexpected file field.",
        statusCode: 400,
      });
    }
  }
  if (error.message === "Only image files are allowed") {
    console.error("Invalid file type:", error);
    return res.status(400).json({
      success: false,
      message: "Only image files are allowed",
      statusCode: 400,
    });
  }
  next(error);
};

module.exports = {
  upload,
  processUploadedImages,
  handleMulterError,
};