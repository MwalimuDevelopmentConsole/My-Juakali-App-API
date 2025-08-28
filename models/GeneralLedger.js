const { default: mongoose } = require("mongoose");

const generalLedgerSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Account",
    },
    accountType: {
      type: String,
      enum: ["seller", "business", "marketer"], // Helps identify the type of account
      required: true,
    },
    transactionType: {
      type: String,
      required: true,
    },
    debitAmount: {
      type: Number,
      default: 0, // - account
    },
    creditAmount: {
      type: Number,
      default: 0, // + account
    },
    balance: {
      type: Number,
      required: false, // Calculated running balance
    },
    narration: {
      type: String,
      required: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GeneralLedger", generalLedgerSchema);