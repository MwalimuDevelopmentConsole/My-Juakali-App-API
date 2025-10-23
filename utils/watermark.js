"use strict";
const sharp = require("sharp");
const path = require("path");

/**
 * Add watermark to an image
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} watermarkText - Text to use as watermark (default: "craftory")
 * @param {Object} options - Watermark options
 * @returns {Promise<Buffer>} - Watermarked image buffer
 */
const addWatermark = async (
  imageBuffer,
  watermarkText = "craftory",
  options = {}
) => {
  try {
    const {
      position = "southeast", // northeast, southeast, southwest, northwest, center
      fontSize = 48,
      opacity = 0.5,
      color = "white",
      backgroundColor = "rgba(0, 0, 0, 0.3)",
    } = options;

    // Get image metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Calculate font size based on image width (responsive sizing)
    const responsiveFontSize = Math.max(
      24,
      Math.min(fontSize, Math.floor(metadata.width / 15))
    );

    // Create SVG watermark
    const svgWatermark = `
      <svg width="${metadata.width}" height="${metadata.height}">
        <defs>
          <style>
            .watermark {
              font-family: Arial, sans-serif;
              font-size: ${responsiveFontSize}px;
              font-weight: bold;
              fill: ${color};
              opacity: ${opacity};
            }
          </style>
        </defs>
        ${createWatermarkText(
          watermarkText,
          metadata.width,
          metadata.height,
          position,
          responsiveFontSize,
          backgroundColor
        )}
      </svg>
    `;

    // Composite watermark onto image
    const watermarkedBuffer = await image
      .composite([
        {
          input: Buffer.from(svgWatermark),
          gravity: position === "center" ? "center" : position,
        },
      ])
      .toBuffer();

    return watermarkedBuffer;
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw new Error(`Failed to add watermark: ${error.message}`);
  }
};

/**
 * Create watermark text with position and background
 */
const createWatermarkText = (
  text,
  width,
  height,
  position,
  fontSize,
  backgroundColor
) => {
  const padding = 20;
  let x, y;

  // Calculate position
  switch (position) {
    case "northeast":
      x = width - padding;
      y = padding + fontSize;
      break;
    case "southeast":
      x = width - padding;
      y = height - padding;
      break;
    case "southwest":
      x = padding;
      y = height - padding;
      break;
    case "northwest":
      x = padding;
      y = padding + fontSize;
      break;
    case "center":
      x = width / 2;
      y = height / 2;
      break;
    default:
      x = width - padding;
      y = height - padding;
  }

  const textAnchor = position.includes("east") ? "end" : "start";

  return `
    <rect
      x="${x - (textAnchor === "end" ? text.length * fontSize * 0.4 : 0)}"
      y="${y - fontSize}"
      width="${text.length * fontSize * 0.5}"
      height="${fontSize + 10}"
      fill="${backgroundColor}"
      rx="5"
    />
    <text
      x="${x}"
      y="${y}"
      text-anchor="${textAnchor}"
      class="watermark"
    >
      ${text}
    </text>
  `;
};

/**
 * Add diagonal watermark pattern across the entire image
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} watermarkText - Text to use as watermark
 * @returns {Promise<Buffer>} - Watermarked image buffer
 */
const addDiagonalWatermark = async (
  imageBuffer,
  watermarkText = "craftory"
) => {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Create a repeating diagonal watermark pattern
    const svgWatermark = `
      <svg width="${metadata.width}" height="${metadata.height}">
        <defs>
          <style>
            .watermark {
              font-family: Arial, sans-serif;
              font-size: 36px;
              font-weight: bold;
              fill: white;
              opacity: 0.15;
            }
          </style>
        </defs>
        <g transform="rotate(-45 ${metadata.width / 2} ${metadata.height / 2})">
          ${Array.from(
            { length: 5 },
            (_, i) =>
              `<text x="${(metadata.width / 6) * (i + 1)}" y="${
                metadata.height / 3
              }" text-anchor="middle" class="watermark">${watermarkText}</text>
          <text x="${(metadata.width / 6) * (i + 1)}" y="${
                (metadata.height / 3) * 2
              }" text-anchor="middle" class="watermark">${watermarkText}</text>`
          ).join("")}
        </g>
      </svg>
    `;

    const watermarkedBuffer = await image
      .composite([
        {
          input: Buffer.from(svgWatermark),
          gravity: "center",
        },
      ])
      .toBuffer();

    return watermarkedBuffer;
  } catch (error) {
    console.error("Error adding diagonal watermark:", error);
    throw new Error(`Failed to add diagonal watermark: ${error.message}`);
  }
};

/**
 * Optimize image (compress and resize if needed)
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Optimization options
 * @returns {Promise<Buffer>}
 */
const optimizeImage = async (imageBuffer, options = {}) => {
  try {
    const { maxWidth = 2000, maxHeight = 2000, quality = 80 } = options;

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    let pipeline = image;

    // Resize if image is too large
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Optimize based on format
    if (metadata.format === "jpeg" || metadata.format === "jpg") {
      pipeline = pipeline.jpeg({ quality, progressive: true });
    } else if (metadata.format === "png") {
      pipeline = pipeline.png({ quality, progressive: true });
    } else if (metadata.format === "webp") {
      pipeline = pipeline.webp({ quality });
    }

    return await pipeline.toBuffer();
  } catch (error) {
    console.error("Error optimizing image:", error);
    throw new Error(`Failed to optimize image: ${error.message}`);
  }
};

module.exports = {
  addWatermark,
  addDiagonalWatermark,
  optimizeImage,
};
