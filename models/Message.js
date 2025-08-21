const { default: mongoose } = require("mongoose");
const Schema = mongoose.Schema;


const messageSchema = new Schema({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },

  sender: {
    userType: {
      type: String,
      enum: ['Buyer', 'Seller', 'Admin'],
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'sender.userType'
    }
  },

  recipients: [{
    userType: {
      type: String,
      enum: ['Buyer', 'Seller', 'Admin'],
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'recipients.userType'
    },
    deliveredAt: Date,
    readAt: Date
  }],

  // Message content
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location', 'product_share', 'offer', 'system'],
    default: 'text'
  },

  content: {
    text: String,
    images: [{
      url: String,
      publicId: String,
      alt: String,
      size: Number
    }],
    files: [{
      url: String,
      name: String,
      size: Number,
      type: String,
      publicId: String
    }],
    location: {
      coordinates: [Number],
      address: String
    },
    offer: {
      amount: Number,
      currency: String,
      description: String,
      expiresAt: Date,
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'expired'],
        default: 'pending'
      }
    },
    system: {
      type: {
        type: String,
        enum: ['user_joined', 'user_left', 'conversation_created', 'offer_made']
      },
      data: Schema.Types.Mixed
    }
  },

  // Related entities
  relatedProduct: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },

  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },

  // Message flags
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,

  // Reply reference
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Message metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    platform: String
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ 'sender.userId': 1, 'sender.userType': 1 });
messageSchema.index({ 'recipients.userId': 1, 'recipients.userType': 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ messageType: 1 });

module.exports = mongoose.model('Message', messageSchema);