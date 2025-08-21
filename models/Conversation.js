const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// CONVERSATIONS MODEL (Updated with polymorphic references)
const conversationSchema = new Schema({
  participants: [{
    user: {
      userType: {
        type: String,
        enum: ['Buyer', 'Seller', 'Admin'],
        required: true
      },
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'participants.user.userType'
      }
    },
    lastRead: Date,
    unreadCount: {
      type: Number,
      default: 0
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Related product (for buyer-seller chats)
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },

  // Conversation metadata
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },

  // Conversation type
  type: {
    type: String,
    enum: ['product_inquiry', 'general', 'support'],
    default: 'product_inquiry'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'blocked'],
    default: 'active'
  },

  isDeleted: {
    type: Boolean,
    default: false
  },

  // Conversation settings
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowImageSharing: {
      type: Boolean,
      default: true
    },
    isTypingEnabled: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes
conversationSchema.index({ 'participants.user.userId': 1, 'participants.user.userType': 1 });
conversationSchema.index({ product: 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ type: 1, status: 1 });

module.exports= mongoose.model('Conversation', conversationSchema);