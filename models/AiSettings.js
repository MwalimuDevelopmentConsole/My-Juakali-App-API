const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const aiSettingsSchema = new Schema(
  {
    openai: {
      apiKey: { type: String, default: "" },
      defaultModel: { type: String, default: "gpt-4o-mini" },
      enabledForProducts: { type: Boolean, default: true },
      enabledForBlogs: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["connected", "disconnected", "error"],
        default: "disconnected",
      },
      lastTested: { type: Date, default: null },
      lastError: { type: String, default: "" },
      quota: {
        remainingTokens: { type: String, default: null },
        limitTokens: { type: String, default: null },
        remainingRequests: { type: String, default: null },
        limitRequests: { type: String, default: null },
        tokensUsed: { type: Number, default: null },
        lastChecked: { type: Date, default: null },
      },
    },
    anthropic: {
      apiKey: { type: String, default: "" },
      defaultModel: { type: String, default: "claude-sonnet-4-5-20250929" },
      enabledForProducts: { type: Boolean, default: true },
      enabledForBlogs: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["connected", "disconnected", "error"],
        default: "disconnected",
      },
      lastTested: { type: Date, default: null },
      lastError: { type: String, default: "" },
      quota: {
        remainingTokens: { type: String, default: null },
        limitTokens: { type: String, default: null },
        remainingRequests: { type: String, default: null },
        limitRequests: { type: String, default: null },
        tokensUsed: { type: Number, default: null },
        lastChecked: { type: Date, default: null },
      },
    },
    knowledgeBase: {
      content: { type: String, required: true },
      version: { type: Number, default: 1 },
      lastUpdated: { type: Date, default: Date.now },
      updatedBy: { type: String, default: "System Seed" },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AiSettings", aiSettingsSchema);

