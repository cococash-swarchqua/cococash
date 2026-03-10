/**
 * App Entry Point - CocoCash Wallet MS
 * 
 * Configures Express app with routes and starts SQS consumer
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from './config/db';
import { AccountController } from './controllers/account.controller';
import { TransferController } from './controllers/transfer.controller';
import { AccountService } from './services/account.service';
import { TransferService } from './services/transfer.service';
import { TransferPublisher } from './events/publishers/transfer.publisher';
import { TransferConsumer } from './events/consumers/transfer.consumer';

// Initialize services
const eventPublisher = new TransferPublisher();
const accountService = new AccountService(pool, eventPublisher);
const transferService = new TransferService(pool, eventPublisher);

// Initialize controllers
const accountController = new AccountController(accountService);
const transferController = new TransferController(transferService);

// Initialize SQS consumer
const transferConsumer = new TransferConsumer(transferService);

// Express app
const app: Application = express();

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', service: 'cococash-wallet-ms' });
});

// Routes
app.use('/v1/accounts', accountController.router);
app.use('/v1/transfers', transferController.router);

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({
        error: err.message || 'Internal server error'
    });
});

// Start server and consumer
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`CocoCash Wallet MS running on port ${PORT}`);

    // Auto-migration
    const schemaPath = path.join(__dirname, 'db/schema.sql');
    if (fs.existsSync(schemaPath)) {
        console.log('Running database auto-migration...');
        try {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(schema);
            console.log('Database auto-migration completed successfully.');
        } catch (error) {
            console.error('Database auto-migration failed:', error);
        }
    }

    // Start SQS consumer in background
    if (process.env.ENABLE_CONSUMER !== 'false') {
        transferConsumer.start();
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    transferConsumer.stop();
    await pool.end();
    process.exit(0);
});

export { app, pool };
