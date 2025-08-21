const { default: mongoose } = require("mongoose");
const Schema = mongoose.Schema;

const supportTicketSchema = new Schema(
  {
    // Ticket identification
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
    },

    // Participants
    requester: {
      userType: {
        type: String,
        enum: ["Seller", "Admin"], // Only sellers can create, admins can also create on behalf
        required: true,
      },
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: "requester.userType",
      },
    },

    assignedTo: {
      userType: {
        type: String,
        enum: ["Admin"],
        default: "Admin",
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
      },
    },

    // Ticket details
    category: {
      type: String,
      enum: [
        "technical_issue",
        "account_verification",
        "payment_dispute",
        "business_inquiry",
        "product_issue",
        "subscription_support",
        "general_support",
        "report_abuse",
      ],
      required: true,
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },

    subject: {
      type: String,
      required: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    // Status tracking
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_response", "resolved", "closed"],
      default: "open",
      index: true,
    },

    // Conversation reference
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
    },

    // Resolution
    resolution: {
      resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
      },
      resolvedAt: Date,
      resolutionNotes: String,
      satisfactionRating: {
        type: Number,
        min: 1,
        max: 5,
      },
      satisfactionFeedback: String,
    },

    // Attachments
    attachments: [
      {
        url: String,
        publicId: String,
        name: String,
        type: String,
        size: Number,
      },
    ],

    // Tracking
    responseTime: Number, // in minutes
    resolutionTime: Number, // in minutes
    escalations: [
      {
        fromAdmin: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
        toAdmin: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
        reason: String,
        escalatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Auto-close after resolution
    autoCloseAt: Date,

    // Internal notes (admin only)
    internalNotes: [
      {
        admin: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
        note: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ "requester.userId": 1, "requester.userType": 1 });
supportTicketSchema.index({ "assignedTo.userId": 1 });
supportTicketSchema.index({ category: 1, status: 1 });
supportTicketSchema.index({ priority: 1, status: 1 });
supportTicketSchema.index({ createdAt: -1 });

// Generate ticket number
supportTicketSchema.pre("save", async function (next) {
  if (!this.ticketNumber) {
    const count = await this.constructor.countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
  }
  next();
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
