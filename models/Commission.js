const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// COMMISSIONS MODEL (for marketers)
const commissionSchema = new Schema({
  marketer: {
    type: Schema.Types.ObjectId,
    ref: 'Marketer',
    required: true,
    index: true
  },
  referredSeller: {
    type: Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  subscription: {
    type: Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  
  // Commission details
  commissionAmount: {
    type: Number,
    required: true
  },
  commissionRate: {
    type: Number,
    required: true
  },
  subscriptionAmount: {
    type: Number,
    required: true
  },
  
  // Period
  period: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Payment details
  paidAt: Date,
  paymentReference: String,
  paymentMethod: String,
  
  // Dates
  earnedDate: {
    type: Date,
    default: Date.now
  },
  dueDate: Date
}, {
  timestamps: true
});

commissionSchema.index({ marketer: 1, status: 1 });
commissionSchema.index({ referredUser: 1 });
commissionSchema.index({ earnedDate: -1 });

module.exports = mongoose.model('Commission', commissionSchema);