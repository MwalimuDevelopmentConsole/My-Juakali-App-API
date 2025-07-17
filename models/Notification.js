const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// NOTIFICATIONS MODEL
const notificationSchema = new Schema({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Notification content
  type: {
    type: String,
    enum: ['message', 'review', 'order', 'subscription', 'system', 'promotion', 'inquiry'],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  
  // Related entities
  relatedUser: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  relatedProduct: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  relatedOrder: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Action data
  actionUrl: String,
  actionData: Schema.Types.Mixed,
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  
  // Delivery
  deliveryMethods: {
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date
    }
  }
}, {
  timestamps: true
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);