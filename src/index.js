import 'dotenv/config';
import Fastify from 'fastify';
import pino from 'pino';
import { registerStatusRoutes } from './status/routes.js';
import { registerVerifyRoutes } from './verify/routes.js';
import { loadConfig } from './shared/config.js';

const config = loadConfig();

let logger;
if (process.env.NODE_ENV === 'production') {
    logger = { level: 'info' };
} else {
    // Use pino + pretty stream in dev to avoid transport target resolution issues
    const pretty = (await import('pino-pretty')).default;
    logger = pino({
        level: 'info',
        base: undefined,
        timestamp: true,
        // Keep logs minimal
        messageKey: 'msg',
        formatters: {
            level(label) { return { level: label }; },
            bindings() { return {}; },
            log(object) { return object; },
        },
    }, pretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,req,res,responseTime' }));
}

const fastify = Fastify({
    logger,
    trustProxy: true,
    // Ensure binary responses are handled correctly
    disableRequestLogging: false,
});

await registerStatusRoutes(fastify);
await registerVerifyRoutes(fastify);

const start = async () => {
    try {
        await fastify.listen({ port: config.port, host: config.host });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

const shutdown = async (signal) => {
    try {
        fastify.log.info(`Received ${signal}. Closing server...`);
        await fastify.close();
        process.exit(0);
    } catch (error) {
        fastify.log.error('Error during shutdown', error);
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();


