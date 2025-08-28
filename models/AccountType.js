const mongoose = require("mongoose");

const accountTypeSchema = new mongoose.Schema(
  {
    accountTypeName: {
      type: String,
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: "Admin",
    },
    deletedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: "Admin",
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AccountType", accountTypeSchema);
