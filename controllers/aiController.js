const axios = require("axios");
const AiSettings = require("../models/AiSettings");
const { DEFAULT_KNOWLEDGE_BASE } = require("../utils/defaultKnowledgeBase");

// Helper to mask secret API keys (e.g., sk-proj...YFsA)
const maskApiKey = (key) => {
  if (!key || typeof key !== "string") return "";
  const trimmed = key.trim();
  if (trimmed.length <= 10) return "••••••••••••";
  const start = trimmed.slice(0, 7);
  const end = trimmed.slice(-4);
  return `${start}...${end}`;
};

// Helper to get or initialize the singleton AiSettings
const getOrCreateSettings = async () => {
  let settings = await AiSettings.findOne();
  if (!settings) {
    settings = await AiSettings.create({
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        defaultModel: "gpt-4o-mini",
        enabledForProducts: true,
        enabledForBlogs: false,
        status: "disconnected",
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        defaultModel: "claude-sonnet-4-5-20250929",
        enabledForProducts: true,
        enabledForBlogs: false,
        status: "disconnected",
      },
      knowledgeBase: {
        content: DEFAULT_KNOWLEDGE_BASE,
        version: 1,
        lastUpdated: new Date(),
        updatedBy: "System Seed",
      },
    });
  } else {
    // Auto-migrate any legacy/deprecated models stored in DB
    let changed = false;
    if (
      settings.anthropic?.defaultModel &&
      !["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"].includes(
        settings.anthropic.defaultModel
      )
    ) {
      settings.anthropic.defaultModel = "claude-sonnet-4-5-20250929";
      changed = true;
    }
    if (
      settings.openai?.defaultModel &&
      !["gpt-4o-mini", "gpt-4o"].includes(settings.openai.defaultModel)
    ) {
      settings.openai.defaultModel = "gpt-4o-mini";
      changed = true;
    }
    if (changed) {
      await settings.save();
    }
  }
  return settings;
};

/**
 * @desc Get AI settings (with masked keys)
 * @route GET /api/ai/settings
 * @access Private (Admin)
 */
/**
 * @desc Get public AI status for authenticated users (seller, agent, admin)
 * @route GET /api/ai/status
 * @access Private (Admin, Seller, Marketer)
 */
const getStatus = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();

    const openAiConfigured = Boolean(
      settings.openai?.apiKey &&
      settings.openai.apiKey.trim().length > 0 &&
      settings.openai.enabledForProducts
    );

    const anthropicConfigured = Boolean(
      settings.anthropic?.apiKey &&
      settings.anthropic.apiKey.trim().length > 0 &&
      settings.anthropic.enabledForProducts
    );

    const providers = [];
    if (openAiConfigured) {
      providers.push({
        id: "openai",
        name: "OpenAI",
        model: settings.openai.defaultModel || "gpt-4o-mini",
      });
    }
    if (anthropicConfigured) {
      providers.push({
        id: "anthropic",
        name: "Claude",
        model: settings.anthropic.defaultModel || "claude-sonnet-4-5-20250929",
      });
    }

    const enabled = providers.length > 0;
    const defaultProvider = providers[0]?.id || "openai";

    return res.status(200).json({
      success: true,
      data: {
        enabled,
        providers,
        defaultProvider,
      },
    });
  } catch (error) {
    console.error("Error in getStatus:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check AI status",
    });
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();

    return res.status(200).json({
      success: true,
      data: {
        openai: {
          apiKeyMasked: maskApiKey(settings.openai?.apiKey),
          hasKey: Boolean(settings.openai?.apiKey && settings.openai.apiKey.trim().length > 0),
          defaultModel: settings.openai?.defaultModel || "gpt-4o-mini",
          enabledForProducts: settings.openai?.enabledForProducts ?? true,
          enabledForBlogs: settings.openai?.enabledForBlogs ?? false,
          status: settings.openai?.status || "disconnected",
          lastTested: settings.openai?.lastTested || null,
          lastError: settings.openai?.lastError || "",
          quota: settings.openai?.quota || null,
        },
        anthropic: {
          apiKeyMasked: maskApiKey(settings.anthropic?.apiKey),
          hasKey: Boolean(settings.anthropic?.apiKey && settings.anthropic.apiKey.trim().length > 0),
          defaultModel: settings.anthropic?.defaultModel || "claude-sonnet-4-5-20250929",
          enabledForProducts: settings.anthropic?.enabledForProducts ?? true,
          enabledForBlogs: settings.anthropic?.enabledForBlogs ?? false,
          status: settings.anthropic?.status || "disconnected",
          lastTested: settings.anthropic?.lastTested || null,
          lastError: settings.anthropic?.lastError || "",
          quota: settings.anthropic?.quota || null,
        },
        knowledgeBase: settings.knowledgeBase,
      },
    });
  } catch (error) {
    console.error("Error in getSettings:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve AI settings",
    });
  }
};

