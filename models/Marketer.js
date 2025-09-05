const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// MARKETERS MODEL (Affiliate marketers)
const marketerSchema = new Schema(
  {
    // Essential Information
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    nationalId: {
      type: String,
      trim: true,
      select: false,
    },

    // Profile
    avatar: {
      url: String,
      publicId: String,
      alt: String,
    },
    bio: {
      type: String,
      maxlength: 500,
    },

    role: {
      type: String,
      enum: ["marketer", "senior_marketer"],
      default: "marketer",
    },

    // Location
    location: {
      county: {
        type: String,
        required: true,
      },
      subcounty: String,
      town: String,
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

    // Verification
    verification: {
      email: {
        verified: { type: Boolean, default: false },
        token: { type: String, select: false },
        tokenExpires: { type: Date, select: false },
      },
      phone: {
        verified: { type: Boolean, default: false },
        code: { type: String, select: false },
        codeExpires: { type: Date, select: false },
      },
      identity: {
        verified: { type: Boolean, default: false },
        documents: [
          {
            type: String,
            url: String,
            status: {
              type: String,
              enum: ["pending", "approved", "rejected"],
              default: "pending",
            },
            uploadedAt: { type: Date, default: Date.now },
          },
        ],
      },
    },

    // Marketer-specific Information
    marketerInfo: {
      referralCode: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        index: true,
      },
      // Performance Metrics
      performance: {
        totalReferrals: {
          type: Number,
          default: 0,
        },
        activeReferrals: {
          type: Number,
          default: 0,
        },
        successfulConversions: {
          type: Number,
          default: 0,
        },
        conversionRate: {
          type: Number,
          default: 0,
        },
        totalCommissionsEarned: {
          type: Number,
          default: 0,
        },
        totalCommissionsPaid: {
          type: Number,
          default: 0,
        },
        pendingCommissions: {
          type: Number,
          default: 0,
        },
      },

      // Commission Structure
      commission: {
        rate: {
          type: Number,
          default: 0.15, // 15%
          min: 0,
          max: 1,
        },
        type: {
          type: String,
          enum: ["percentage", "fixed_amount"],
          default: "percentage",
        },
        fixedAmount: Number,
        duration: {
          type: String,
          enum: ["lifetime", "limited"],
          default: "limited",
        },
        durationMonths: {
          type: Number,
          default: 12, // 12 months commission
        },
        minimumPayout: {
          type: Number,
          default: 1000, // KES 1000 minimum
        },
      },

      // Territory & Specialization
      territory: {
        counties: [String], // Counties they focus on
        specializations: [String], // Types of sellers they target
        exclusiveTerritory: {
          type: Boolean,
          default: false,
        },
      },

      // Marketing Tools & Resources
      marketing: {
        hasTraining: {
          type: Boolean,
          default: false,
        },
        trainingCompletedAt: Date,
        marketingMaterials: [
          {
            type: String,
            url: String,
            name: String,
          },
        ],
        customReferralLink: String,
        qrCode: String,
      },
    },

    // Payment Information
    paymentInfo: {
      preferredMethod: {
        type: String,
        enum: ["mpesa", "bank_transfer", "cheque"],
        default: "mpesa",
      },
      mpesa: {
        number: String,
        name: String,
      },
      bank: {
        accountNumber: String,
        accountName: String,
        bankName: String,
        branchCode: String,
        swiftCode: String,
      },
      taxInfo: {
        kraPin: String,
        hasCertificate: {
          type: Boolean,
          default: false,
        },
      },
    },

    // Activity & Performance
    activity: {
      lastLogin: Date,
      lastActive: Date,
      loginCount: {
        type: Number,
        default: 0,
      },
      referralsSentThisMonth: {
        type: Number,
        default: 0,
      },
      lastReferralDate: Date,
      topPerformingMonth: {
        month: String,
        year: Number,
        referrals: Number,
        commissions: Number,
      },
    },

    // Communication & Training
    communication: {
      preferredLanguage: {
        type: String,
        enum: ["en", "sw", "ki"],
        default: "en",
      },
      contactPreference: {
        type: String,
        enum: ["whatsapp", "sms", "call", "email"],
        default: "whatsapp",
      },
      weeklyReports: {
        type: Boolean,
        default: true,
      },
      monthlyReviews: {
        type: Boolean,
        default: true,
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
      suspiciousActivity: [
        {
          type: String,
          timestamp: { type: Date, default: Date.now },
          description: String,
        },
      ],
    },

    // Manager & Support
    assignedManager: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Agreement & Legal
    agreement: {
      signed: {
        type: Boolean,
        default: false,
      },
      signedAt: Date,
      version: String,
      ipAddress: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.nationalId;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
marketerSchema.index({ email: 1 });
marketerSchema.index({ phone: 1 });
marketerSchema.index({ "marketerInfo.referralCode": 1 });
marketerSchema.index({ status: 1, isActive: 1 });
marketerSchema.index({ "location.county": 1 });
marketerSchema.index({ "marketerInfo.performance.totalReferrals": -1 });
marketerSchema.index({ createdAt: -1 });

// Virtual fields
marketerSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

marketerSchema.virtual("isLocked").get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

marketerSchema.virtual("activeCommissionRate").get(function () {
  return this.marketerInfo.commission.rate * 100; // Return as percentage
});

module.exports = mongoose.model("Marketer", marketerSchema);
