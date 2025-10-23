"use strict";
const { Storage } = require("@google-cloud/storage");
const path = require("path");

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GCS_KEY_FILE_PATH, // Path to your service account key file
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

/**
 * Upload file to Google Cloud Storage
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} filename - Name for the file in GCS
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
const uploadToGCS = async (fileBuffer, filename, mimetype) => {
  return new Promise((resolve, reject) => {
    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: mimetype,
        cacheControl: "public, max-age=31536000",
      },
    });

    blobStream.on("error", (error) => {
      console.error("Error uploading to GCS:", error);
      reject(error);
    });

    blobStream.on("finish", async () => {
      // Make the file public (optional - remove if you want private files)
      await blob.makePublic().catch((err) => {
        console.warn("Could not make file public:", err.message);
      });

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
      resolve(publicUrl);
    });

    blobStream.end(fileBuffer);
  });
};

/**
 * Delete file from Google Cloud Storage
 * @param {string} filename - Name of the file to delete
 * @returns {Promise<boolean>}
 */
const deleteFromGCS = async (filename) => {
  try {
    await bucket.file(filename).delete();
    return true;
  } catch (error) {
    console.error("Error deleting from GCS:", error);
    return false;
  }
};

/**
 * Get signed URL for private file access
 * @param {string} filename - Name of the file
 * @param {number} expiresIn - Expiration time in milliseconds
 * @returns {Promise<string>}
 */
const getSignedUrl = async (filename, expiresIn = 3600000) => {
  const options = {
    version: "v4",
    action: "read",
    expires: Date.now() + expiresIn,
  };

  const [url] = await bucket.file(filename).getSignedUrl(options);
  return url;
};

module.exports = {
  storage,
  bucket,
  uploadToGCS,
  deleteFromGCS,
  getSignedUrl,
};
