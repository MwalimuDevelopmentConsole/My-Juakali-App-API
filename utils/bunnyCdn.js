const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const uploadToBunnyCDN = async (filePath, folderName = 'uploads') => {
  const checkConfig = () => {
    if (!process.env.BUNNY_STORAGE_NAME || !process.env.BUNNY_API_KEY) {
      throw new Error('BunnyCDN configuration missing in .env');
    }
  };

  try {
    checkConfig();

    const fileName = path.basename(filePath);
    const storageZoneName = process.env.BUNNY_STORAGE_NAME;
    const accessKey = process.env.BUNNY_API_KEY;

    const fileStream = fs.createReadStream(filePath);

    // Construct the URL: https://storage.bunnycdn.com/{storageZoneName}/{path}/{fileName}
    const url = `https://storage.bunnycdn.com/${storageZoneName}/${folderName}/${fileName}`;

    await axios.put(url, fileStream, {
      headers: {
        AccessKey: accessKey,
        'Content-Type': 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Return the public URL for the file (using Pull Zone)
    // Pull Zone URL should effectively point to the root of the storage zone
    const pullZone = process.env.BUNNY_PULL_ZONE ? process.env.BUNNY_PULL_ZONE.replace(/\/$/, '') : '';
    const publicUrl = `${pullZone}/${folderName}/${fileName}`;

    return {
      success: true,
      url: publicUrl,
      fileName: fileName
    };
  } catch (error) {
    console.error('BunnyCDN Upload Error:', error.response ? error.response.data : error.message);
    throw new Error('Failed to upload to BunnyCDN');
  }
};

module.exports = {
  uploadToBunnyCDN
};
