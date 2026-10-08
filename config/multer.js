"use strict";
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
sharp.cache(false); // Disable cache to prevent file locking on Windows
const { uploadToBunnyCDN } = require("../utils/bunnyCdn");

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

// Helper to escape special XML characters in SVG text
const escapeXml = (unsafe) => {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Helper to resolve seller and company watermark information
const resolveWatermarkInfo = async (req) => {
  const companyName = (req.body?.companyName || "craftory").trim();
  let sellerName = "";

  // 1. Explicitly provided in request body
  if (req.body?.sellerName && typeof req.body.sellerName === "string" && req.body.sellerName.trim()) {
    sellerName = req.body.sellerName.trim();
  } else if (req.body?.businessName && typeof req.body.businessName === "string" && req.body.businessName.trim()) {
    sellerName = req.body.businessName.trim();
  }

  // 2. From authenticated user (seller)
  if (!sellerName && req.user) {
    if (req.user.businessInfo?.businessName && req.user.businessInfo.businessName.trim()) {
      sellerName = req.user.businessInfo.businessName.trim();
    } else {
      const personalName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim();
      if (personalName) {
        sellerName = personalName;
      } else if (req.user.fullName && req.user.fullName.trim()) {
        sellerName = req.user.fullName.trim();
      } else if (req.user.name && req.user.name.trim()) {
        sellerName = req.user.name.trim();
      }
    }
  }

  // 3. Fallback for product update (PATCH /update/:id) when user is admin or seller info wasn't in req.user
  if (!sellerName && req.params?.id) {
    try {
      const Product = require("../models/Product");
      const product = await Product.findById(req.params.id).populate("seller", "firstName lastName businessInfo");
      if (product?.seller) {
        if (product.seller.businessInfo?.businessName && product.seller.businessInfo.businessName.trim()) {
          sellerName = product.seller.businessInfo.businessName.trim();
        } else {
          sellerName = [product.seller.firstName, product.seller.lastName].filter(Boolean).join(" ").trim();
        }
      }
    } catch (err) {
      console.warn("Could not fetch product seller for watermark:", err.message);
    }
  }

  // 4. Fallback for product creation when admin provides seller or sellerId in body
  if (!sellerName && (req.body?.seller || req.body?.sellerId)) {
    try {
      const Seller = require("../models/Seller");
      const seller = await Seller.findById(req.body.seller || req.body.sellerId).select("firstName lastName businessInfo");
      if (seller) {
        if (seller.businessInfo?.businessName && seller.businessInfo.businessName.trim()) {
          sellerName = seller.businessInfo.businessName.trim();
        } else {
          sellerName = [seller.firstName, seller.lastName].filter(Boolean).join(" ").trim();
        }
      }
    } catch (err) {
      console.warn("Could not fetch seller for watermark:", err.message);
    }
  }

  return {
    sellerName,
    companyName,
  };
};

// Process image: add watermark and optimize
const processImage = async (filePath, watermarkOptions = {}, companyNameOverride = null) => {
  try {
    let sellerName = "";
    let companyName = "craftory";

    if (typeof watermarkOptions === "string") {
      sellerName = watermarkOptions;
      if (companyNameOverride) {
        companyName = companyNameOverride;
      }
    } else if (watermarkOptions && typeof watermarkOptions === "object") {
      sellerName = watermarkOptions.sellerName || watermarkOptions.businessName || "";
      companyName = watermarkOptions.companyName || companyNameOverride || "craftory";
    }

    let image = sharp(filePath);
    let metadata = await image.metadata();

    // Resize if image is too large (max 1920px width) - Standardize maximum dimension
    if (metadata.width > 1920) {
      image = image.resize(1920, null, {
        withoutEnlargement: true,
        fit: "inside",
      });

      // Get new dimensions after resize
      const resizedBuffer = await image.toBuffer();
      image = sharp(resizedBuffer);
      metadata = await image.metadata();
    }

    // Watermark Configuration - Centered to prevent image cropping/theft
    const width = metadata.width;
    const height = metadata.height;
    const minDim = Math.min(width, height);

    // Font size relative to smaller dimension for balanced center placement
    const fontSize = Math.max(Math.floor(minDim * 0.048), 18);
    const companyFontSize = Math.max(Math.floor(fontSize * 0.72), 13);

    const cleanSeller = (sellerName || "").trim().toUpperCase();
    const cleanCompany = (companyName || "craftory").trim().toUpperCase();

    const safeSeller = escapeXml(cleanSeller);
    const safeCompany = escapeXml(cleanCompany);

    let content = "";
    if (safeSeller && safeSeller !== safeCompany) {
      const lineGap = Math.floor(fontSize * 0.35);
      // Vertically centered around height / 2
      const ySeller = Math.floor(height / 2 - lineGap / 2);
      const yCompany = Math.floor(height / 2 + companyFontSize + lineGap / 2);

      content = `
        <text x="${width / 2}" y="${ySeller}" class="center-seller-watermark">${safeSeller}</text>
        <text x="${width / 2}" y="${yCompany}" class="center-company-watermark">${safeCompany}</text>
      `;
    } else {
      const ySolo = Math.floor(height / 2 + fontSize * 0.35);
      content = `
        <text x="${width / 2}" y="${ySolo}" class="center-solo-watermark">${safeCompany || safeSeller}</text>
      `;
    }

    // Create professional SVG watermark placed at the center
    // Semi-transparent with drop shadow for clarity on any background
    const svgWatermark = `
      <svg width="${width}" height="${height}">
        <style>
          .center-seller-watermark { 
            fill: rgba(255, 255, 255, 0.6);
            font-size: ${fontSize}px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            font-weight: 700;
            text-anchor: middle;
            filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.7)) drop-shadow(0px 0px 2px rgba(0,0,0,0.8));
            letter-spacing: 0.08em;
          }
          .center-company-watermark { 
            fill: rgba(255, 255, 255, 0.5);
            font-size: ${companyFontSize}px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            font-weight: 600;
            text-anchor: middle;
            filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.7)) drop-shadow(0px 0px 2px rgba(0,0,0,0.8));
            letter-spacing: 0.16em;
          }
          .center-solo-watermark { 
            fill: rgba(255, 255, 255, 0.6);
            font-size: ${fontSize}px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            font-weight: 700;
            text-anchor: middle;
            filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.7)) drop-shadow(0px 0px 2px rgba(0,0,0,0.8));
            letter-spacing: 0.12em;
          }
        </style>
        ${content}
      </svg>
    `;

    const watermarkBuffer = Buffer.from(svgWatermark);

    // Always output as WebP (most lightweight format)
    const outputPath = filePath
      .replace("/temp/", "/optimized/")
      .replace(path.extname(filePath), ".webp");

    // Add watermark and convert to WebP
    // Using default 'over' blend mode which is standard for overlays
    await image
      .composite([{ input: watermarkBuffer, top: 0, left: 0 }])
      .webp({
        quality: 85,
        effort: 6,
      })
      .toFile(outputPath);

    // Upload to BunnyCDN
    try {
      if (process.env.BUNNY_API_KEY && process.env.BUNNY_STORAGE_NAME) {
        await uploadToBunnyCDN(outputPath);
        console.log(`✅ Uploaded to BunnyCDN: ${path.basename(outputPath)}`);
      }
    } catch (uploadError) {
      console.error("BunnyCDN upload failed:", uploadError.message);
    }

    // Robust cleanup of temp file in the temp folder
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted temp file: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn(
        `Warning: Could not delete temp file ${filePath}:`,
        err.message
      );
    }

    return {
      originalPath: filePath,
      optimizedPath: outputPath,
      filename: path.basename(outputPath),
    };
  } catch (error) {
    console.error("Error processing image:", error);
    // Don't throw error to prevent crashing entire upload if one image fails
    return null;
  }
};

