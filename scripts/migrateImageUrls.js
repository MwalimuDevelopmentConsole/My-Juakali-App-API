require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// Function to handle the migration
const migrateUrls = async () => {
    try {
        console.log('Initializing migration script...');

        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is undefined. Check your .env file location.');
        }

        console.log('Connecting to MongoDB...');
        
        mongoose.set('strictQuery', true);
        await mongoose.connect(process.env.MONGO_URI);
        
        console.log('Connected to MongoDB successfully.');

        const oldDomain = 'https://api.craftoryllc.com/uploads/';
        const newDomain = 'https://files.craftoryllc.com/uploads/';

        console.log(`Searching for products with images containing: ${oldDomain}`);

        const products = await Product.find({
            'media.images.url': { $regex: oldDomain }
        });

        console.log(`Found ${products.length} products to update.`);

        if (products.length === 0) {
            console.log('No products found needing update.');
            process.exit(0);
        }

        let updatedCount = 0;

        for (const product of products) {
            let modified = false;

            if (product.media && product.media.images) {
                product.media.images.forEach(image => {
                    if (image.url && image.url.includes(oldDomain)) {
                        image.url = image.url.replace(oldDomain, newDomain);
                        modified = true;
                    }
                });
            }

            if (modified) {
                product.markModified('media');
                await product.save();
                updatedCount++;
                process.stdout.write(`\rUpdated ${updatedCount}/${products.length} products...`);
            }
        }

        console.log('\nMigration completed successfully.');
        process.exit(0);

    } catch (error) {
        console.error('\nMigration failed with error:');
        console.error(error);
        process.exit(1);
    }
};

migrateUrls();
