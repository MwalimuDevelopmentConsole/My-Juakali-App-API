const express = require("express");
const router = express.Router();

// Import Cloudinary configuration
const {
  uploadMiddleware,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  handleUploadError,
  processUploadedFiles,
  getThumbnailUrl,
} = require("../config/cloudinary");

// Import controllers
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
  searchProducts,
} = require("../controllers/productsController");

const { searchProducts } = require("../controllers/searchController");

// Import middleware
const { authenticateToken, authorize } = require("../middleware/auth");
const { Product } = require("../models");
const { handleMulterError, upload } = require("../config/multer");

// =============================================
// SEARCH ROUTES
// =============================================

// @route   GET /api/products/search
// @desc    Search products with category grouping
// @access  Public
router.get("/search", searchProducts);

// =============================================
// PRODUCT ROUTES
// =============================================

// @route   GET /api/products
// @desc    Get all products with smart ranking and filtering
// @access  Public
router.get("/", getProducts);

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public
router.get("/:id", getProduct);

// @route   POST /api/products
// @desc    Create new product
// @access  Seller only
router.post(
  "/",
  authenticateToken,
  authorize(["seller"]),
  upload.array("images", 15),
  handleMulterError,
  createProduct
);

// @route   PATCH /api/products/update/:id
// @desc    Update product
// @access  Seller (own products) or Admin
router.patch(
  "/update/:id",
  authenticateToken,
  authorize(["seller", "admin", "super_admin"]),
  upload.array("images", 15),
  handleMulterError,
  updateProduct
);

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Seller (own products) or Admin
router.delete(
  "/:id",
  authenticateToken,
  authorize(["seller", "admin"]),
  deleteProduct
);

// @route   GET /api/products/seller/:sellerId
// @desc    Get products by specific seller
// @access  Public
router.get("/products/seller/:sellerId", getSellerProducts);

// =============================================
// IMAGE MANAGEMENT ROUTES
// =============================================

// @route   POST /api/products/:id/images
// @desc    Add additional images to existing product
// @access  Seller (own products) or Admin
router.post(
  "/:id/images",
  authenticateToken,
  authorize(["seller", "admin"]),
  uploadMiddleware.products.array("images", 10),
  handleUploadError,
  processUploadedFiles,
  async (req, res) => {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Check ownership
      if (
        req.user.userType === "seller" &&
        product.seller.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this product",
        });
      }

      // Process uploaded files
      const newImages = req.uploadedFiles.map((file, index) => ({
        url: file.url,
        publicId: file.publicId,
        alt: product.title,
        isPrimary: false,
        order: product.media.images.length + index,
        width: file.width,
        height: file.height,
        format: file.format,
        size: file.size,
      }));

      product.media.images.push(...newImages);
      await product.save();

      res.status(200).json({
        success: true,
        message: "Images added successfully",
        newImages,
        totalImages: product.media.images.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

// @route   DELETE /api/products/:id/images/:imageId
// @desc    Delete specific image from product
// @access  Seller (own products) or Admin
router.delete(
  "/products/:id/images/:imageId",
  authenticateToken,
  authorize(["seller", "admin"]),
  async (req, res) => {
    try {
      const { id, imageId } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Check ownership
      if (
        req.user.userType === "seller" &&
        product.seller.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this product",
        });
      }

      // Find and remove image
      const imageIndex = product.media.images.findIndex(
        (img) => img._id.toString() === imageId
      );
      if (imageIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      const imageToDelete = product.media.images[imageIndex];

      // Delete from Cloudinary
      if (imageToDelete.publicId) {
        await deleteFromCloudinary(imageToDelete.publicId);
      }

      // Remove from product
      product.media.images.splice(imageIndex, 1);

      // If deleted image was primary, make first remaining image primary
      if (imageToDelete.isPrimary && product.media.images.length > 0) {
        product.media.images[0].isPrimary = true;
      }

      await product.save();

      res.status(200).json({
        success: true,
        message: "Image deleted successfully",
        remainingImages: product.media.images.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

// @route   PUT /api/products/:id/images/:imageId/primary
// @desc    Set image as primary
// @access  Seller (own products) or Admin
router.put(
  "/products/:id/images/:imageId/primary",
  authenticateToken,
  authorize(["seller", "admin"]),
  async (req, res) => {
    try {
      const { id, imageId } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Check ownership
      if (
        req.user.userType === "seller" &&
        product.seller.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this product",
        });
      }

      // Reset all images to non-primary
      product.media.images.forEach((img) => {
        img.isPrimary = false;
      });

      // Find and set new primary image
      const targetImage = product.media.images.find(
        (img) => img._id.toString() === imageId
      );
      if (!targetImage) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      targetImage.isPrimary = true;
      await product.save();

      res.status(200).json({
        success: true,
        message: "Primary image updated successfully",
        primaryImage: {
          id: targetImage._id,
          url: targetImage.url,
          thumbnailUrl: getThumbnailUrl(targetImage.publicId),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

// @route   POST /api/products/upload-test
// @desc    Test Cloudinary upload
// @access  Authenticated users
router.post(
  "/products/upload-test",
  authenticateToken,
  uploadMiddleware.products.array("images", 5),
  handleUploadError,
  processUploadedFiles,
  async (req, res) => {
    try {
      const uploadedFiles = req.uploadedFiles.map((file) => ({
        originalName: file.originalName,
        cloudinaryUrl: file.url,
        publicId: file.publicId,
        size: file.size,
        dimensions: `${file.width}x${file.height}`,
        format: file.format,
        thumbnailUrl: getThumbnailUrl(file.publicId),
      }));

      res.status(200).json({
        success: true,
        message: "Files uploaded successfully to Cloudinary",
        uploadedFiles,
        count: uploadedFiles.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Upload test failed",
        error: error.message,
      });
    }
  }
);

// =============================================
// DISCOVERY ROUTES
// =============================================

// @route   GET /api/products/category/:categoryId
// @desc    Get products by category
// @access  Public
router.get("/products/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    req.query.category = categoryId;
    await getProducts(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @route   GET /api/products/search/:query
// @desc    Get products by search query
// @access  Public
router.get("/products/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    req.query.search = query;
    await getProducts(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @route   GET /api/products/trending/today
// @desc    Get trending products
// @access  Public
router.get("/products/trending/today", async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const trendingProducts = await Product.find({
      status: "active",
      "stats.lastViewed": { $gte: oneDayAgo },
    })
      .populate("seller", "firstName lastName businessInfo.businessName")
      .populate("primaryCategory", "name slug")
      .sort({ "stats.views": -1 })
      .limit(parseInt(limit))
      .select("title slug pricing media.images stats location createdAt");

    res.status(200).json({
      success: true,
      count: trendingProducts.length,
      trendingProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
router.get("/products/featured", async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const featuredProducts = await Product.find({
      status: "active",
      isFeatured: true,
      featureExpiry: { $gt: new Date() },
    })
      .populate("seller", "firstName lastName businessInfo.businessName")
      .populate("primaryCategory", "name slug")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select("title slug pricing media.images stats location createdAt");

    res.status(200).json({
      success: true,
      count: featuredProducts.length,
      featuredProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @route   POST /api/products/:id/favorite
// @desc    Add product to favorites
// @access  Authenticated users
router.post("/:id/favorite", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      { $inc: { "stats.favorites": 1 } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product added to favorites",
      favoritesCount: product.stats.favorites,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @route   POST /api/products/:id/share
// @desc    Track product share
// @access  Public
router.post("/:id/share", async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { $inc: { "stats.shares": 1 } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Share tracked successfully",
      sharesCount: product.stats.shares,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

module.exports = router;
