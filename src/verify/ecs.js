/**
 * Employer Checking Service (ECS) Verification Implementation
 * Uses Playwright for web scraping the UK Government ECS service
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

export async function verifyECS(shareCode, dateOfBirth) {
    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return {
            ok: false,
            error: 'ECS automation requires PLAYWRIGHT_ENABLED=1'
        };
    }

    // Validate inputs
    const normalizedShareCode = String(shareCode || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalizedShareCode || normalizedShareCode.length !== 9 || !/^[A-Z0-9]{9}$/.test(normalizedShareCode)) {
        return {
            ok: false,
            error: 'Share code must be 9 alphanumeric characters'
        };
    }

    // Validate date of birth
    const dobMatch = String(dateOfBirth || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dobMatch) {
        return {
            ok: false,
            error: 'Date of birth must be in YYYY-MM-DD format'
        };
    }

    const [, year, month, day] = dobMatch;
    const dobDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (dobDate.getFullYear() !== parseInt(year) || 
        dobDate.getMonth() !== parseInt(month) - 1 || 
        dobDate.getDate() !== parseInt(day)) {
        return {
            ok: false,
            error: 'Invalid date of birth'
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

        const steps = [];

        try {
            // Navigate to ECS page
            const ecsUrl = 'https://www.gov.uk/employer-checking-service';
            await page.goto(ecsUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await acceptCookies(page);
            steps.push({ step: 1, url: ecsUrl, status: 'loaded' });

            // Find the link to check status or the form
            // ECS typically redirects to a share code entry page
            const shareCodeInput = page.locator('input[name*="share"], input[id*="share"], input[placeholder*="share" i]').first();
            const shareCodeInputCount = await shareCodeInput.count();
            
            if (shareCodeInputCount === 0) {
                // Try to find a link to the checking service
                const checkLink = page.locator('a[href*="check"], a:has-text("Check"), a:has-text("View")').first();
                if (await checkLink.count() > 0) {
                    await checkLink.click();
                    await page.waitForLoadState('networkidle', { timeout: 15000 });
                }
            }

            // Enter share code
            await page.waitForSelector('input[name*="share"], input[id*="share"], input[placeholder*="share" i], #shareCode', { timeout: 10000 });
            const shareInput = page.locator('input[name*="share"], input[id*="share"], input[placeholder*="share" i], #shareCode').first();
            await shareInput.fill(normalizedShareCode);
            
            const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Continue"), button:has-text("Check")').first();
            await submitButton.click();
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            steps.push({ step: 2, action: 'entered_share_code', status: 'submitted' });

            // Check for errors
            const errors = await page.locator('.govuk-error-message, .govuk-error-summary, [class*="error"]').count();
            if (errors > 0) {
                const errorText = await page.locator('.govuk-error-message, .govuk-error-summary').first().textContent();
                await browser.close();
                return {
                    ok: false,
                    shareCode: normalizedShareCode,
                    dateOfBirth,
                    status: 'error',
                    verificationDate: new Date().toISOString(),
                    message: errorText || 'Invalid share code or details',
                    steps
                };
            }

            // Enter date of birth if required
            const dobDayInput = page.locator('#dob-day, input[name*="day"], input[id*="day"]').first();
            if (await dobDayInput.count() > 0) {
                await dobDayInput.fill(day);
                const dobMonthInput = page.locator('#dob-month, input[name*="month"], input[id*="month"]').first();
                await dobMonthInput.fill(month);
                const dobYearInput = page.locator('#dob-year, input[name*="year"], input[id*="year"]').first();
                await dobYearInput.fill(year);
                
                const dobSubmitButton = page.locator('button[type="submit"], input[type="submit"]').first();
                await dobSubmitButton.click();
                await page.waitForLoadState('networkidle', { timeout: 15000 });
                steps.push({ step: 3, action: 'entered_date_of_birth', status: 'submitted' });
            }

            // Extract results
            await page.waitForTimeout(2000);
            
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
                const filename = `ecs-${normalizedShareCode}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);
                
                await fs.writeFile(filepath, screenshot);
                screenshotUrl = `/screenshots/${filename}`;
            } catch (saveError) {
                // Log but don't fail if screenshot save fails
            }
            
            const mainContent = await page.locator('#main-content, .govuk-main-wrapper, main').first();
            const contentText = await mainContent.textContent() || '';
            const pageText = await page.textContent('body') || '';
            const combinedText = (contentText + ' ' + pageText).toLowerCase();

            // Extract work status and expiry date
            const workStatusMatch = contentText.match(/(?:Work|Employment)\s*status[:\s]+([^\n]+)/i);
            const expiryMatch = contentText.match(/(?:Expires?|Valid until|Expiry)[:\s]+([^\n]+)/i);
            const allowedMatch = /allowed|permitted|can work|right to work/i.test(combinedText);
            const notAllowedMatch = /not allowed|not permitted|cannot work|no right to work/i.test(combinedText);

            let workStatus = 'unknown';
            if (allowedMatch) workStatus = 'allowed';
            else if (notAllowedMatch) workStatus = 'not_allowed';
            else if (workStatusMatch) workStatus = workStatusMatch[1].trim().toLowerCase();

            await browser.close();

            return {
                ok: true,
                shareCode: normalizedShareCode,
                dateOfBirth,
                status: 'verified',
                verificationDate: new Date().toISOString(),
                message: 'Employer Checking Service check completed',
                screenshotUrl,
                details: {
                    workStatus,
                    expiryDate: expiryMatch ? expiryMatch[1].trim() : null
                }
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
                    const filename = `ecs-error-${normalizedShareCode}-${timestamp}.png`;
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
                shareCode: normalizedShareCode,
                dateOfBirth,
                status: 'error',
                verificationDate: new Date().toISOString(),
                message: `Verification failed: ${error.message}`,
                screenshotUrl: errorScreenshotUrl,
                steps,
                error: error.message
            };
        }
    } catch (error) {
        return {
            ok: false,
            shareCode: normalizedShareCode,
            dateOfBirth,
            status: 'error',
            verificationDate: new Date().toISOString(),
            message: `Playwright initialization failed: ${error.message}`,
            error: error.message
        };
    }
}

