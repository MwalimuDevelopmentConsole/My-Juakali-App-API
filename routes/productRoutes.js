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
} = require("../config/claudinary");

// Import controllers
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
  searchProducts,
  getProductsByAdmin,
  updateProductStatus
} = require("../controllers/productsController");

// Import middleware
const { authenticateToken, authorize, optionalAuth } = require("../middleware/auth");
const Product = require("../models/Product");
const FavoritedProduct = require("../models/FavoritedProduct");
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

router.get("/admin", authenticateToken, authorize(["admin", "super_admin"]), getProductsByAdmin);

router.patch("/update-status", authenticateToken, authorize(["admin", "super_admin"]), updateProductStatus);

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public
router.get("/:id", optionalAuth, getProduct);

// @route   POST /api/products
// @desc    Create new product
// @access  Seller only
router.post(
  "/",
  authenticateToken,
  authorize(["seller", "admin", "super_admin"]),
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
router.get("/seller/:sellerId", getSellerProducts);

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
  "/:id/images/:imageId",
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
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    req.query.search = query;
    await searchProducts(req, res);
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
router.get("/trending/today", async (req, res) => {
  try {
    const { limit = 25 } = req.query;
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
// POST /:id/favorite/:action/:buyerId
router.post(
  "/:id/favorite/:action/:buyerId",
  authenticateToken,
  async (req, res) => {
    try {
      const { id: productId, action, buyerId } = req.params;

      // Verify the buyer is the authenticated user (security check)
      if (req.user.id !== buyerId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access",
        });
      }

      const product = await Product.findById(productId)
        .populate("seller", "firstName lastName businessInfo.businessName")
        .select("title pricing.basePrice pricing.currency seller");

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (action === "like") {
        // Check if already favorited
        const existingFavorite = await FavoritedProduct.findOne({
          buyerId,
          productId,
        });

        if (existingFavorite) {
          return res.status(200).json({
            success: true,
            message: "Product already liked",
            alreadyLiked: true,
            favoritesCount: product.stats.favorites,
          });
        }

        // Create favorite record
        const favoriteData = {
          buyerId,
          productId,
          productSnapshot: {
            title: product.title,
            price: product.pricing.basePrice,
            currency: product.pricing.currency,
            primaryImage: "",
            sellerName:
              product.seller?.businessInfo?.businessName ||
              `${product.seller?.firstName} ${product.seller?.lastName}` ||
              "Unknown Seller",
          },
        };

        await FavoritedProduct.create(favoriteData);

        // Increment product favorites count
        await Product.findByIdAndUpdate(
          productId,
          { $inc: { "stats.favorites": 1 } },
          { new: true }
        );

        res.status(200).json({
          success: true,
          message: "Product added to favorites",
          alreadyLiked: false,
          favoritesCount: product.stats.favorites + 1,
        });
      } else if (action === "dislike") {
        // Remove favorite record
        const deletedFavorite = await FavoritedProduct.findOneAndDelete({
          buyerId,
          productId,
        });

        if (!deletedFavorite) {
          return res.status(404).json({
            success: false,
            message: "Favorite not found",
          });
        }

        // Note: We don't decrement the product favorites count as requested
        res.status(200).json({
          success: true,
          message: "Product removed from favorites",
          favoritesCount: product.stats.favorites,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Use 'like' or 'dislike'",
        });
      }
    } catch (error) {
      console.log(error);
      // Handle duplicate key error (if user somehow tries to like twice)
      if (error.code === 11000) {
        return res.status(200).json({
          success: true,
          message: "Product already liked",
          alreadyLiked: true,
        });
      }

      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

// GET /favorites/:buyerId - Get user's favorite products
router.get("/favorites/:buyerId", async (req, res) => {
  try {
    const { buyerId } = req.params;
    const { page = 1, limit = 15 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const totalFavorites = await FavoritedProduct.countDocuments({ buyerId });

    // Get favorites with populated product data
    const favorites = await FavoritedProduct.find({ buyerId })
      .populate({
        path: "productId",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Filter out favorites where product no longer exists or is not active
    const validFavorites = favorites.filter(
      (fav) => fav.productId && fav.productId.status === "active"
    );

    // Clean up invalid favorites in background (optional)
    const invalidFavorites = favorites.filter(
      (fav) => !fav.productId || fav.productId.status !== "active"
    );

    if (invalidFavorites.length > 0) {
      // Remove invalid favorites in background
      const invalidIds = invalidFavorites.map((fav) => fav._id);
      FavoritedProduct.deleteMany({ _id: { $in: invalidIds } }).catch(
        console.error
      );
    }

    // Format response
    const products = validFavorites.map((favorite) => ({
      ...favorite.productId.toObject(),
      favoritedAt: favorite.createdAt,
    }));

    const totalPages = Math.ceil(totalFavorites / limitNum);

    res.status(200).json({
      success: true,
      products,
      totalProducts: totalFavorites,
      currentPage: pageNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalFavorites,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /favorites/:buyerId/ids - Get only favorite product IDs (for localStorage sync)
router.get("/favorites/:buyerId/ids", async (req, res) => {
  try {
    const { buyerId } = req.params;

    if (req.user.id !== buyerId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const favorites = await FavoritedProduct.find({ buyerId }).select(
      "productId"
    );
    const productIds = favorites.map((fav) => fav.productId.toString());

    res.status(200).json({
      success: true,
      productIds,
      count: productIds.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// GET /favorites/:buyerId/count - Get user's favorites count
router.get("/favorites/:buyerId/count", authenticateToken, async (req, res) => {
  try {
    const { buyerId } = req.params;

    // Verify the buyer is the authenticated user (security check)
    if (req.user.id !== buyerId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Get total count of favorites for this buyer
    const favoritesCount = await FavoritedProduct.countDocuments({ buyerId });

    res.status(200).json({
      success: true,
      count: favoritesCount,
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
