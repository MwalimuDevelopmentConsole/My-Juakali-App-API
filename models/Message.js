const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// MESSAGES MODEL
const messageSchema = new Schema({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    // ref: 'User',
    required: true,
    index: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    // ref: 'User',
    required: true,
    index: true
  },
  
  // Message content
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location', 'product_share', 'offer'],
    default: 'text'
  },
  content: {
    text: String,
    images: [{
      url: String,
      publicId: String,
      alt: String
    }],
    files: [{
      url: String,
      name: String,
      size: Number,
      type: String
    }],
    location: {
      coordinates: [Number],
      address: String
    },
    offer: {
      amount: Number,
      currency: String,
      description: String,
      expiresAt: Date
    }
  },
  
  // Related product (if applicable)
  relatedProduct: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  
  // Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readAt: Date,
  
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
  }
}, {
  timestamps: true
});

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, recipient: 1 });
messageSchema.index({ status: 1, readAt: 1 });

const Message = mongoose.model('Message', messageSchema);