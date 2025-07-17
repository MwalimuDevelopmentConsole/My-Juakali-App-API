const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// CONVERSATIONS MODEL
const conversationSchema = new Schema(
  {
    participants: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        lastRead: Date,
        unreadCount: {
          type: Number,
          default: 0,
        },
        isDeleted: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Related product
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    // Conversation metadata
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Status
    status: {
      type: String,
      enum: ["active", "archived", "blocked"],
      default: "active",
    },

    // Type
    type: {
      type: String,
      enum: ["product_inquiry", "general", "support"],
      default: "product_inquiry",
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ product: 1 });
conversationSchema.index({ lastActivity: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
