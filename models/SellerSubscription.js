const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// USER SUBSCRIPTIONS MODEL (Individual user subscriptions)
const userSubscriptionSchema = new Schema(
  {
    // User & Plan Reference
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: "userType",
    },
    userType: {
      type: String,
      enum: ["Seller", "Marketer"], // Only sellers and marketers have subscriptions
      required: true,
    },

    plan: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },

    // Subscription Details
    status: {
      type: String,
      enum: [
        "active",
        "cancelled",
        "expired",
        "suspended",
        "trial",
        "past_due",
      ],
      default: "active",
      index: true,
    },

    // Billing Information
    billing: {
      amount: {
        type: Number,
        required: true,
      },
      currency: {
        type: String,
        default: "KES",
      },
      cycle: {
        type: String,
        enum: ["monthly", "quarterly", "yearly", "lifetime"],
        required: true,
      },
      nextBillingDate: Date,
      lastBillingDate: Date,
      billingHistory: [
        {
          date: Date,
          amount: Number,
          status: {
            type: String,
            enum: ["success", "failed", "pending", "refunded"],
          },
          paymentMethod: String,
          transactionId: String,
          failureReason: String,
        },
      ],
    },

    // Subscription Period
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: Date,

    // Trial Information
    trial: {
      isTrialUser: {
        type: Boolean,
        default: false,
      },
      trialStartDate: Date,
      trialEndDate: Date,
      trialExtended: {
        type: Boolean,
        default: false,
      },
      convertedFromTrial: {
        type: Boolean,
        default: false,
      },
    },

    // Auto Renewal
    autoRenew: {
      type: Boolean,
      default: true,
    },
    renewalAttempts: {
      type: Number,
      default: 0,
    },

    // Payment Method
    paymentMethod: {
      type: String,
      enum: ["mpesa", "card", "bank_transfer", "admin_credit"],
      required: true,
    },
    paymentDetails: {
      mpesaNumber: String,
      cardLast4: String,
      bankAccount: String,
    },

    // Promotional Information
    appliedPromotion: {
      promotionId: Schema.Types.ObjectId,
      promotionName: String,
      discountType: String,
      discountValue: Number,
      appliedAt: Date,
    },

    // Plan Features (snapshot at subscription time)
    subscribedFeatures: Schema.Types.Mixed,

    // Usage Tracking
    usage: {
      listingsUsed: {
        type: Number,
        default: 0,
      },
      featuredAdsUsed: {
        type: Number,
        default: 0,
      },
      topAdsUsed: {
        type: Number,
        default: 0,
      },
      supportTicketsUsed: {
        type: Number,
        default: 0,
      },
      lastUsageReset: {
        type: Date,
        default: Date.now,
      },
    },

    // Cancellation Information
    cancellation: {
      requestedAt: Date,
      reason: String,
      feedback: String,
      cancelledBy: {
        type: Schema.Types.ObjectId,
        refPath: "cancellation.cancelledByType",
      },
      cancelledByType: {
        type: String,
        enum: ["Seller", "Admin"],
      },
      effectiveDate: Date, // When cancellation takes effect
      refundAmount: Number,
      refundProcessed: {
        type: Boolean,
        default: false,
      },
    },

    // Referral Information
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "Marketer",
    },
    referralDate: Date,

    // Subscription Changes History
    changeHistory: [
      {
        changeType: {
          type: String,
          enum: [
            "upgrade",
            "downgrade",
            "renewal",
            "cancellation",
            "reactivation",
            "suspension",
          ],
        },
        fromPlan: {
          type: Schema.Types.ObjectId,
          ref: "SubscriptionPlan",
        },
        toPlan: {
          type: Schema.Types.ObjectId,
          ref: "SubscriptionPlan",
        },
        reason: String,
        effectiveDate: Date,
        changedBy: {
          type: Schema.Types.ObjectId,
          refPath: "changeHistory.changedByType",
        },
        changedByType: {
          type: String,
          enum: ["Seller", "Admin", "System"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Notes & Comments
    adminNotes: [
      {
        note: String,
        addedBy: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        isPrivate: {
          type: Boolean,
          default: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
userSubscriptionSchema.index({ user: 1, userType: 1 });
userSubscriptionSchema.index({ plan: 1, status: 1 });
userSubscriptionSchema.index({ status: 1, endDate: 1 });
userSubscriptionSchema.index({ nextBillingDate: 1, status: 1 });
userSubscriptionSchema.index({ referredBy: 1 });

// Virtual for days remaining
userSubscriptionSchema.virtual("daysRemaining").get(function () {
  if (!this.endDate) return null;
  const now = new Date();
  const timeDiff = this.endDate.getTime() - now.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

// Virtual for is expired
userSubscriptionSchema.virtual("isExpired").get(function () {
  if (!this.endDate) return false;
  return new Date() > this.endDate;
});

// Method to check if feature is available
userSubscriptionSchema.methods.hasFeature = function (featureName) {
  return this.subscribedFeatures && this.subscribedFeatures[featureName];
};

// Method to check usage limits
userSubscriptionSchema.methods.canUseFeature = function (
  featureName,
  requestedAmount = 1
) {
  const feature = this.subscribedFeatures[featureName];
  if (!feature) return false;

  // Check if unlimited
  if (
    this.subscribedFeatures[
      `unlimited${featureName.charAt(0).toUpperCase() + featureName.slice(1)}`
    ]
  ) {
    return true;
  }

  // Check usage limits
  const currentUsage = this.usage[`${featureName}Used`] || 0;
  const limit =
    this.subscribedFeatures[
      `max${featureName.charAt(0).toUpperCase() + featureName.slice(1)}`
    ] || 0;

  return currentUsage + requestedAmount <= limit;
};

module.exports = mongoose.model("SellerSubscription", userSubscriptionSchema);
