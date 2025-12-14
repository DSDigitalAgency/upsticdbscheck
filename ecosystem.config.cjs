module.exports = {
    apps: [
        {
            name: 'perform-check',
            script: './src/index.js',
            interpreter: 'node',
            exec_mode: 'fork',
            instances: 1,
            watch: false,
            autorestart: true,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production',
                PORT: '5002',
                HOST: 'localhost',
                TIMEOUT_MS: '15000',
            },
            error_file: './logs/perform-check-error.log',
            out_file: './logs/perform-check-out.log',
            merge_logs: true,
            time: true,
        },
    ],
};