/**
 * @desc Update AI Settings (provider keys, default models, toggles)
 * @route PATCH /api/ai/settings
 * @access Private (Admin)
 */
const updateSettings = async (req, res) => {
  try {
    const { provider, apiKey, defaultModel, enabledForProducts, enabledForBlogs } = req.body;

    if (!provider || !["openai", "anthropic"].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider specified. Must be 'openai' or 'anthropic'",
      });
    }

    const settings = await getOrCreateSettings();

    // Update API Key only if a real unmasked key was sent
    if (typeof apiKey === "string") {
      const trimmed = apiKey.trim();
      // If user cleared the key
      if (trimmed === "") {
        settings[provider].apiKey = "";
        settings[provider].status = "disconnected";
      } else if (!trimmed.includes("...") && !trimmed.includes("•••")) {
        // A new raw key was entered
        settings[provider].apiKey = trimmed;
      }
    }

    if (defaultModel !== undefined) {
      settings[provider].defaultModel = defaultModel;
    }

    if (enabledForProducts !== undefined) {
      settings[provider].enabledForProducts = Boolean(enabledForProducts);
    }

    if (enabledForBlogs !== undefined) {
      settings[provider].enabledForBlogs = Boolean(enabledForBlogs);
    }

    await settings.save();

    return res.status(200).json({
      success: true,
      message: `${provider === "openai" ? "OpenAI" : "Anthropic"} settings saved successfully`,
      data: {
        apiKeyMasked: maskApiKey(settings[provider].apiKey),
        hasKey: Boolean(settings[provider].apiKey && settings[provider].apiKey.trim().length > 0),
        defaultModel: settings[provider].defaultModel,
        enabledForProducts: settings[provider].enabledForProducts,
        enabledForBlogs: settings[provider].enabledForBlogs,
        status: settings[provider].status,
        lastTested: settings[provider].lastTested,
        lastError: settings[provider].lastError,
        quota: settings[provider].quota || null,
      },
    });
  } catch (error) {
    console.error("Error in updateSettings:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save AI settings",
    });
  }
};

/**
 * @desc Test connection for an AI provider
 * @route POST /api/ai/test-connection
 * @access Private (Admin)
 */
