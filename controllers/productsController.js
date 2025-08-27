const UserSubscription = require("../models/SellerSubscription");
const Seller = require("../models/Seller");
const Category = require("../models/Category");
const Product = require("../models/Product");

// @desc    Get all products with smart ranking and filtering
// @access  Public
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      subcategory,
      type, // product or service
      condition,
      minPrice,
      maxPrice,
      location,
      county,
      subcounty,
      latitude,
      longitude,
      radius = 50, // km
      sortBy = "relevance", // relevance, price_low, price_high, newest, rating
      infiniteScroll = false,
      ...dynamicFilters // Any other filters based on category
    } = req.query;
    console.log(category);

    // Build base filter
    let filter = {
      status: "active",
    };

    // Search functionality (deep search)
    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } },
        { keywords: { $in: [searchRegex] } },
        { shortDescription: searchRegex },
      ];
    }

    // Category filtering
    if (category) {
      filter.primaryCategory = category;
    }

    if (subcategory) {
      filter.secondaryCategories = { $in: [subcategory] };
    }

    // Type filtering
    if (type) {
      filter.type = type;
    }

    // Condition filtering
    if (condition) {
      filter.condition = condition;
    }

    // Price filtering
    if (minPrice || maxPrice) {
      filter["pricing.basePrice"] = {};
      if (minPrice) filter["pricing.basePrice"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["pricing.basePrice"].$lte = parseFloat(maxPrice);
    }

    // Location filtering
    if (county) {
      filter["location.county"] = new RegExp(county, "i");
    }

    if (subcounty) {
      filter["location.subcounty"] = new RegExp(subcounty, "i");
    }

    // Geographic radius filtering
    if (latitude && longitude) {
      filter["location.coordinates"] = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: radius * 1000, // Convert km to meters
        },
      };
    }

    // Dynamic filters based on category fields
    const categoryDoc = await Category.findById(category);
    if (categoryDoc && categoryDoc.dynamicFields) {
      categoryDoc.dynamicFields.forEach((field) => {
        const filterValue = dynamicFilters[field.name];
        if (filterValue) {
          switch (field.type) {
            case "select":
            case "text":
              filter[`dynamicFields.${field.name}`] = new RegExp(
                filterValue,
                "i"
              );
              break;
            case "number":
            case "range":
              if (
                dynamicFilters[`${field.name}_min`] ||
                dynamicFilters[`${field.name}_max`]
              ) {
                filter[`dynamicFields.${field.name}`] = {};
                if (dynamicFilters[`${field.name}_min`]) {
                  filter[`dynamicFields.${field.name}`].$gte = parseFloat(
                    dynamicFilters[`${field.name}_min`]
                  );
                }
                if (dynamicFilters[`${field.name}_max`]) {
                  filter[`dynamicFields.${field.name}`].$lte = parseFloat(
                    dynamicFilters[`${field.name}_max`]
                  );
                }
              }
              break;
            case "boolean":
              filter[`dynamicFields.${field.name}`] = filterValue === "true";
              break;
          }
        }
      });
    }

    // Pagination setup
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build aggregation pipeline for smart ranking
    const pipeline = [
      { $match: filter },

      // Lookup seller information and subscription
      {
        $lookup: {
          from: "sellers",
          localField: "seller",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: "$sellerInfo" },

      // Only include active sellers
      {
        $match: {
          "sellerInfo.status": "active",
          "sellerInfo.isActive": true,
        },
      },

      // Lookup seller's current subscription
      {
        $lookup: {
          from: "usersubscriptions",
          localField: "sellerInfo.currentSubscription",
          foreignField: "_id",
          as: "subscription",
        },
      },

      // Lookup subscription plan details
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "subscription.plan",
          foreignField: "_id",
          as: "subscriptionPlan",
        },
      },

      // Add ranking score
      {
        $addFields: {
          subscriptionType: {
            $ifNull: [
              { $arrayElemAt: ["$subscriptionPlan.planType", 0] },
              "free",
            ],
          },
          rankingScore: {
            $switch: {
              branches: [
                // Sponsored products (highest priority)
                {
                  case: { $eq: ["$isPromoted", true] },
                  then: 1000,
                },
                // Premium subscription sellers
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$subscriptionPlan.planType", 0] },
                      "premium",
                    ],
                  },
                  then: 800,
                },
                // Pro subscription sellers
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$subscriptionPlan.planType", 0] },
                      "pro",
                    ],
                  },
                  then: 900,
                },
                // Basic subscription sellers
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$subscriptionPlan.planType", 0] },
                      "basic",
                    ],
                  },
                  then: 600,
                },
                // Free tier sellers
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$subscriptionPlan.planType", 0] },
                      "free",
                    ],
                  },
                  then: 400,
                },
              ],
              default: 200, // No subscription
            },
          },
        },
      },

      // Secondary sorting criteria
      {
        $addFields: {
          finalScore: {
            $add: [
              "$rankingScore",
              // Boost for featured products
              { $cond: [{ $eq: ["$isFeatured", true] }, 100, 0] },
              // Boost for higher ratings
              { $multiply: ["$ratings.average", 10] },
              // Boost for recent products
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$createdAt"] },
                      86400000, // 24 hours in milliseconds
                    ],
                  },
                  -1, // Negative to boost newer products
                ],
              },
              // Boost for view count
              { $multiply: [{ $log10: { $add: ["$stats.views", 1] } }, 5] },
            ],
          },
        },
      },
    ];

    // Add sorting
    let sortStage = {};
    switch (sortBy) {
      case "price_low":
        sortStage = { "pricing.basePrice": 1, finalScore: -1 };
        break;
      case "price_high":
        sortStage = { "pricing.basePrice": -1, finalScore: -1 };
        break;
      case "newest":
        sortStage = { createdAt: -1, finalScore: -1 };
        break;
      case "rating":
        sortStage = { "ratings.average": -1, finalScore: -1 };
        break;
      default:
        // relevance
        sortStage = { finalScore: -1, createdAt: -1 };
    }

    pipeline.push({ $sort: sortStage });

    // Add pagination
    if (!infiniteScroll) {
      pipeline.push({ $skip: skip });
    }
    pipeline.push({ $limit: limitNum });

    // Clean up response fields
    pipeline.push({
      $project: {
        title: 1,
        slug: 1,
        description: 1,
        shortDescription: 1,
        type: 1,
        condition: 1,
        pricing: 1,
        "media.images": { $slice: ["$media.images", 3] }, // Only first 3 images
        location: 1,
        dynamicFields: 1,
        tags: 1,
        status: 1,
        visibility: 1,
        isPromoted: 1,
        isFeatured: 1,
        stats: 1,
        ratings: 1,
        createdAt: 1,
        updatedAt: 1,
        "sellerInfo._id": 1,
        "sellerInfo.businessInfo.businessName": 1,
        "sellerInfo.ratings": 1,
        "sellerInfo.verification": 1,
        "sellerInfo.location.county": 1,
        "sellerInfo.location.subcounty": 1,
        subscriptionType: 1,
        rankingScore: 1,
      },
    });

    // Execute aggregation
    const products = await Product.aggregate(pipeline);

    // Get total count for pagination (separate query for performance)
    const totalProducts = await Product.countDocuments(filter);

    // Calculate pagination info
    const totalPages = Math.ceil(totalProducts / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages,
        hasNext,
        hasPrev,
        limit: limitNum,
      },
      filters: {
        applied: {
          search,
          category,
          subcategory,
          type,
          condition,
          priceRange: { min: minPrice, max: maxPrice },
          location: { county, subcounty },
          radius: latitude && longitude ? radius : null,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get single product
// @access  Public
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate({
        path: "seller",
        select:
          "firstName lastName businessInfo status ratings verification location socialLinks",
        populate: {
          path: "currentSubscription",
          populate: {
            path: "plan",
            select: "name planType",
          },
        },
      })
      .populate("primaryCategory")
      .populate("secondaryCategories")
      .exec();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if product is active and seller is active
    if (product.status !== "active" || product.seller.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Product not available",
      });
    }

    // Increment view count
    await Product.findByIdAndUpdate(req.params.id, {
      $inc: { "stats.views": 1, "stats.uniqueViews": 1 },
      $set: { "stats.lastViewed": new Date() },
    });

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Seller only
const createProduct = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Check if seller exists and is active
    const seller = await Seller.findById(sellerId).populate(
      "currentSubscription"
    );
    if (!seller || seller.status !== "active" || !seller.isActive) {
      return res.status(403).json({
        success: false,
        message: "Seller account not active",
      });
    }

    // Check subscription limits
    if (seller.currentSubscription) {
      const activeProducts = await Product.countDocuments({
        seller: sellerId,
        status: { $in: ["active", "pending_approval"] },
      });

      const subscription = await UserSubscription.findById(
        seller.currentSubscription
      ).populate("plan");

      if (subscription && subscription.subscribedFeatures.maxListings) {
        if (
          !subscription.subscribedFeatures.unlimitedListings &&
          activeProducts >= subscription.subscribedFeatures.maxListings
        ) {
          return res.status(400).json({
            success: false,
            message: `You have reached your listing limit of ${subscription.subscribedFeatures.maxListings}. Upgrade your plan to list more products.`,
          });
        }
      }
    }

    const {
      title,
      description,
      shortDescription,
      type,
      condition,
      primaryCategory,
      secondaryCategories,
      pricing,
      location,
      dynamicFields,
      tags,
      keywords,
      inventory,
      serviceInfo,
    } = req.body;
    const parsedPricing = JSON.parse(pricing);

    // Validation
    if (
      !title ||
      !description ||
      !type ||
      !primaryCategory ||
      !parsedPricing.basePrice
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: title, description, type, category, and price",
      });
    }

    // Validate category exists
    const category = await Category.findById(primaryCategory);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Generate slug
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") +
      "-" +
      Math.random().toString(36).substr(2, 9);

    // Handle image uploads
    let images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];

        images.push({
          url: `${process.env.API_DOMAIN}/${file.path}`,
          publicId: null, // Not used anymore
          alt: file.originalname, // Alt text from original filename
          isPrimary: i === 0, // First image is primary
          order: i,
        });
      }
    }

    const productData = {
      title,
      slug,
      description,
      shortDescription,
      type,
      condition: condition || "new",
      seller: sellerId,
      primaryCategory,
      secondaryCategories: JSON.parse(secondaryCategories) || [],
      pricing: parsedPricing,
      location: {
        ...location,
        county: seller.location.county,
        subcounty: seller.location.subcounty,
      },
      media: { images },
      dynamicFields: dynamicFields || {},
      tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
      keywords: keywords
        ? keywords.split(",").map((keyword) => keyword.trim())
        : [],
      inventory: inventory || {},
      serviceInfo: type === "service" ? serviceInfo : undefined,
      status: "pending_approval", // All products need approval
    };

    const product = await Product.create(productData);

    // Update seller's active products count
    await Seller.findByIdAndUpdate(sellerId, {
      $inc: { "activity.totalProducts": 1 },
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully and is pending approval",
      product,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Seller (own products) or Admin
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check ownership (seller can only update their own products)
    if (
      req.user.userType === "seller" &&
      product.seller.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this product",
      });
    }

    const {
      title,
      description,
      shortDescription,
      condition,
      pricing,
      dynamicFields,
      tags,
      keywords,
      inventory,
      serviceInfo,
      status,
      primaryCategory,
      secondaryCategory
    } = req.body;
    console.log(req.body);

    // Handle image uploads (if any new images)
    if (req.files && req.files.length > 0) {
      // Build new image data using local file paths
      const newImages = req.files.map((file, index) => ({
        url: `${process.env.API_DOMAIN}/${file.path}`,
        publicId: null,
        alt: file.originalname, // Use original filename
        isPrimary: index === 0, // First image is primary
        order: index,
      }));

      product.media.images = newImages;
    }

    // Update fields
    if (title) {
      product.title = title;
      // Update slug if title changed
      product.slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") +
        "-" +
        Math.random().toString(36).substr(2, 9);
    }
    if (description) product.description = description;
    if (primaryCategory) product.primaryCategory = primaryCategory;
    if (secondaryCategory) product.secondaryCategories = [secondaryCategory];
    if (shortDescription) product.shortDescription = shortDescription;
    if (condition) product.condition = condition;
    if (pricing) product.pricing = { ...product.pricing, ...pricing };
    if (dynamicFields) product.dynamicFields = dynamicFields;
    if (tags) product.tags = tags.split(",").map((tag) => tag.trim());
    if (keywords)
      product.keywords = keywords.split(",").map((keyword) => keyword.trim());
    if (inventory) product.inventory = { ...product.inventory, ...inventory };
    if (serviceInfo)
      product.serviceInfo = { ...product.serviceInfo, ...serviceInfo };

    // Only admins can change status
    if (status && req.user.userType === "admin") {
      product.status = status;
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Seller (own products) or Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

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
        message: "Not authorized to delete this product",
      });
    }

    // Delete images from cloudinary
    if (product.media.images) {
      for (const image of product.media.images) {
        if (image.publicId) {
          await cloudinary.uploader.destroy(image.publicId);
        }
      }
    }

    await product.deleteOne();

    // Update seller's product count
    await Seller.findByIdAndUpdate(product.seller, {
      $inc: { "activity.totalProducts": -1 },
    });

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get seller's products
// @route   GET /api/products/seller/:sellerId
// @access  Public
const getSellerProducts = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 40, status = "active" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = { seller: sellerId };

    // If not the seller themselves or admin, only show active products
    if (req.user?.id !== sellerId && req.user?.userType !== "admin") {
      filter.status = "active";
    } else if (status) {
      filter.status = status;
    }

    // get seller info aswell for website display

    const products = await Product.find(filter)
      .populate("primaryCategory", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select("-media.images.publicId"); // Don't expose cloudinary IDs

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limitNum);

    res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Search products with category grouping
