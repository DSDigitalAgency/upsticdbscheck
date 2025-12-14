import * as cheerio from 'cheerio';

const REGISTER_CONFIGS = {
    gdc: {
        name: 'General Dental Council',
        searchUrl: 'https://olr.gdc-uk.org/searchregister',
        searchMethod: 'POST',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    gmc: {
        name: 'General Medical Council',
        searchUrl: 'https://www.gmc-uk.org/registration-and-licensing/the-medical-register',
        searchMethod: 'GET',
        fields: { registrationNumber: 'gmcReferenceNumber', name: 'name' },
    },
    nmc: {
        name: 'Nursing & Midwifery Council',
        searchUrl: 'https://www.nmc.org.uk/registration/search-the-register/',
        searchMethod: 'GET',
        fields: { registrationNumber: 'nmcPin', name: 'name' },
    },
    hcpc: {
        name: 'Health & Care Professions Council',
        searchUrl: 'https://www.hcpc-uk.org/check-the-register/',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    gphc: {
        name: 'General Pharmaceutical Council',
        searchUrl: 'https://www.pharmacyregulation.org/registers',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    psni: {
        name: 'Pharmaceutical Society of Northern Ireland',
        searchUrl: 'https://registers.psni.org.uk',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    socialworkengland: {
        name: 'Social Work England',
        searchUrl: 'https://www.socialworkengland.org.uk/find-a-social-worker/',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    gcc: {
        name: 'General Chiropractic Council',
        searchUrl: 'https://www.gcc-uk.org',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    pamvr: {
        name: 'Physician Associate Managed Voluntary Register',
        searchUrl: 'https://www.fparcp.co.uk/pamvr/search',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    goc: {
        name: 'General Optical Council',
        searchUrl: 'https://str.optical.org',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
    osteopathy: {
        name: 'General Osteopathic Council',
        searchUrl: 'https://www.osteopathy.org.uk/register-search/',
        searchMethod: 'GET',
        fields: { registrationNumber: 'registrationNumber', name: 'name' },
    },
};

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

export async function checkRegister(registerType, query, options = {}) {
    const config = REGISTER_CONFIGS[registerType];
    if (!config) {
        return { ok: false, error: `Unknown register type: ${registerType}` };
    }

    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return { ok: false, error: `Register checking requires PLAYWRIGHT_ENABLED=1` };
    }

    let browser = null;
    let page = null;
    
    try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page = await context.newPage();
        
        await page.goto(config.searchUrl, { waitUntil: 'networkidle' });
        await acceptCookies(page);
        
        // Fill search form based on register type
        const registrationNumber = query.registrationNumber || query.pin || query.referenceNumber;
        const name = query.name;
        
        if (registrationNumber) {
            const regInput = await page.locator('input[name*="registration"], input[name*="pin"], input[name*="reference"], input[id*="registration"], input[id*="pin"]').first();
            if (await regInput.count() > 0) {
                await regInput.fill(registrationNumber);
            }
        }
        
        if (name) {
            const nameInput = await page.locator('input[name*="name"], input[id*="name"]').first();
            if (await nameInput.count() > 0) {
                await nameInput.fill(name);
            }
        }
        
        // Submit form
        const submitBtn = await page.locator('button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Find")').first();
        if (await submitBtn.count() > 0) {
            await submitBtn.click();
            await page.waitForLoadState('networkidle');
        }
        
        // Take screenshot before extracting results
        let screenshotUrl = null;
        try {
            const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const { fileURLToPath } = await import('node:url');
            
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const screenshotsDir = path.join(__dirname, '../../../screenshots');
            await fs.mkdir(screenshotsDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const regNum = (registrationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
            const filename = `${registerType}-${regNum}-${timestamp}.png`;
            const filepath = path.join(screenshotsDir, filename);
            
            await fs.writeFile(filepath, screenshot);
            screenshotUrl = `/screenshots/${filename}`;
        } catch (saveError) {
            // Log but don't fail if screenshot save fails
        }
        
        // Extract results
        const html = await page.content();
        const $ = cheerio.load(html);
        
        const results = [];
        $('.result, .register-result, .search-result, [class*="result"], table tbody tr').each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 10) {
                const regMatch = text.match(/(?:Registration|PIN|Reference|Reg)\s*(?:Number|No|#)?\s*:?\s*([A-Z0-9]+)/i);
                const nameMatch = text.match(/(?:Name|Full Name)\s*:?\s*([A-Z][A-Z\s,'-]+)/i);
                const statusMatch = text.match(/(?:Status|Registration Status)\s*:?\s*([A-Z][A-Z\s]+)/i);
                
                results.push({
                    registrationNumber: regMatch ? regMatch[1] : null,
                    name: nameMatch ? nameMatch[1].trim() : null,
                    status: statusMatch ? statusMatch[1].trim() : null,
                    rawText: text.substring(0, 200),
                });
            }
        });
        
        await browser.close();
        
        return {
            ok: true,
            register: config.name,
            registerType,
            results,
            found: results.length > 0,
            screenshotUrl
        };
    } catch (err) {
        // Try to save screenshot even on error
        let errorScreenshotUrl = null;
        try {
            if (page && !page.isClosed()) {
                const errorScreenshot = await page.screenshot({ fullPage: true, type: 'png' });
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const { fileURLToPath } = await import('node:url');
                
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const screenshotsDir = path.join(__dirname, '../../../screenshots');
                await fs.mkdir(screenshotsDir, { recursive: true });
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const regNum = (query.registrationNumber || 'unknown').replace(/[^A-Z0-9]/g, '');
                const filename = `${registerType}-error-${regNum}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);
                
                await fs.writeFile(filepath, errorScreenshot);
                errorScreenshotUrl = `/screenshots/${filename}`;
            }
        } catch (screenshotError) {
            // Ignore screenshot save errors
        }
        
        try {
            await browser.close();
        } catch {
            // Browser might already be closed
        }
        
        return { 
            ok: false, 
            screenshotUrl: errorScreenshotUrl,
            error: `Register check failed: ${err.message}` 
        };
    }
}

export { REGISTER_CONFIGS };

