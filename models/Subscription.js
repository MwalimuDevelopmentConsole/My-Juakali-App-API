const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// SUBSCRIPTIONS MODEL
const subscriptionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  plan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'pro'],
    required: true
  },
  
  // Billing information
  billing: {
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'KES'
    },
    interval: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      required: true
    },
    nextBillingDate: Date,
    lastBillingDate: Date
  },
  
  // Plan details
  features: {
    maxListings: Number,
    searchBoost: Number,
    canUploadVideos: Boolean,
    prioritySupport: Boolean,
    analytics: Boolean,
    topAds: Boolean,
    commissionRate: Number
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'suspended'],
    default: 'active',
    index: true
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  cancelledAt: Date,
  
  // Payment
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'card', 'bank_transfer'],
    required: true
  },
  
  // Auto renewal
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  // Referral tracking
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);