// @route   GET /api/search/products
// @access  Public
const searchProducts = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const query = req.query.search;
    console.log(req.query);

    // Validation
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      });
    }

    const searchTerm = query.trim();
    const searchRegex = new RegExp(searchTerm, "i");

    // Find products matching the search term
    const matchingProducts = await Product.aggregate([
      {
        $match: {
          status: "active",
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { tags: { $in: [searchRegex] } },
            { keywords: { $in: [searchRegex] } },
            { shortDescription: searchRegex },
          ],
        },
      },

      // Lookup seller information to ensure active sellers
      {
        $lookup: {
          from: "sellers",
          localField: "seller",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: "$sellerInfo" },

      // Only include active sellers
      {
        $match: {
          "sellerInfo.status": "active",
          // "sellerInfo.isActive": true,
        },
      },

      // Lookup primary category information
      {
        $lookup: {
          from: "categories",
          localField: "primaryCategory",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: "$categoryInfo" },

      // Lookup parent category if it exists
      {
        $lookup: {
          from: "categories",
          localField: "categoryInfo.parentCategory",
          foreignField: "_id",
          as: "parentCategoryInfo",
        },
      },

      // Group by category to count products per category
      {
        $group: {
          _id: {
            categoryId: "$categoryInfo._id",
            categoryName: "$categoryInfo.name",
            categorySlug: "$categoryInfo.slug",
            parentCategoryId: { $arrayElemAt: ["$parentCategoryInfo._id", 0] },
            parentCategoryName: {
              $arrayElemAt: ["$parentCategoryInfo.name", 0],
            },
            parentCategorySlug: {
              $arrayElemAt: ["$parentCategoryInfo.slug", 0],
            },
          },
          productCount: { $sum: 1 },
          sampleProducts: {
            $push: {
              _id: "$_id",
              title: "$title",
              slug: "$slug",
              pricing: "$pricing",
              images: { $slice: ["$media.images", 1] }, // First image only
              location: "$location",
              createdAt: "$createdAt",
            },
          },
        },
      },

      // Limit sample products per category
      {
        $addFields: {
          sampleProducts: { $slice: ["$sampleProducts", parseInt(limit)] },
        },
      },

      // Sort by product count (most relevant categories first)
      { $sort: { productCount: -1 } },

      // Limit to top 10 categories
      { $limit: 10 },

      // Format the output
      {
        $project: {
          _id: 0,
          category: {
            id: "$_id.categoryId",
            name: "$_id.categoryName",
            slug: "$_id.categorySlug",
          },
          parentCategory: {
            id: "$_id.parentCategoryId",
            name: "$_id.parentCategoryName",
            slug: "$_id.parentCategorySlug",
          },
          productCount: 1,
          searchSuggestion: {
            $concat: [
              searchTerm,
              " in ",
              {
                $cond: {
                  if: { $ne: ["$_id.parentCategoryName", null] },
                  then: "$_id.parentCategoryName",
                  else: "$_id.categoryName",
                },
              },
            ],
          },
          displayCategory: {
            $cond: {
              if: { $ne: ["$_id.parentCategoryName", null] },
              then: "$_id.parentCategoryName",
              else: "$_id.categoryName",
            },
          },
          sampleProducts: 1,
        },
      },
    ]);

    // Also get direct product matches for instant results
    const directMatches = await Product.find({
      status: "active",
      $or: [{ title: searchRegex }, { tags: { $in: [searchRegex] } }],
    })
      .populate(
        "seller",
        "firstName lastName businessInfo.businessName isActive status"
      )
      .populate("primaryCategory", "name slug")
      .select("title slug pricing media.images location createdAt")
      .limit(5)
      .sort({ createdAt: -1 });

    // Filter out products from inactive sellers
    const filteredDirectMatches = directMatches.filter(
      (product) =>
        product.seller &&
        product.seller.isActive &&
        product.seller.status === "active"
    );

    // Get total count of matching products
    const totalMatches = await Product.aggregate([
      {
        $match: {
          status: "active",
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { tags: { $in: [searchRegex] } },
            { keywords: { $in: [searchRegex] } },
            { shortDescription: searchRegex },
          ],
        },
      },
      {
        $lookup: {
          from: "sellers",
          localField: "seller",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: "$sellerInfo" },
      {
        $match: {
          "sellerInfo.status": "active",
          "sellerInfo.isActive": true,
        },
      },
      {
        $count: "total",
      },
    ]);

    const totalCount = totalMatches[0]?.total || 0;

    res.status(200).json({
      success: true,
      searchQuery: searchTerm,
      totalProducts: totalCount,
      categorySuggestions: matchingProducts,
      directMatches: filteredDirectMatches,
      suggestionsCount: matchingProducts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
  searchProducts,
};
