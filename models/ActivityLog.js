const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    user: {
      userType: {
        type: String,
        required: true,
        enum: ["Admin", "Seller", "Buyer"],
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "user.userType",
      },
    },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);
module.exports = mongoose.model("ActivityLog", activitySchema);
