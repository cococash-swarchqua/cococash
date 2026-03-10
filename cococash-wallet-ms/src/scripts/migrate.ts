
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

async function migrate() {
    try {
        console.log('Starting database migration...');

        // Path to schema file relative to this script
        // When running with ts-node: src/scripts/migrate.ts -> src/db/schema.sql
        // When running compiled: dist/scripts/migrate.js -> dist/db/schema.sql
        const schemaPath = path.join(__dirname, '../db/schema.sql');

        console.log(`Reading schema from: ${schemaPath}`);

        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }

        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema...');
        await pool.query(sql);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
