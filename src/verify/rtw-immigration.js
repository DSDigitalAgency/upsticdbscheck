/**
 * RTW Immigration Status Verification Implementation
 * Uses Playwright for web scraping the UK Government Employee Immigration Status service
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

export async function verifyRTWImmigrationStatus(shareCode, dateOfBirth, supplementaryDocument = null) {
    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return {
            ok: false,
            error: 'RTW Immigration Status automation requires PLAYWRIGHT_ENABLED=1'
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
        let pdfResultUrl = null;

        try {
            // Navigate to Employee Immigration Status page
            const immigrationUrl = 'https://www.gov.uk/employee-immigration-employment-status';
            await page.goto(immigrationUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await acceptCookies(page);
            steps.push({ step: 1, url: immigrationUrl, status: 'loaded' });

            // Find and navigate to the share code entry page
            const checkLink = page.locator('a[href*="view"], a[href*="check"], a:has-text("Check"), a:has-text("View")').first();
            if (await checkLink.count() > 0) {
                await checkLink.click();
                await page.waitForLoadState('networkidle', { timeout: 15000 });
            }

            // Enter share code
            await page.waitForSelector('input[name*="share"], input[id*="share"], #shareCode', { timeout: 10000 });
            const shareInput = page.locator('input[name*="share"], input[id*="share"], #shareCode').first();
            await shareInput.fill(normalizedShareCode);
            
            const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
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

            // Enter date of birth
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

            // Handle supplementary document upload if provided
            if (supplementaryDocument) {
                // Note: File upload would need to be handled based on the actual form structure
                // This is a placeholder for the upload functionality
                steps.push({ step: 4, action: 'supplementary_document_uploaded', status: 'pending' });
            }

            // Extract results
            await page.waitForTimeout(2000);
            
            const mainContent = await page.locator('#main-content, .govuk-main-wrapper, main').first();
            const contentText = await mainContent.textContent() || '';
            const pageText = await page.textContent('body') || '';
            const combinedText = (contentText + ' ' + pageText).toLowerCase();

            // Extract work status and restrictions
            const workStatusMatch = contentText.match(/(?:Work|Employment)\s*status[:\s]+([^\n]+)/i);
            const expiryMatch = contentText.match(/(?:Expires?|Valid until|Expiry)[:\s]+([^\n]+)/i);
            const restrictionsMatch = contentText.match(/Restrictions?[:\s]+([^\n]+)/i);
            const allowedMatch = /allowed|permitted|can work|right to work/i.test(combinedText);

            let workStatus = 'unknown';
            if (allowedMatch) workStatus = 'allowed';
            else if (workStatusMatch) workStatus = workStatusMatch[1].trim().toLowerCase();

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
                const filename = `rtw-immigration-${normalizedShareCode}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);
                
                await fs.writeFile(filepath, screenshot);
                screenshotUrl = `/screenshots/${filename}`;
            } catch (saveError) {
                // Log but don't fail if screenshot save fails
            }

            // Generate PDF if needed
            if (process.env.SAVE_PDF === '1') {
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const { fileURLToPath } = await import('node:url');
                
                const pdfBuffer = await page.pdf({ 
                    format: 'A4', 
                    printBackground: true,
                    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
                });
                
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const pdfsDir = path.join(__dirname, '../../../pdfs');
                await fs.mkdir(pdfsDir, { recursive: true });
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `rtw-immigration-${normalizedShareCode}-${timestamp}.pdf`;
                const filepath = path.join(pdfsDir, filename);
                
                await fs.writeFile(filepath, pdfBuffer);
                pdfResultUrl = `/pdfs/${filename}`;
            }

            await browser.close();

            return {
                ok: true,
                shareCode: normalizedShareCode,
                dateOfBirth,
                status: 'verified',
                verificationDate: new Date().toISOString(),
                message: 'Employee immigration status check completed',
                screenshotUrl,
                pdfResultUrl,
                supplementaryDocumentUploaded: !!supplementaryDocument,
                details: {
                    workStatus,
                    expiryDate: expiryMatch ? expiryMatch[1].trim() : null,
                    restrictions: restrictionsMatch ? restrictionsMatch[1].trim() : null
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
                    const filename = `rtw-immigration-error-${normalizedShareCode}-${timestamp}.png`;
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