const testConnection = async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;

    if (!provider || !["openai", "anthropic"].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider. Must be 'openai' or 'anthropic'",
      });
    }

    const settings = await getOrCreateSettings();

    // Determine which key to test: request body key or saved DB key
    let keyToTest = settings[provider]?.apiKey;
    if (typeof apiKey === "string" && apiKey.trim().length > 0 && !apiKey.includes("...") && !apiKey.includes("•••")) {
      keyToTest = apiKey.trim();
    }

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        message: `No API key found for ${provider}. Please enter a key and try again.`,
      });
    }

    const testTimestamp = new Date();

    if (provider === "openai") {
      const selectedModel = model || settings.openai?.defaultModel || "gpt-4o-mini";
      try {
        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: selectedModel,
            messages: [{ role: "user", content: "Ping" }],
            max_tokens: 5,
          },
          {
            headers: {
              Authorization: `Bearer ${keyToTest}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );

        if (response.status === 200) {
          const quota = {
            remainingTokens: response.headers["x-ratelimit-remaining-tokens"] || null,
            limitTokens: response.headers["x-ratelimit-limit-tokens"] || null,
            remainingRequests: response.headers["x-ratelimit-remaining-requests"] || null,
            limitRequests: response.headers["x-ratelimit-limit-requests"] || null,
            tokensUsed: response.data?.usage?.total_tokens ?? null,
            lastChecked: testTimestamp,
          };
          settings.openai.quota = quota;
          settings.openai.status = "connected";
          settings.openai.lastTested = testTimestamp;
          settings.openai.lastError = "";
          // If a new valid key was passed, persist it
          if (keyToTest !== settings.openai.apiKey) {
            settings.openai.apiKey = keyToTest;
          }
          await settings.save();

          return res.status(200).json({
            success: true,
            message: `Successfully connected to OpenAI using ${selectedModel}!`,
            lastTested: testTimestamp,
            status: "connected",
            quota,
          });
        }
      } catch (err) {
        const errMsg =
          err.response?.data?.error?.message ||
          err.message ||
          "Failed to connect to OpenAI";
        settings.openai.status = "error";
        settings.openai.lastTested = testTimestamp;
        settings.openai.lastError = errMsg;
        await settings.save();

        return res.status(400).json({
          success: false,
          message: `OpenAI connection failed: ${errMsg}`,
          lastTested: testTimestamp,
          status: "error",
        });
      }
    } else if (provider === "anthropic") {
      let selectedModel = model || settings.anthropic?.defaultModel || "claude-sonnet-4-5-20250929";
      if (!["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"].includes(selectedModel)) {
        selectedModel = "claude-sonnet-4-5-20250929";
      }
      try {
        const response = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: selectedModel,
            max_tokens: 10,
            messages: [{ role: "user", content: "Ping" }],
          },
          {
            headers: {
              "x-api-key": keyToTest,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );

        if (response.status === 200) {
          const quota = {
            remainingTokens: response.headers["anthropic-ratelimit-tokens-remaining"] || null,
            limitTokens: response.headers["anthropic-ratelimit-tokens-limit"] || null,
            remainingRequests: response.headers["anthropic-ratelimit-requests-remaining"] || null,
            limitRequests: response.headers["anthropic-ratelimit-requests-limit"] || null,
            tokensUsed:
              ((response.data?.usage?.input_tokens || 0) + (response.data?.usage?.output_tokens || 0)) || null,
            lastChecked: testTimestamp,
          };
          settings.anthropic.quota = quota;
          settings.anthropic.status = "connected";
          settings.anthropic.lastTested = testTimestamp;
          settings.anthropic.lastError = "";
          // If a new valid key was passed, persist it
          if (keyToTest !== settings.anthropic.apiKey) {
            settings.anthropic.apiKey = keyToTest;
          }
          await settings.save();

          return res.status(200).json({
            success: true,
            message: `Successfully connected to Anthropic using ${selectedModel}!`,
            lastTested: testTimestamp,
            status: "connected",
            quota,
          });
        }
      } catch (err) {
        const errMsg =
          err.response?.data?.error?.message ||
          err.message ||
          "Failed to connect to Anthropic";
        settings.anthropic.status = "error";
        settings.anthropic.lastTested = testTimestamp;
        settings.anthropic.lastError = errMsg;
        await settings.save();

        return res.status(400).json({
          success: false,
          message: `Anthropic connection failed: ${errMsg}`,
          lastTested: testTimestamp,
          status: "error",
        });
      }
    }
  } catch (error) {
    console.error("Error in testConnection:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute connection test",
    });
  }
};

/**
 * @desc Get knowledge base content
 * @route GET /api/ai/knowledge-base
 * @access Private (Admin)
 */
const getKnowledgeBase = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    return res.status(200).json({
      success: true,
      data: settings.knowledgeBase,
    });
  } catch (error) {
    console.error("Error in getKnowledgeBase:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve knowledge base",
    });
  }
};

/**
 * @desc Update knowledge base content
 * @route PUT /api/ai/knowledge-base
 * @access Private (Admin)
 */
const updateKnowledgeBase = async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Knowledge base content cannot be empty",
      });
    }

    const settings = await getOrCreateSettings();
    settings.knowledgeBase.content = content.trim();
    settings.knowledgeBase.version = (settings.knowledgeBase.version || 1) + 1;
    settings.knowledgeBase.lastUpdated = new Date();
    settings.knowledgeBase.updatedBy =
      req.user?.email || req.user?.firstName || "Admin";

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Artisan Knowledge Base updated successfully",
      data: settings.knowledgeBase,
    });
  } catch (error) {
    console.error("Error in updateKnowledgeBase:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update knowledge base",
    });
  }
};

/**
 * @desc Reset knowledge base to default seed content
 * @route POST /api/ai/knowledge-base/reset
 * @access Private (Admin)
 */
const resetKnowledgeBase = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    settings.knowledgeBase.content = DEFAULT_KNOWLEDGE_BASE;
    settings.knowledgeBase.version = (settings.knowledgeBase.version || 1) + 1;
    settings.knowledgeBase.lastUpdated = new Date();
    settings.knowledgeBase.updatedBy = "Reset to Default Seed";

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Knowledge base successfully reset to default craftsmanship guidelines",
      data: settings.knowledgeBase,
    });
  } catch (error) {
    console.error("Error in resetKnowledgeBase:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset knowledge base",
    });
  }
};

/**
 * @desc Generate product description & SEO metadata using LLM
 * @route POST /api/ai/generate-product-content
 * @access Private (Admin)
 */
const generateProductContent = async (req, res) => {
  try {
    const { provider, model, product } = req.body;

    if (!product || !product.title || product.title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product title is required to generate content",
      });
    }

    const settings = await getOrCreateSettings();

    // Determine provider to use
    let selectedProvider = provider;
    if (!selectedProvider) {
      if (settings.openai?.enabledForProducts && settings.openai?.apiKey) {
        selectedProvider = "openai";
      } else if (settings.anthropic?.enabledForProducts && settings.anthropic?.apiKey) {
        selectedProvider = "anthropic";
      } else {
        selectedProvider = "openai";
      }
    }

    const config = settings[selectedProvider];
    if (!config || !config.apiKey) {
      return res.status(400).json({
        success: false,
        message: `No API key configured for ${selectedProvider === "openai" ? "OpenAI" : "Anthropic"}. Please configure your API key in AI LLM Integrations settings.`,
      });
    }

    if (!config.enabledForProducts) {
      return res.status(400).json({
        success: false,
        message: `${selectedProvider === "openai" ? "OpenAI" : "Claude"} is currently disabled for product editing. Please enable it in AI settings.`,
      });
    }

    let selectedModel = model || config.defaultModel;
    if (selectedProvider === "anthropic" && !["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"].includes(selectedModel)) {
      selectedModel = "claude-sonnet-4-5-20250929";
    }
    if (selectedProvider === "openai" && !["gpt-4o-mini", "gpt-4o"].includes(selectedModel)) {
      selectedModel = "gpt-4o-mini";
    }
    const knowledgeBaseText =
      settings.knowledgeBase?.content || DEFAULT_KNOWLEDGE_BASE;

    // Build the system prompt
    const systemPrompt = `${knowledgeBaseText}

TASK & OUTPUT SPECIFICATION:
You are generating e-commerce listing copy and search engine metadata for an authentic handmade craft on Craftory.
Analyze the product title, category, materials, specifications, and images (if provided).
Produce authentic, high-converting, heirloom-quality descriptions that emphasize East African artisan labor, joinery, and sustainable craft.

CRITICAL INSTRUCTION:
Return ONLY a valid, raw JSON object with NO markdown formatting, NO backticks (\`\`\`json), and NO extra preamble or concluding text.
The JSON object must strictly follow this structure:
{
  "description": "Comprehensive markdown description (3-4 paragraphs or formatted sections with headings) detailing the handcrafted origin, materials, joinery/technique, aesthetic tactile charm, home styling suggestions, and simple artisan care instructions.",
  "shortDescription": "Compelling 1-2 sentence elevator summary (STRICTLY UNDER 160 characters / 25 words) for product cards and quick previews.",
  "metaTitle": "SEO title under 65 characters formatted as: [Product Name] - Handcrafted [Material/Type] | Craftory",
  "metaDescription": "SEO meta description between 140-160 characters highlighting handmade artisan craft and calling the buyer to shop.",
  "tags": "Comma-separated list of 6-10 specific tags (e.g. handmade, solid timber, kenyan woodwork, artisan decor)",
  "keywords": "Comma-separated list of 6-10 long-tail search phrases (e.g. handcrafted mahogany table, kenyan wood furniture, artisan dining decor)"
}`;

    // Build product context summary
    let productContext = `PRODUCT TITLE: ${product.title}\n`;
    if (product.primaryCategory) {
      productContext += `CATEGORY: ${product.primaryCategory}\n`;
    }
    if (product.condition) {
      productContext += `CONDITION: ${product.condition}\n`;
    }
    if (product.pricing?.basePrice) {
      productContext += `PRICE: ${product.pricing.currency || "KES"} ${product.pricing.basePrice}\n`;
    }
    if (product.dynamicFields && Object.keys(product.dynamicFields).length > 0) {
      productContext += `SPECIFICATIONS & ATTRIBUTES:\n`;
      for (const [key, val] of Object.entries(product.dynamicFields)) {
        if (val) {
          productContext += `- ${key}: ${val}\n`;
        }
      }
    }
    if (product.existingDescription && product.existingDescription.trim().length > 0) {
      productContext += `EXISTING DRAFT NOTES:\n${product.existingDescription.slice(0, 1000)}\n`;
    }

    // Extract valid image URLs or base64 data URLs
    const validImageUrls = [];
    const checkAndPushImage = (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (
          trimmed.startsWith("http://") ||
          trimmed.startsWith("https://") ||
          trimmed.startsWith("data:image/")
        ) {
          validImageUrls.push(trimmed);
        }
      } else if (val && typeof val.url === "string") {
        checkAndPushImage(val.url);
      }
    };

    if (Array.isArray(product.imageUrls)) {
      product.imageUrls.forEach(checkAndPushImage);
    }
    if (Array.isArray(product.existingImages)) {
      product.existingImages.forEach(checkAndPushImage);
    }
    if (Array.isArray(product.images)) {
      product.images.forEach(checkAndPushImage);
    }
    // Limit to at most 3 images to prevent excessive token payload
    const imagesToPass = validImageUrls.slice(0, 3);

    let rawResponseContent = "";

    if (selectedProvider === "openai") {
      // Build OpenAI messages
      const userContent = [{ type: "text", text: productContext }];
      imagesToPass.forEach((imgUrl) => {
        userContent.push({
          type: "image_url",
          image_url: { url: imgUrl, detail: "low" },
        });
      });

      const openAiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: selectedModel || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 45000,
        }
      );

      rawResponseContent =
        openAiResponse.data?.choices?.[0]?.message?.content || "";
    } else if (selectedProvider === "anthropic") {
      // Build Anthropic messages
      const anthropicUserContent = [];
      imagesToPass.forEach((imgUrl) => {
        const base64Match = imgUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (base64Match) {
          anthropicUserContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: base64Match[1] === "image/jpg" ? "image/jpeg" : base64Match[1],
              data: base64Match[2],
            },
          });
        } else if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
          anthropicUserContent.push({
            type: "image",
            source: {
              type: "url",
              url: imgUrl,
            },
          });
        }
      });
      anthropicUserContent.push({
        type: "text",
        text: productContext,
      });

      const anthropicResponse = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: selectedModel || "claude-sonnet-4-5-20250929",
          max_tokens: 2500,
          system: systemPrompt,
          messages: [{ role: "user", content: anthropicUserContent }],
          temperature: 0.7,
        },
        {
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 45000,
        }
      );

      rawResponseContent = anthropicResponse.data?.content?.[0]?.text || "";
    }

    // Clean any accidental markdown code fences
    let cleaned = rawResponseContent.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn("Could not parse direct JSON from LLM, attempting regex fallback:", cleaned);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid response format received from AI model");
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        provider: selectedProvider,
        model: selectedModel,
        description: parsedResult.description || "",
        shortDescription: parsedResult.shortDescription || "",
        metaTitle: parsedResult.metaTitle || "",
        metaDescription: parsedResult.metaDescription || "",
        tags: parsedResult.tags || "",
        keywords: parsedResult.keywords || "",
      },
    });
  } catch (error) {
    console.error("Error in generateProductContent:", error.response?.data || error);
    const message =
      error.response?.data?.error?.message ||
      error.message ||
      "Failed to generate product content with AI";
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

module.exports = {
  getStatus,
  getSettings,
  updateSettings,
  testConnection,
  getKnowledgeBase,
  updateKnowledgeBase,
  resetKnowledgeBase,
  generateProductContent,
};

