export function loadConfig() {
    const port = Number(process.env.PORT || 5002);
    // Use 127.0.0.1 to avoid dual IPv4/IPv6 "listening" lines
    const host = process.env.HOST || '127.0.0.1';
    const userAgent = process.env.USER_AGENT || 'perform-check/1.0 (+https://example.com)';
    const timeoutMs = Number(process.env.TIMEOUT_MS || 15000);

    return {
        port,
        host,
        userAgent,
        timeoutMs,
        targets: {
            e2s1: 'https://secure.crbonline.gov.uk/crsc/check?execution=e2s1',
            e2s4: 'https://secure.crbonline.gov.uk/crsc/check?execution=e2s4',
            e2s5: 'https://secure.crbonline.gov.uk/crsc/check?execution=e2s5',
        },
    };
}


