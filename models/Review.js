const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// REVIEWS MODEL
const reviewSchema = new Schema({
  reviewer: {
    type: Schema.Types.ObjectId,
    ref: 'Buyer',
    required: true,
    index: true
  },
  reviewee: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    index: true
  },
  order: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Rating breakdown
  ratings: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  
  title: {
    type: String,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Media attachments
  images: [{
    url: String,
    publicId: String,
    alt: String
  }],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Helpful votes
  helpfulVotes: {
    type: Number,
    default: 0
  },
  votedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Response from seller
  response: {
    comment: String,
    date: Date
  },
  
  // Verification
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

reviewSchema.index({ reviewee: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ 'ratings.overall': -1 });

module.exports = mongoose.model('Review', reviewSchema);