// Middleware to process uploaded images ASYNCHRONOUSLY
const processUploadedImages = async (req, res, next) => {
  try {
    const watermarkInfo = await resolveWatermarkInfo(req);

    // Store original file info for immediate response
    if (req.file) {
      req.file.processingStatus = "pending";
    } else if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach((file) => (file.processingStatus = "pending"));
      } else {
        for (const fieldName in req.files) {
          req.files[fieldName].forEach(
            (file) => (file.processingStatus = "pending")
          );
        }
      }
    }

    // Move to next middleware immediately - don't wait for processing
    next();

    // Process images in the background (non-blocking)
    setImmediate(async () => {
      try {
        if (req.file) {
          await processImage(req.file.path, watermarkInfo);
        } else if (req.files) {
          if (Array.isArray(req.files)) {
            await Promise.all(
              req.files.map((file) => processImage(file.path, watermarkInfo))
            );
          } else {
            const promises = [];
            for (const fieldName in req.files) {
              promises.push(
                ...req.files[fieldName].map((file) =>
                  processImage(file.path, watermarkInfo)
                )
              );
            }
            await Promise.all(promises);
          }
        }
        console.log(
          `✅ Background image processing completed with watermark: ${watermarkInfo.sellerName || "N/A"} | ${watermarkInfo.companyName}`
        );
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
  processImage,
  processUploadedImages,
  resolveWatermarkInfo,
  handleMulterError,
};
