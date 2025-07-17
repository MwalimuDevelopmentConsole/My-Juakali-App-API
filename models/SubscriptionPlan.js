const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// SUBSCRIPTION PLANS MODEL (Master subscription plans)
const subscriptionPlanSchema = new Schema(
  {
    // Plan Identification
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    shortDescription: {
      type: String,
      maxlength: 100,
    },

    // Plan Type & Category
    planType: {
      type: String,
      enum: ["free", "basic", "premium", "pro", "enterprise", "custom"],
      required: true,
      index: true,
    },
    targetAudience: {
      type: String,
      enum: ["individual", "small_business", "medium_business", "enterprise"],
      default: "individual",
    },

    // Pricing Information
    pricing: {
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "KES",
      },
      billingCycle: {
        type: String,
        enum: ["monthly", "quarterly", "yearly", "lifetime"],
        required: true,
      },
      // Alternative pricing for different cycles
      pricingTiers: [
        {
          cycle: {
            type: String,
            enum: ["monthly", "quarterly", "yearly"],
          },
          amount: Number,
          discount: Number, // percentage discount from monthly
          savings: Number, // amount saved compared to monthly
        },
      ],
      setupFee: {
        type: Number,
        default: 0,
      },
      // Dynamic pricing based on demand/time
      dynamicPricing: {
        enabled: {
          type: Boolean,
          default: false,
        },
        basePrice: Number,
        currentMultiplier: {
          type: Number,
          default: 1,
          min: 0.1,
          max: 5,
        },
        lastUpdated: Date,
      },
    },

    // Plan Features & Limits
    features: {
      // Listing limits
      maxListings: {
        type: Number,
        required: true,
      },
      unlimitedListings: {
        type: Boolean,
        default: false,
      },

      // Search & Visibility
      searchBoost: {
        type: Number,
        default: 1,
        min: 1,
        max: 10,
      },
      priorityInSearch: {
        type: Boolean,
        default: false,
      },
      featuredListings: {
        type: Number,
        default: 0,
      },
      topAdsAllowed: {
        type: Boolean,
        default: false,
      },

      // Media & Content
      maxImages: {
        type: Number,
        default: 5,
      },
      videoUploads: {
        type: Boolean,
        default: false,
      },
      maxVideos: {
        type: Number,
        default: 0,
      },
      portfolioShowcase: {
        type: Boolean,
        default: false,
      },
      customBranding: {
        type: Boolean,
        default: false,
      },

      // Communication & Support
      prioritySupport: {
        type: Boolean,
        default: false,
      },
      dedicatedSupport: {
        type: Boolean,
        default: false,
      },
      phoneSupport: {
        type: Boolean,
        default: false,
      },
      messagingFeatures: {
        autoResponder: { type: Boolean, default: false },
        messageTemplates: { type: Boolean, default: false },
        bulkMessaging: { type: Boolean, default: false },
      },

      // Analytics & Insights
      basicAnalytics: {
        type: Boolean,
        default: false,
      },
      advancedAnalytics: {
        type: Boolean,
        default: false,
      },
      exportReports: {
        type: Boolean,
        default: false,
      },
      competitorInsights: {
        type: Boolean,
        default: false,
      },

      // Marketing Tools
      socialMediaIntegration: {
        type: Boolean,
        default: false,
      },
      seoOptimization: {
        type: Boolean,
        default: false,
      },
      emailMarketing: {
        type: Boolean,
        default: false,
      },
      promotionalTools: {
        type: Boolean,
        default: false,
      },

      // Business Features
      inventoryManagement: {
        type: Boolean,
        default: false,
      },
      orderManagement: {
        type: Boolean,
        default: false,
      },
      invoiceGeneration: {
        type: Boolean,
        default: false,
      },
      apiAccess: {
        type: Boolean,
        default: false,
      },
      webhooks: {
        type: Boolean,
        default: false,
      },
    },

    // Commission Structure
    commission: {
      rate: {
        type: Number,
        required: true,
        min: 0,
        max: 1, // Stored as decimal (0.05 = 5%)
      },
      type: {
        type: String,
        enum: ["percentage", "fixed_per_transaction", "hybrid"],
        default: "percentage",
      },
      fixedAmount: Number,
      minimumCommission: Number,
      maximumCommission: Number,
    },

    // Plan Status & Availability
    status: {
      type: String,
      enum: ["active", "inactive", "deprecated", "coming_soon"],
      default: "active",
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isBestValue: {
      type: Boolean,
      default: false,
    },

    // Availability & Restrictions
    availability: {
      startDate: Date,
      endDate: Date,
      limitedTime: {
        type: Boolean,
        default: false,
      },
      maxSubscribers: Number,
      currentSubscribers: {
        type: Number,
        default: 0,
      },
      geographicRestrictions: [String], // Counties where available
      userTypeRestrictions: [String], // Types of users who can subscribe
    },

    // Trial & Promotions
    trial: {
      enabled: {
        type: Boolean,
        default: false,
      },
      duration: Number, // in days
      features: Schema.Types.Mixed, // Trial-specific features
    },

    // Promotional Pricing
    promotions: [
      {
        name: String,
        description: String,
        discountType: {
          type: String,
          enum: ["percentage", "fixed_amount", "free_months"],
        },
        discountValue: Number,
        startDate: Date,
        endDate: Date,
        isActive: {
          type: Boolean,
          default: false,
        },
        maxUses: Number,
        currentUses: {
          type: Number,
          default: 0,
        },
        conditions: {
          newUsersOnly: { type: Boolean, default: false },
          minimumCommitment: Number, // months
          couponCode: String,
        },
      },
    ],

    // Plan Metadata
    metadata: {
      displayOrder: {
        type: Number,
        default: 0,
      },
      colorScheme: {
        primary: String,
        secondary: String,
        accent: String,
      },
      badge: String, // "Most Popular", "Best Value", etc.
      icon: String,
      categories: [String], // Tags for organization
      internalNotes: String,
    },

    // Version Control
    version: {
      type: String,
      default: "1.0",
    },
    previousVersions: [
      {
        version: String,
        changes: String,
        updatedAt: Date,
        updatedBy: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
      },
    ],

    // Created/Updated tracking
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
subscriptionPlanSchema.index({ planType: 1, status: 1 });
subscriptionPlanSchema.index({ "pricing.amount": 1 });
subscriptionPlanSchema.index({ displayOrder: 1, status: 1 });
subscriptionPlanSchema.index({ name: "text", description: "text" });

// Virtual for current effective price
subscriptionPlanSchema.virtual("effectivePrice").get(function () {
  if (this.pricing.dynamicPricing.enabled) {
    return (
      this.pricing.dynamicPricing.basePrice *
      this.pricing.dynamicPricing.currentMultiplier
    );
  }
  return this.pricing.amount;
});

// Virtual for active promotion
subscriptionPlanSchema.virtual("activePromotion").get(function () {
  const now = new Date();
  return this.promotions.find(
    (promo) =>
      promo.isActive &&
      promo.startDate <= now &&
      promo.endDate >= now &&
      (promo.maxUses === undefined || promo.currentUses < promo.maxUses)
  );
});

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
