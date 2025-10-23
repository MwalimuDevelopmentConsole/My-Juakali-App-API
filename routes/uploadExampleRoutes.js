"use strict";
const express = require("express");
const router = express.Router();
const {
  uploadSingleImage,
  uploadMultipleImages,
  uploadSingleFile,
  uploadMultipleFiles,
  uploadFields,
} = require("../middleware/uploadMiddleware");

/**
 * Example route: Upload single image with watermark
 * POST /api/upload/single-image
 * Body (form-data):
 *   - image: file
 *   - watermark: string (optional, default: "craftory")
 *   - watermarkType: string (optional, "corner" or "diagonal", default: "corner")
 *   - optimize: boolean (optional, default: true)
 *   - folder: string (optional, default: "images")
 *   - ...other fields for your database
 */
router.post("/single-image", uploadSingleImage("image"), async (req, res) => {
  try {
    // Access uploaded file info
    const imageData = req.body.imageData;
    const imageUrl = req.body.imageUrl;

    // You can now save to MongoDB along with other data
    // Example:
    // const product = new Product({
    //   name: req.body.name,
    //   description: req.body.description,
    //   image: imageUrl,
    //   imageData: imageData
    // });
    // await product.save();

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        imageUrl: imageUrl,
        imageData: imageData,
        otherFields: {
          // Any other fields from req.body
          name: req.body.name,
          description: req.body.description,
        },
      },
    });
  } catch (error) {
    console.error("Error in single image upload route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process image upload",
      error: error.message,
    });
  }
});

/**
 * Example route: Upload multiple images with watermark
 * POST /api/upload/multiple-images
 * Body (form-data):
 *   - images: files (multiple)
 *   - watermark: string (optional, default: "craftory")
 *   - watermarkType: string (optional, "corner" or "diagonal")
 *   - optimize: boolean (optional, default: true)
 *   - folder: string (optional, default: "images")
 *   - ...other fields for your database
 */
router.post(
  "/multiple-images",
  uploadMultipleImages("images", 10),
  async (req, res) => {
    try {
      // Access uploaded files info
      const imagesData = req.body.imagesData;
      const imageUrls = req.body.imageUrls;

      res.status(200).json({
        success: true,
        message: `${imageUrls.length} images uploaded successfully`,
        data: {
          imageUrls: imageUrls,
          imagesData: imagesData,
          otherFields: {
            name: req.body.name,
            description: req.body.description,
          },
        },
      });
    } catch (error) {
      console.error("Error in multiple images upload route:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process images upload",
        error: error.message,
      });
    }
  }
);

/**
 * Example route: Upload single file (any type)
 * POST /api/upload/single-file
 * Body (form-data):
 *   - file: file
 *   - watermark: string (optional, only for images, default: "craftory")
 *   - optimize: boolean (optional, only for images, default: true)
 *   - folder: string (optional, default: "files")
 *   - ...other fields for your database
 */
router.post("/single-file", uploadSingleFile("file"), async (req, res) => {
  try {
    const fileData = req.body.fileData;
    const fileUrl = req.body.fileUrl;

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        fileUrl: fileUrl,
        fileData: fileData,
        otherFields: {
          title: req.body.title,
          category: req.body.category,
        },
      },
    });
  } catch (error) {
    console.error("Error in single file upload route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process file upload",
      error: error.message,
    });
  }
});

/**
 * Example route: Upload multiple files (any type)
 * POST /api/upload/multiple-files
 * Body (form-data):
 *   - files: files (multiple)
 *   - watermark: string (optional, only for images, default: "craftory")
 *   - optimize: boolean (optional, only for images, default: true)
 *   - folder: string (optional, default: "files")
 *   - ...other fields for your database
 */
router.post(
  "/multiple-files",
  uploadMultipleFiles("files", 10),
  async (req, res) => {
    try {
      const filesData = req.body.filesData;
      const fileUrls = req.body.fileUrls;

      res.status(200).json({
        success: true,
        message: `${fileUrls.length} files uploaded successfully`,
        data: {
          fileUrls: fileUrls,
          filesData: filesData,
          otherFields: {
            projectName: req.body.projectName,
          },
        },
      });
    } catch (error) {
      console.error("Error in multiple files upload route:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process files upload",
        error: error.message,
      });
    }
  }
);

/**
 * Example route: Upload multiple fields with different files
 * POST /api/upload/mixed-fields
 * Body (form-data):
 *   - avatar: file (single image)
 *   - gallery: files (multiple images, max 8)
 *   - documents: files (multiple documents, max 5)
 *   - watermark: string (optional, default: "craftory")
 *   - ...other fields for your database
 */
router.post(
  "/mixed-fields",
  uploadFields([
    { name: "avatar", maxCount: 1 },
    { name: "gallery", maxCount: 8 },
    { name: "documents", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const uploadedFields = req.body.uploadedFields;

      // Access specific fields
      const avatar = uploadedFields.avatar ? uploadedFields.avatar[0] : null;
      const gallery = uploadedFields.gallery || [];
      const documents = uploadedFields.documents || [];

      res.status(200).json({
        success: true,
        message: "Files uploaded successfully",
        data: {
          avatar: avatar,
          gallery: gallery,
          documents: documents,
          otherFields: {
            name: req.body.name,
            bio: req.body.bio,
          },
        },
      });
    } catch (error) {
      console.error("Error in mixed fields upload route:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process files upload",
        error: error.message,
      });
    }
  }
);

/**
 * Example: Real-world product creation with images
 * POST /api/upload/create-product
 */
router.post(
  "/create-product",
  uploadMultipleImages("productImages", 5),
  async (req, res) => {
    try {
      const imageUrls = req.body.imageUrls || [];

      // Example: Create product in MongoDB
      const productData = {
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        category: req.body.category,
        images: imageUrls,
        imagesData: req.body.imagesData,
        createdAt: new Date(),
      };

      // Save to MongoDB
      // const product = new Product(productData);
      // await product.save();

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: productData,
      });
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create product",
        error: error.message,
      });
    }
  }
);

/**
 * Example: User profile update with avatar
 * PUT /api/upload/update-profile
 */
router.put(
  "/update-profile",
  uploadSingleImage("avatar"),
  async (req, res) => {
    try {
      const avatarUrl = req.body.imageUrl;

      // Example: Update user in MongoDB
      const updateData = {
        name: req.body.name,
        bio: req.body.bio,
      };

      if (avatarUrl) {
        updateData.avatar = avatarUrl;
        updateData.avatarData = req.body.imageData;
      }

      // Update in MongoDB
      // await User.findByIdAndUpdate(req.user.id, updateData);

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updateData,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error: error.message,
      });
    }
  }
);

module.exports = router;
