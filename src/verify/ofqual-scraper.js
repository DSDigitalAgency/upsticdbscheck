/**
 * Ofqual Qualification Verification Implementation
 * Uses Playwright for web scraping since the API is unavailable
 */

/**
 * Helper function to accept cookies if a cookie banner appears
 */
async function acceptCookies(page) {
    try {
        const cookieSelectors = [
            'button:has-text("Accept")',
            'button:has-text("Accept all")',
            'button:has-text("Accept cookies")',
            'button:has-text("I accept")',
            'button:has-text("Accept all cookies")',
            '[id*="accept"]',
            '[id*="cookie-accept"]',
            '[class*="accept"]',
            '[class*="cookie-accept"]',
            'button[data-testid*="accept"]',
            '#cookie-banner button',
            '.cookie-banner button',
            '[role="button"]:has-text("Accept")'
        ];

        for (const selector of cookieSelectors) {
            try {
                const button = page.locator(selector).first();
                if (await button.isVisible({ timeout: 2000 })) {
                    await button.click();
                    await page.waitForTimeout(1000);
                    return true;
                }
            } catch {
                // Continue to next selector
            }
        }
        return false;
    } catch {
        return false;
    }
}

export async function verifyOfqualQualification(qualificationNumber = null, qualificationTitle = null, awardingOrganisation = null) {
    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return {
            ok: false,
            error: 'Ofqual verification requires PLAYWRIGHT_ENABLED=1'
        };
    }

    if (!qualificationNumber && !qualificationTitle) {
        return {
            ok: false,
            error: 'Either qualificationNumber or qualificationTitle is required'
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
            // Navigate to Ofqual register
            const ofqualUrl = 'https://register.ofqual.gov.uk';
            await page.goto(ofqualUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await acceptCookies(page);

            // Find search functionality
            const searchInput = page.locator('input[name*="search"], input[id*="search"], input[type="search"], input[placeholder*="qualification" i]').first();
            
            if (await searchInput.count() > 0) {
                const searchTerm = qualificationNumber || qualificationTitle || '';
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
            
            // Look for qualification details
            const qualificationData = {};
            const bodyText = $('body').text();
            
            // Try to extract qualification number
            if (qualificationNumber) {
                const numberMatch = bodyText.match(new RegExp(qualificationNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                if (numberMatch) {
                    qualificationData.qualificationNumber = qualificationNumber;
                }
            }

            // Extract qualification title
            const titleMatch = bodyText.match(/(?:Qualification|Title)[:\s]+([^\n]+)/i);
            if (titleMatch) {
                qualificationData.qualificationTitle = titleMatch[1].trim();
            }

            // Extract awarding organisation
            const orgMatch = bodyText.match(/(?:Awarding|Organisation|Body)[:\s]+([^\n]+)/i);
            if (orgMatch) {
                qualificationData.awardingOrganisation = orgMatch[1].trim();
            }

            // Extract level
            const levelMatch = bodyText.match(/(?:Level)[:\s]+([^\n]+)/i);
            if (levelMatch) {
                qualificationData.level = levelMatch[1].trim();
            }

            // Extract status
            const statusMatch = bodyText.match(/(?:Status)[:\s]+([^\n]+)/i);
            if (statusMatch) {
                qualificationData.status = statusMatch[1].trim();
            }

            // Take and save screenshot
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
                const qualNum = (qualificationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
                const filename = `ofqual-${qualNum}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);
                
                await fs.writeFile(filepath, screenshot);
                screenshotUrl = `/screenshots/${filename}`;
            } catch (saveError) {
                // Log but don't fail if screenshot save fails
            }

            await browser.close();

            const found = Object.keys(qualificationData).length > 0;

            if (!found) {
                return {
                    ok: false,
                    qualification: null,
                    verificationDate: new Date().toISOString(),
                    error: 'Qualification not found in Ofqual register'
                };
            }

            return {
                ok: true,
                qualification: {
                    qualificationNumber: qualificationData.qualificationNumber || qualificationNumber,
                    qualificationTitle: qualificationData.qualificationTitle || qualificationTitle,
                    awardingOrganisation: qualificationData.awardingOrganisation || awardingOrganisation,
                    level: qualificationData.level || 'Unknown',
                    status: qualificationData.status || 'Current'
                },
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
                    const qualNum = (qualificationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
                    const filename = `ofqual-error-${qualNum}-${timestamp}.png`;
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
                qualification: null,
                screenshotUrl: errorScreenshotUrl,
                verificationDate: new Date().toISOString(),
                error: `Ofqual verification failed: ${error.message}`
            };
        }
    } catch (error) {
        return {
            ok: false,
            qualification: null,
            verificationDate: new Date().toISOString(),
            error: `Playwright initialization failed: ${error.message}`
        };
    }
}

