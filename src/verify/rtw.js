/**
 * Right to Work (RTW) Verification Implementation
 * Uses Playwright for web scraping the UK Government Right to Work service
 */

/**
 * Helper function to accept cookies if a cookie banner appears
 */
async function acceptCookies(page) {
    try {
        // Common cookie consent selectors
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

export async function verifyRTWShareCode(shareCode, dateOfBirth) {
    if (process.env.PLAYWRIGHT_ENABLED !== '1') {
        return {
            ok: false,
            error: 'Right to Work automation requires PLAYWRIGHT_ENABLED=1'
        };
    }

    // Validate inputs
    const normalizedShareCode = String(shareCode || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalizedShareCode || normalizedShareCode.length !== 9 || !/^[A-Z0-9]{9}$/.test(normalizedShareCode)) {
        return {
            ok: false,
            error: 'Share code must be 9 alphanumeric characters (e.g., ABC123XYZ)'
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
        let screenshot = null;

        try {
            // Step 1: Navigate to RTW view page
            const rtwUrl = 'https://right-to-work.service.gov.uk/rtw-view';
            await page.goto(rtwUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await acceptCookies(page);
            steps.push({ step: 1, url: rtwUrl, status: 'loaded' });

            // Step 2: Enter share code
            await page.waitForSelector('#shareCode', { timeout: 10000 });
            await page.fill('#shareCode', normalizedShareCode);

            // Find and click submit button
            const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
            await submitButton.click();
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            steps.push({ step: 2, action: 'entered_share_code', status: 'submitted' });

            // Check for errors on share code page
            const shareCodeErrors = await page.locator('.govuk-error-message, .govuk-error-summary, [class*="error"]').count();
            if (shareCodeErrors > 0) {
                const errorText = await page.locator('.govuk-error-message, .govuk-error-summary').first().textContent();
                await browser.close();
                return {
                    ok: false,
                    verified: false,
                    status: 'invalid_code',
                    result: 'invalid_details',
                    message: errorText || 'Invalid share code',
                    shareCode: normalizedShareCode,
                    dateOfBirth,
                    verificationDate: new Date().toISOString(),
                    steps
                };
            }

            // Step 3: Enter date of birth
            await page.waitForSelector('#dob-day, #dob-month, #dob-year', { timeout: 10000 });
            await page.fill('#dob-day', day);
            await page.fill('#dob-month', month);
            await page.fill('#dob-year', year);

            const dobSubmitButton = page.locator('button[type="submit"], input[type="submit"]').first();
            await dobSubmitButton.click();
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            steps.push({ step: 3, action: 'entered_date_of_birth', status: 'submitted' });

            // Check for DOB errors
            const dobErrors = await page.locator('.govuk-error-message, .govuk-error-summary, [class*="error"]').count();
            if (dobErrors > 0) {
                const errorText = await page.locator('.govuk-error-message, .govuk-error-summary').first().textContent();
                await browser.close();
                return {
                    ok: false,
                    verified: false,
                    status: 'invalid_dob',
                    result: 'invalid_details',
                    message: errorText || 'Invalid date of birth',
                    shareCode: normalizedShareCode,
                    dateOfBirth,
                    verificationDate: new Date().toISOString(),
                    steps
                };
            }

            // Step 4: Extract results
            await page.waitForTimeout(2000); // Wait for page to fully render

            // Take screenshot
            screenshot = await page.screenshot({ fullPage: true, type: 'png' });
            const screenshotBase64 = Buffer.from(screenshot).toString('base64');

            // Save screenshot to disk
            let screenshotUrl = null;
            try {
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const { fileURLToPath } = await import('node:url');

                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const screenshotsDir = path.join(__dirname, '../../screenshots');
                await fs.mkdir(screenshotsDir, { recursive: true });

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `rtw-${normalizedShareCode}-${timestamp}.png`;
                const filepath = path.join(screenshotsDir, filename);

                await fs.writeFile(filepath, screenshot);
                screenshotUrl = `/screenshots/${filename}`;
                steps.push({ step: 4, action: 'screenshot_saved', filename, filepath: screenshotUrl });
            } catch (saveError) {
                // Log but don't fail if screenshot save fails
                console.error('Screenshot save failed:', saveError);
                steps.push({ step: 4, action: 'screenshot_save_failed', error: saveError.message });
            }

            // Extract content
            const mainContent = await page.locator('#main-content, .govuk-main-wrapper, main').first();
            const contentText = await mainContent.textContent() || '';
            const pageText = await page.textContent('body') || '';

            const combinedText = (contentText + ' ' + pageText).toLowerCase();

            // Extract details using regex patterns
            const nameMatch = contentText.match(/Name[:\s]+([^\n]+)/i);
            const nationalityMatch = contentText.match(/Nationality[:\s]+([^\n]+)/i);
            const workStatusMatch = contentText.match(/(?:Work|Employment)\s*status[:\s]+([^\n]+)/i);
            const restrictionsMatch = contentText.match(/Restrictions?[:\s]+([^\n]+)/i);
            const validUntilMatch = contentText.match(/(?:Valid|Expires?)\s*(?:until|by)?[:\s]+([^\n]+)/i);
            const immigrationStatusMatch = contentText.match(/Immigration\s*status[:\s]+([^\n]+)/i);
            const documentTypeMatch = contentText.match(/Document\s*type[:\s]+([^\n]+)/i);

            // Determine result based on content
            let result = 'check_required';
            let status = 'verified';
            let verified = false;

            if (/has the right to work|right to work in the uk|can work in the uk|employment status|immigration status/i.test(combinedText)) {
                if (/no right to work|does not have the right|cannot work|not permitted to work/i.test(combinedText)) {
                    result = 'no_right_to_work';
                    verified = true;
                } else {
                    result = 'has_right_to_work';
                    verified = true;
                }
            } else if (/not found|no record|cannot find|details do not match|invalid/i.test(combinedText)) {
                result = 'invalid_details';
                status = 'not_found';
                verified = false;
            } else if (/expired|no longer valid/i.test(combinedText)) {
                result = 'invalid_details';
                status = 'expired';
                verified = false;
            }

            const details = {};
            if (nameMatch) details.fullName = nameMatch[1].trim();
            if (nationalityMatch) details.nationality = nationalityMatch[1].trim();
            if (documentTypeMatch) details.documentType = documentTypeMatch[1].trim();
            if (workStatusMatch) details.workStatus = workStatusMatch[1].trim();
            if (restrictionsMatch) details.restrictions = restrictionsMatch[1].trim();
            if (validUntilMatch) details.validUntil = validUntilMatch[1].trim();
            if (immigrationStatusMatch) details.immigrationStatus = immigrationStatusMatch[1].trim();

            await browser.close();

            return {
                ok: true,
                verified,
                data: {
                    shareCode: normalizedShareCode,
                    dateOfBirth,
                    status,
                    result,
                    message: verified
                        ? (result === 'has_right_to_work' ? 'Right to work verified' : 'No right to work')
                        : 'Verification completed but result unclear',
                    details: Object.keys(details).length > 0 ? details : undefined,
                    verificationDate: new Date().toISOString(),
                    screenshot: screenshotBase64,
                    screenshotUrl: screenshotUrl,
                    serviceUrl: 'https://www.gov.uk/view-right-to-work'
                }
            };

        } catch (error) {
            await browser.close();
            return {
                ok: false,
                verified: false,
                status: 'error',
                result: 'error',
                message: `Verification failed: ${error.message}`,
                shareCode: normalizedShareCode,
                dateOfBirth,
                verificationDate: new Date().toISOString(),
                steps,
                error: error.message
            };
        }
    } catch (error) {
        return {
            ok: false,
            verified: false,
            status: 'error',
            result: 'error',
            message: `Playwright initialization failed: ${error.message}`,
            shareCode: normalizedShareCode,
            dateOfBirth,
            verificationDate: new Date().toISOString(),
            error: error.message
        };
    }
}

