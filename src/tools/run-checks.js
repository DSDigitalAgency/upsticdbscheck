import { loadConfig } from '../shared/config.js';
import { checkUrlStatus } from '../status/checker.js';

const config = loadConfig();

async function main() {
    const entries = Object.entries(config.targets);
    const results = await Promise.all(entries.map(async ([key, url]) => {
        const res = await checkUrlStatus(url);
        return [key, res];
    }));
    const out = Object.fromEntries(results);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});


