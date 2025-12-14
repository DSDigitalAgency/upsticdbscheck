/**
 * NHS Performers List Verification Implementation
 * Uses Playwright for web scraping the NHS service search
 */

export async function verifyNHSPerformers(registrationNumber, name = null) {
    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return {
            ok: false,
            error: 'NHS Performers List automation requires PLAYWRIGHT_ENABLED=1'
        };
    }

    if (!registrationNumber) {
        return {
            ok: false,
            error: 'Registration number is required'
        };
    }

    try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        try {
            // Navigate to NHS service search
            const nhsUrl = 'https://www.nhs.uk/service-search/other-services/GP/Results';
            await page.goto(nhsUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await acceptCookies(page);

            // Search for performer by registration number or name
            // The NHS service search may require location/postcode, so we'll try to find the performer search
            const searchInput = page.locator('input[name*="search"], input[id*="search"], input[type="search"], input[placeholder*="search" i]').first();
            
            if (await searchInput.count() > 0) {
                const searchTerm = name ? `${name} ${registrationNumber}` : registrationNumber;
                await searchInput.fill(searchTerm);
                
                const searchButton = page.locator('button[type="submit"], button:has-text("Search"), input[type="submit"]').first();
                if (await searchButton.count() > 0) {
                    await searchButton.click();
                    await page.waitForLoadState('networkidle', { timeout: 15000 });
                }
            }

            // Extract results
            await page.waitForTimeout(2000);
            
            const html = await page.content();
            const $ = (await import('cheerio')).load(html);
            
            const results = [];
            $('.result, .search-result, [class*="result"], .gp-result, .service-result').each((i, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 10) {
                    const regMatch = text.match(/(?:Registration|GMC|GDC|PIN|Number)[:\s]+([A-Z0-9]+)/i);
                    const nameMatch = text.match(/(?:Name|Doctor|GP)[:\s]+([A-Z][A-Z\s,'-]+)/i);
                    
                    if (regMatch || nameMatch) {
                        results.push({
                            registrationNumber: regMatch ? regMatch[1] : null,
                            name: nameMatch ? nameMatch[1].trim() : null,
                            rawText: text.substring(0, 200),
                        });
                    }
                }
            });

            const found = results.length > 0 && results.some(r => 
                r.registrationNumber === registrationNumber || 
                (name && r.name && r.name.toLowerCase().includes(name.toLowerCase()))
            );

            // Take and save screenshot before closing browser
            let screenshotUrl = null;
            try {
                const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const { fileURLToPath } = await import('node:url');
                
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const screenshotsDir = path.join(__dirname, '../../screenshots');
                await fs.mkdir(screenshotsDir, { recursive: true });
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const regNum = (registrationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
                const filename = `nhs-performers-${regNum}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);
                
                await fs.writeFile(filepath, screenshot);
                screenshotUrl = `/screenshots/${filename}`;
            } catch (saveError) {
                // Log but don't fail if screenshot save fails
            }

            await browser.close();

            return {
                ok: true,
                register: 'NHS Performers List',
                registerType: 'nhs-performers',
                registrationNumber,
                results,
                found,
                screenshotUrl,
                verificationDate: new Date().toISOString()
            };

        } catch (error) {
            // Try to save screenshot even on error
            let errorScreenshotUrl = null;
            try {
                if (page && !page.isClosed()) {
                    const errorScreenshot = await page.screenshot({ fullPage: true, type: 'png' });
                    const fs = await import('node:fs/promises');
                    const path = await import('node:path');
                    const { fileURLToPath } = await import('node:url');
                    
                    const __dirname = path.dirname(fileURLToPath(import.meta.url));
                    const screenshotsDir = path.join(__dirname, '../../screenshots');
                    await fs.mkdir(screenshotsDir, { recursive: true });
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                    const regNum = (registrationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
                    const filename = `nhs-performers-error-${regNum}-${timestamp}.png`;
                    const filepath = path.join(screenshotsDir, filename);
                    
                    await fs.writeFile(filepath, errorScreenshot);
                    errorScreenshotUrl = `/screenshots/${filename}`;
                }
            } catch (screenshotError) {
                // Ignore screenshot save errors
            }
            
            await browser.close();
            return {
                ok: false,
                error: `NHS Performers List check failed: ${error.message}`,
                screenshotUrl: errorScreenshotUrl,
                registrationNumber
            };
        }
    } catch (error) {
        return {
            ok: false,
            error: `Playwright initialization failed: ${error.message}`,
            registrationNumber
        };
    }
}

