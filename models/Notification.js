const { default: mongoose } = require("mongoose");
const Schema = mongoose.Schema;


const notificationSchema = new Schema({
  recipient: {
    userType: {
      type: String,
      enum: ['Buyer', 'Seller', 'Admin'],
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'recipient.userType',
      index: true
    }
  },

  // Notification content
  type: {
    type: String,
    enum: [
      'message', 
      'support_ticket', 
      'support_response',
      'system_alert', 
      'product_inquiry',
      'verification_update',
      'subscription_reminder'
    ],
    required: true,
    index: true
  },

  template: {
    type: String,
    required: true // e.g., 'new_message_buyer', 'support_ticket_created'
  },

  title: {
    type: String,
    required: true
  },

  message: {
    type: String,
    required: true
  },

  // Template data for dynamic content
  data: Schema.Types.Mixed,

  // Related entities (polymorphic)
  relatedEntities: [{
    entityType: {
      type: String,
      enum: ['Conversation', 'Message', 'SupportTicket', 'Product', 'Buyer', 'Seller', 'Admin']
    },
    entityId: {
      type: Schema.Types.ObjectId,
      refPath: 'relatedEntities.entityType'
    }
  }],

  // Delivery channels
  channels: [{
    type: String,
    enum: ['push', 'email', 'sms'],
    required: true
  }],

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },

  // Status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,

  // Delivery tracking
  delivery: {
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      error: String
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      opened: { type: Boolean, default: false },
      openedAt: Date,
      error: String
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      error: String
    }
  },

  // Action data
  actionUrl: String,
  actionData: Schema.Types.Mixed,

  // Expiry
  expiresAt: Date
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ 'recipient.userId': 1, 'recipient.userType': 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ priority: 1, isRead: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
