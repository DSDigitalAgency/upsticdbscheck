import * as cheerio from 'cheerio';
import { loadConfig } from '../shared/config.js';

const config = loadConfig();

function withTimeout(promise, ms, controller) {
    return new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            controller?.abort();
            reject(new Error(`Request timed out after ${ms}ms`));
        }, ms);
        promise
            .then((value) => {
                clearTimeout(id);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(id);
                reject(err);
            });
    });
}

export async function checkUrlStatus(targetUrl) {
    const controller = new AbortController();
    const headers = {
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    };

    const startedAt = Date.now();
    try {
        const response = await withTimeout(
            fetch(targetUrl, { method: 'GET', headers, redirect: 'follow', signal: controller.signal }),
            config.timeoutMs,
            controller
        );

        const status = response.status;
        const finalUrl = response.url;
        const contentType = response.headers.get('content-type') || '';
        let html = '';
        if (contentType.includes('text/html')) {
            html = await response.text();
        }

        let parsed = null;
        if (html) {
            const $ = cheerio.load(html);
            const title = ($('title').text() || '').trim();
            const h1 = ($('h1').first().text() || '').trim();
            const errorText = $('[role="alert"], .error, .govuk-error-message').first().text().trim();
            parsed = { title, h1, errorText };
        }

        return {
            ok: response.ok,
            httpStatus: status,
            finalUrl,
            contentType,
            parsed,
            elapsedMs: Date.now() - startedAt,
            methodUsed: 'fetch',
        };
    } catch (error) {
        return {
            ok: false,
            httpStatus: null,
            finalUrl: targetUrl,
            contentType: null,
            parsed: null,
            elapsedMs: Date.now() - startedAt,
            methodUsed: 'fetch',
            error: error.message,
        };
    }
}


