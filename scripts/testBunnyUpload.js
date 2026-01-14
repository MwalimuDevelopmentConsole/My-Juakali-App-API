const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { uploadToBunnyCDN } = require('../utils/bunnyCdn');

const testUpload = async () => {
    console.log('--- BunnyCDN Upload Test ---');
    
    // Check Config
    if (!process.env.BUNNY_API_KEY || !process.env.BUNNY_STORAGE_NAME) {
        console.error('❌ Missing .env configuration. Please set BUNNY_API_KEY and BUNNY_STORAGE_NAME.');
        process.exit(1);
    }
    console.log(`Using Storage Zone: ${process.env.BUNNY_STORAGE_NAME}`);

    // Pick a test file
    const testFile = process.argv[2] || 'uploads/2025-10-30T06-28-17.364Z-craftory-1.png';
    const absolutePath = path.resolve(testFile);

    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ Test file not found at: ${absolutePath}`);
        console.log('Usage: node scripts/testBunnyUpload.js <path-to-image>');
        
        // Try to create a dummy file
        console.log('Creating dummy test file...');
        const dummyPath = path.join(__dirname, '../uploads/test-bunny.txt');
        if (!fs.existsSync(path.dirname(dummyPath))) fs.mkdirSync(path.dirname(dummyPath), { recursive: true });
        fs.writeFileSync(dummyPath, 'Hello BunnyCDN! This is a test file.');
        console.log(`Created dummy file at ${dummyPath}`);
        
        return runUpload(dummyPath);
    }

    await runUpload(absolutePath);
};

const runUpload = async (filePath) => {
    try {
        console.log(`Uploading file: ${filePath}`);
        const result = await uploadToBunnyCDN(filePath);
        console.log('✅ Upload Success!');
        console.log('--------------------------------------------------');
        console.log('File Name  :', result.fileName);
        console.log('Public URL :', result.url);
        console.log('--------------------------------------------------');
        console.log('NOTE: If you set BUNNY_PULL_ZONE in .env, verify the URL above works in your browser.');
    } catch (error) {
        console.error('❌ Upload Failed:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
};

testUpload();
