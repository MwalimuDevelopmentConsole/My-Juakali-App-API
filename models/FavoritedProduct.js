const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const favoritedProductSchema = new Schema(
  {
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Optional: Store some product snapshot data for faster queries
    productSnapshot: {
      title: String,
      price: Number,
      currency: String,
      primaryImage: String,
      sellerName: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure a buyer can only favorite a product once
favoritedProductSchema.index({ buyerId: 1, productId: 1 }, { unique: true });

// Index for faster queries by buyer
favoritedProductSchema.index({ buyerId: 1, createdAt: -1 });

module.exports = mongoose.model("FavoritedProduct", favoritedProductSchema);
