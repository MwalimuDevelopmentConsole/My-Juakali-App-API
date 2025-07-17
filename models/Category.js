const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// CATEGORIES & SUBCATEGORIES MODEL
const categorySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  description: String,
  image: {
    url: String,
    publicId: String, // For Cloudinary
    alt: String
  },
  icon: String, // Icon class or SVG
  parentCategory: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    default: null // null means it's a parent category
  },
  level: {
    type: Number,
    default: 0 // 0 = parent, 1 = subcategory, 2 = sub-subcategory
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  // Dynamic fields that products in this category should have
  dynamicFields: [{
    name: String, // e.g., "material", "color", "size"
    type: {
      type: String,
      enum: ['text', 'number', 'select', 'multiselect', 'boolean', 'color', 'range']
    },
    required: {
      type: Boolean,
      default: false
    },
    options: [String], // For select/multiselect types
    validation: {
      min: Number,
      max: Number,
      pattern: String
    }
  }],
  // SEO and search optimization
  metaTitle: String,
  metaDescription: String,
  keywords: [String],
  searchTerms: [String], // For enhanced search
  productCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
categorySchema.index({ name: 'text', description: 'text', keywords: 'text' });
categorySchema.index({ parentCategory: 1, isActive: 1 });
categorySchema.index({ level: 1, sortOrder: 1 });

// Virtual for subcategories
categorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory'
});

module.exports = mongoose.model('Category', categorySchema);