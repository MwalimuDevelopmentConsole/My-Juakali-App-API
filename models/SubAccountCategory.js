const mongoose = require("mongoose");

const subAccountCategorySchema = new mongoose.Schema(
  {
    subCategoryName: {
      type: String,
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: "AccountType",
    },
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

module.exports = mongoose.model("SubAccountCategory", subAccountCategorySchema);
