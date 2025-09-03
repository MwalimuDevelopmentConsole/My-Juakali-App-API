const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// SELLERS MODEL (Comprehensive business profiles)
const sellerSchema = new Schema(
  {
    // Essential Information
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["seller"],
      default: "seller",
    },

    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    nationalId: {
      type: String,
      trim: true,
      sparse: true,
      select: false, // Sensitive data
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },

    // Profile
    avatar: {
      url: String,
      publicId: String,
      alt: String,
    },
    bio: {
      type: String,
      maxlength: 1000,
    },

    // Business Information
    businessInfo: {
      businessName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
        index: true,
      },
      businessType: {
        type: String,
        enum: ["individual", "partnership", "company", "cooperative"],
        required: true,
      },
      businessRegistration: String,
      taxPin: String,
      businessLicense: String,
      specialties: {
        type: [String],
        required: true,
        index: true,
      }, // e.g., ["welding", "furniture making", "tailoring"]
      yearsOfExperience: {
        type: Number,
        min: 0,
        max: 50,
      },
      employees: {
        type: Number,
        min: 1,
        default: 1,
      },
      workingHours: {
        monday: { open: String, close: String, isOpen: Boolean },
        tuesday: { open: String, close: String, isOpen: Boolean },
        wednesday: { open: String, close: String, isOpen: Boolean },
        thursday: { open: String, close: String, isOpen: Boolean },
        friday: { open: String, close: String, isOpen: Boolean },
        saturday: { open: String, close: String, isOpen: Boolean },
        sunday: { open: String, close: String, isOpen: Boolean },
      },
    },

    // Location Information
    location: {
      county: {
        type: String,
        required: true,
        index: true,
      },
      subcounty: {
        type: String,
        required: true,
        index: true,
      },
      ward: String,
      address: String,
      landmark: String,
      // coordinates: {
      //   type: {
      //     type: String,
      //     enum: ["Point"],
      //     default: "Point",
      //   },
      //   coordinates: {
      //     type: [Number], // [longitude, latitude]
      //     index: "2dsphere",
      //   },
      // },
      isPinned: {
        type: Boolean,
        default: false,
      },
      serviceRadius: {
        type: Number,
        default: 10, // kilometers
      },
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "banned"],
      default: "pending",
      index: true,
    },

    capabilities: {
      customOrders: { type: Boolean, default: false },
      bulkOrders: { type: Boolean, default: false },
      canDeliver: { type: Boolean, default: false },
      freeEstimates: { type: Boolean, default: false },
      onSiteServices: { type: Boolean, default: false },
    },

    // Verification & Trust
    verification: {
      email: {
        verified: {
          type: Boolean,
          default: false,
        },
        token: {
          type: String,
          select: false,
        },
        tokenExpires: {
          type: Date,
          select: false,
        },
      },
      phone: {
        verified: {
          type: Boolean,
          default: false,
        },
        code: {
          type: String,
          select: false,
        },
        codeExpires: {
          type: Date,
          select: false,
        },
      },
      identity: {
        verified: {
          type: Boolean,
          default: false,
        },
        documents: [
          {
            type: {
              type: String,
              enum: ["national_id", "passport", "driving_license"],
            },
            url: String,
            publicId: String,
            status: {
              type: String,
              enum: ["pending", "approved", "rejected"],
              default: "pending",
            },
            rejectionReason: String,
            uploadedAt: {
              type: Date,
              default: Date.now,
            },
            verifiedAt: Date,
            verifiedBy: {
              type: Schema.Types.ObjectId,
              ref: "Admin",
            },
          },
        ],
      },
      business: {
        verified: {
          type: Boolean,
          default: false,
        },
        documents: [
          {
            type: {
              type: String,
              enum: ["business_permit", "tax_certificate", "trade_license"],
            },
            url: String,
            publicId: String,
            status: {
              type: String,
              enum: ["pending", "approved", "rejected"],
              default: "pending",
            },
            rejectionReason: String,
            uploadedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    },

    // Ratings & Reviews
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
        index: true,
      },
      count: {
        type: Number,
        default: 0,
      },
      breakdown: {
        communication: { type: Number, default: 0, min: 0, max: 5 },
        quality: { type: Number, default: 0, min: 0, max: 5 },
        timeliness: { type: Number, default: 0, min: 0, max: 5 },
        professionalism: { type: Number, default: 0, min: 0, max: 5 },
      },
    },

    // Subscription Information (Reference to UserSubscription)
    currentSubscription: {
      type: Schema.Types.ObjectId,
      ref: "SellerSubscription",
    },
    subscriptionHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "SellerSubscription",
      },
    ],

    // Activity & Performance
    activity: {
      lastLogin: Date,
      lastActive: Date,
      loginCount: {
        type: Number,
        default: 0,
      },
      profileViews: {
        type: Number,
        default: 0,
      },
      totalProducts: {
        type: Number,
        default: 0,
      },
      activeProducts: {
        type: Number,
        default: 0,
      },
      totalSales: {
        type: Number,
        default: 0,
      },
      totalRevenue: {
        type: Number,
        default: 0,
      },
    },

    // Preferences
    preferences: {
      currency: {
        type: String,
        default: "KES",
      },
      notifications: {
        email: {
          newInquiry: { type: Boolean, default: true },
          newReview: { type: Boolean, default: true },
          subscriptionReminder: { type: Boolean, default: true },
          promotions: { type: Boolean, default: true },
        },
        sms: {
          newInquiry: { type: Boolean, default: true },
          urgentUpdates: { type: Boolean, default: true },
        },
        push: {
          newMessage: { type: Boolean, default: true },
          newInquiry: { type: Boolean, default: true },
        },
      },
      privacy: {
        showLocation: {
          type: Boolean,
          default: true,
        },
        showPhone: {
          type: Boolean,
          default: true,
        },
        allowDirectContact: {
          type: Boolean,
          default: true,
        },
        showBusinessHours: {
          type: Boolean,
          default: true,
        },
      },
    },

    // Security
    security: {
      lastPasswordChange: Date,
      loginAttempts: {
        type: Number,
        default: 0,
      },
      lockUntil: Date,
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      ipWhitelist: [String],
      suspiciousActivity: [
        {
          type: String,
          timestamp: { type: Date, default: Date.now },
          ipAddress: String,
          userAgent: String,
        },
      ],
    },

    // Referral Information
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "Marketer",
    },
    referralDate: Date,

    // Portfolio & Showcase
    portfolio: [
      {
        title: {
          type: String,
          required: true,
          maxlength: 100,
        },
        description: {
          type: String,
          maxlength: 500,
        },
        images: [
          {
            url: String,
            publicId: String,
            alt: String,
          },
        ],
        completedDate: Date,
        category: String,
        featured: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Social Links & Online Presence
    socialLinks: {
      facebook: String,
      instagram: String,
      youtube: String,
      tiktok: String,
      whatsapp: String,
      website: String,
    },

    // Search optimization
    searchKeywords: [String], // Auto-generated from specialties, business name, etc.

    // Payment Information
    paymentInfo: {
      mpesa: {
        number: String,
        name: String,
      },
      bank: {
        accountNumber: String,
        accountName: String,
        bankName: String,
        branchCode: String,
      },
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Indexes for performance and search
sellerSchema.index({ email: 1 });
sellerSchema.index({ phone: 1 });
sellerSchema.index({
  "businessInfo.businessName": "text",
  firstName: "text",
  lastName: "text",
  bio: "text",
  "businessInfo.specialties": "text",
});
sellerSchema.index({ "businessInfo.specialties": 1 });
// sellerSchema.index({ "location.coordinates": "2dsphere" });
sellerSchema.index({ "location.county": 1, "location.subcounty": 1 });
sellerSchema.index({ "ratings.average": -1 });
sellerSchema.index({ status: 1, isActive: 1 });
sellerSchema.index({ currentSubscription: 1 });
sellerSchema.index({ createdAt: -1 });

// Virtual fields
sellerSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

sellerSchema.virtual("isLocked").get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

sellerSchema.virtual("verificationScore").get(function () {
  let score = 0;
  if (this.verification.email.verified) score += 20;
  if (this.verification.phone.verified) score += 20;
  if (this.verification.identity.verified) score += 30;
  if (this.verification.business.verified) score += 30;
  return score;
});

module.exports = mongoose.model("Seller", sellerSchema);
