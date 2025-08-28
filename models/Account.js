const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const accountSchema = new mongoose.Schema(
  {
    user: {
      userType: {
        type: String,
        enum: ["Buyer", "Seller", "Admin"],
        required: false,
        index: true,
      },
      userId: {
        type: Schema.Types.ObjectId,
        required: false,
        refPath: "user.userType",
        index: true,
      },
    },
    accountName: {
      type: String,
      required: false,
    },
    accountNo: {
      type: String,
      required: true,
    },
    accountCategory: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: "SubAccountCategory",
    },
    description: {
      type: String,
      required: false,
    },
    accountType: {
      type: String,
      required: true,
    },
    isSystemAccount: {
      type: Boolean,
      default: false,
      immutable: true,
    },
    isPaymentOption: {
      type: Boolean,
      default: false,
    },
    balance: { type: Number, default: 0.0 },
    status: {
      type: String,
      default: "InActive",
    },
    remark: {
      type: String,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: "Admin",
    },
    isDeleted: { type: Boolean, default: false },
    deletedById: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: "Admin",
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Account", accountSchema);
