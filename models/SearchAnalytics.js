const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// SEARCH ANALYTICS MODEL
const searchAnalyticsSchema = new Schema({
  query: {
    type: String,
    required: true,
    index: true
  },
  normalizedQuery: String, // Cleaned and normalized version
  user: {
    type: Schema.Types.ObjectId,
    ref: 'Buyer'
  },
  
  // Search context
  filters: {
    category: String,
    location: String,
    priceRange: {
      min: Number,
      max: Number
    },
    type: String // product or service
  },
  
  // Results
  resultsCount: {
    type: Number,
    default: 0
  },
  clickedResults: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    position: Number,
    clickedAt: Date
  }],
  
  // Metadata
  userAgent: String,
  ipAddress: String,
  sessionId: String,
  
  // Performance
  searchDuration: Number, // in milliseconds
  successful: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

searchAnalyticsSchema.index({ query: 1, createdAt: -1 });
searchAnalyticsSchema.index({ normalizedQuery: 1 });
searchAnalyticsSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SearchAnalytics', searchAnalyticsSchema);