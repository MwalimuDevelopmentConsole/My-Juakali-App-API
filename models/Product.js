const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// PRODUCTS/SERVICES MODEL
const productSchema = new Schema(
  {
    // Basic Information
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    shortDescription: {
      type: String,
      maxlength: 200,
    },

    // Product Type
    type: {
      type: String,
      enum: ["product", "service"],
      required: true,
      index: true,
    },
    condition: {
      type: String,
      enum: ["new", "used", "refurbished", "not_applicable"],
      default: "new",
    },

    // Seller Information
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },

    // Categories (Many-to-Many relationship)
    primaryCategory: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    secondaryCategories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    // Pricing Information
    pricing: {
      basePrice: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "KES",
      },
      priceType: {
        type: String,
        enum: [
          "fixed",
          "negotiable",
          "quotation",
          "hourly",
          "daily",
          "per_project",
        ],
        default: "fixed",
      },
      minPrice: Number, // For ranges
      maxPrice: Number,
      // For services
      hourlyRate: Number,
      dailyRate: Number,
      minimumOrder: Number,
      // Discounts
      discountPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      originalPrice: Number,
    },

    // Images and Media
    media: {
      images: [
        {
          url: {
            type: String,
            required: true,
          },
          publicId: String,
          alt: String,
          isPrimary: {
            type: Boolean,
            default: false,
          },
          order: {
            type: Number,
            default: 0,
          },
        },
      ],
      videos: [
        {
          url: String,
          platform: {
            type: String,
            enum: ["youtube", "vimeo", "facebook", "instagram", "direct"],
          },
          thumbnail: String,
          title: String,
        },
      ],
      documents: [
        {
          url: String,
          name: String,
          type: String, // PDF, DOC, etc.
        },
      ],
    },

    // Dynamic Fields (based on category)
    dynamicFields: Schema.Types.Mixed, // Flexible structure for category-specific fields

    // Inventory (for products)
    inventory: {
      quantity: {
        type: Number,
        default: 1,
      },
      sku: String,
      trackQuantity: {
        type: Boolean,
        default: false,
      },
      lowStockAlert: Number,
      inStock: {
        type: Boolean,
        default: true,
      },
    },

    // Service-specific fields
    serviceInfo: {
      duration: String, // e.g., "2 hours", "1 day", "1 week"
      availability: {
        monday: { available: Boolean, hours: String },
        tuesday: { available: Boolean, hours: String },
        wednesday: { available: Boolean, hours: String },
        thursday: { available: Boolean, hours: String },
        friday: { available: Boolean, hours: String },
        saturday: { available: Boolean, hours: String },
        sunday: { available: Boolean, hours: String },
      },
      responseTime: String, // "within 1 hour", "same day", etc.
      serviceArea: [String], // Areas they serve
      requirements: String, // What customer needs to provide
      portfolio: [
        {
          title: String,
          description: String,
          images: [String],
          completedDate: Date,
        },
      ],
    },

    // SEO and Search
    tags: [String],
    keywords: [String],
    searchTerms: [String], // Auto-generated for better search
    metaTitle: String,
    metaDescription: String,

    // Status and Visibility
    status: {
      type: String,
      enum: [
        "draft",
        "active",
        "inactive",
        "pending_approval",
        "rejected",
        "sold",
        "suspended",
      ],
      default: "pending_approval",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private", "featured", "promoted"],
      default: "public",
    },
    isPromoted: {
      type: Boolean,
      default: false,
    },
    promotionExpiry: Date,
    isFeatured: {
      type: Boolean,
      default: false,
    },
    featureExpiry: Date,

    // Statistics
    stats: {
      views: {
        type: Number,
        default: 0,
      },
      inquiries: {
        type: Number,
        default: 0,
      },
      favorites: {
        type: Number,
        default: 0,
      },
      shares: {
        type: Number,
        default: 0,
      },
      uniqueViews: {
        type: Number,
        default: 0,
      },
      lastViewed: Date,
    },

    // Ratings and Reviews
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },

    // Moderation
    flags: [
      {
        reason: String,
        reporter: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        date: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "resolved", "dismissed"],
          default: "pending",
        },
      },
    ],

    // Boost and promotion settings
    boost: {
      isActive: {
        type: Boolean,
        default: false,
      },
      multiplier: {
        type: Number,
        default: 1,
      },
      expiresAt: Date,
      type: {
        type: String,
        enum: ["none", "basic", "premium", "top"],
      },
    },

    suspensionReason: String,

    // Expiry and renewal
    expiresAt: Date,
    autoRenew: {
      type: Boolean,
      default: false,
    },
    renewalCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Comprehensive indexes for performance
productSchema.index({
  title: "text",
  description: "text",
  tags: "text",
  keywords: "text",
});
productSchema.index({ seller: 1, status: 1 });
productSchema.index({ primaryCategory: 1, status: 1 });
productSchema.index({ type: 1, status: 1 });
productSchema.index({ "location.coordinates": "2dsphere" });
productSchema.index({ "location.county": 1, "location.subcounty": 1 });
productSchema.index({ "pricing.basePrice": 1 });
productSchema.index({ status: 1, visibility: 1, createdAt: -1 });
productSchema.index({ isPromoted: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ "stats.views": -1 });
productSchema.index({ "ratings.average": -1 });
productSchema.index({ expiresAt: 1 });

// Virtual for primary image
productSchema.virtual("primaryImage").get(function () {
  const images = this.media?.images;
  if (!Array.isArray(images)) return null;

  return images.find((img) => img.isPrimary) || images[0] || null;
});

module.exports = mongoose.model("Product", productSchema);
