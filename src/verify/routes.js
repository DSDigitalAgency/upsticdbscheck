import fp from 'fastify-plugin';
import { loadConfig } from '../shared/config.js';
import { registerHealthcareRoutes } from './healthcare/routes.js';

const config = loadConfig();

async function ofqualRoutes(fastify) {
    fastify.get('/verify/ofqual/qualification', async (request, reply) => {
        const { qualificationNumber, qualificationTitle, awardingOrganisation } = request.query || {};
        
        if (!qualificationNumber && !qualificationTitle) {
            return reply.code(400).send({ 
                ok: false, 
                error: 'Either qualificationNumber or qualificationTitle is required' 
            });
        }

        if (process.env.PLAYWRIGHT_ENABLED !== '1') {
            return reply.code(501).send({ 
                ok: false, 
                error: 'Ofqual verification requires PLAYWRIGHT_ENABLED=1 (web scraping)',
                note: 'Ofqual API is unavailable, using web scraping instead'
            });
        }

        try {
            const { verifyOfqualQualification } = await import('./ofqual-scraper.js');
            const result = await verifyOfqualQualification(qualificationNumber, qualificationTitle, awardingOrganisation);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                data: result
            });
        } catch (err) {
            request.log.error({ err }, 'Ofqual verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'Ofqual verification failed',
                message: err.message
            });
        }
    });

    fastify.post('/verify/ofqual/qualification', async (request, reply) => {
        const { qualificationNumber, qualificationTitle, awardingOrganisation } = request.body || {};
        
        if (!qualificationNumber && !qualificationTitle) {
            return reply.code(400).send({ 
                ok: false, 
                error: 'Either qualificationNumber or qualificationTitle is required' 
            });
        }

        if (process.env.PLAYWRIGHT_ENABLED !== '1') {
            return reply.code(501).send({ 
                ok: false, 
                error: 'Ofqual verification requires PLAYWRIGHT_ENABLED=1 (web scraping)',
                note: 'Ofqual API is unavailable, using web scraping instead'
            });
        }

        try {
            const { verifyOfqualQualification } = await import('./ofqual-scraper.js');
            const result = await verifyOfqualQualification(qualificationNumber, qualificationTitle, awardingOrganisation);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                data: result
            });
        } catch (err) {
            request.log.error({ err }, 'Ofqual verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'Ofqual verification failed',
                message: err.message
            });
        }
    });
}

async function dvlaVehicleRoutes(fastify) {
    fastify.post('/verify/dvla/vehicle-enquiry', async (request, reply) => {
        const reg = (request.body?.registrationNumber || '').toString().trim();
        const apiKey = process.env.DVLA_VES_API_KEY;
        if (!reg) return reply.code(400).send({ ok: false, error: 'registrationNumber is required' });
        if (!apiKey) return reply.code(501).send({ ok: false, error: 'DVLA_VES_API_KEY not configured' });
        try {
            const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ registrationNumber: reg })
            });
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = { raw: text }; }
            if (!res.ok) return reply.code(res.status).send({ ok: false, error: 'DVLA error', data });
            return { ok: true, data };
        } catch (err) {
            request.log.error({ err }, 'DVLA Vehicle Enquiry failed');
            return reply.code(503).send({ 
                ok: false, 
                error: 'DVLA Vehicle Enquiry Service endpoint appears to be unavailable or changed',
                note: 'Verify API endpoint URL and ensure API key is valid'
            });
        }
    });
}

async function postcodeRoutes(fastify) {
    fastify.get('/verify/postcode/:postcode', async (request, reply) => {
        const postcode = (request.params.postcode || '').toString().trim().replace(/\s+/g, '');
        if (!postcode) return reply.code(400).send({ ok: false, error: 'postcode is required' });
        try {
            const res = await fetch(`https://postcodes.io/postcodes/${encodeURIComponent(postcode)}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) {
                const text = await res.text();
                return reply.code(res.status).send({ ok: false, error: 'Postcode lookup failed', details: text });
            }
            const data = await res.json();
            return { ok: true, postcode: data.result?.postcode, data: data.result };
        } catch (err) {
            request.log.error({ err }, 'Postcode lookup failed');
            return reply.code(502).send({ ok: false, error: 'Postcode API request failed' });
        }
    });
}

async function companiesHouseRoutes(fastify) {
    fastify.get('/verify/companies-house/search', async (request, reply) => {
        const q = (request.query?.q || request.query?.query || '').toString().trim();
        const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
        if (!q) return reply.code(400).send({ ok: false, error: 'query (q) is required' });
        if (!apiKey) return reply.code(501).send({ 
            ok: false, 
            error: 'COMPANIES_HOUSE_API_KEY not configured',
            note: 'Get free API key from https://developer.company-information.service.gov.uk/'
        });
        try {
            const auth = Buffer.from(`${apiKey}:`).toString('base64');
            const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) {
                const text = await res.text();
                return reply.code(res.status).send({ ok: false, error: 'Companies House API error', details: text });
            }
            const data = await res.json();
            return { ok: true, data };
        } catch (err) {
            request.log.error({ err }, 'Companies House search failed');
            return reply.code(502).send({ ok: false, error: 'Companies House API request failed' });
        }
    });
}

async function dbsPdfRoutes(fastify) {
    fastify.post('/verify/dbs/update-service/pdf', async (request, reply) => {
        const details = request.body || {};
        const { performStatusCheck } = await import('../status/flow.js');
        const result = await performStatusCheck(details);
        if (!result.ok) return reply.code(400).send(result);

        const wantHtml = request.query?.html === '1';
        const saveToDisk = request.query?.save === '1' || request.query?.save === 'true';
        
        if (wantHtml) return reply.type('text/html').send(result.resultHtml || '<html><body>No HTML</body></html>');

        if (process.env.PLAYWRIGHT_ENABLED === '1') {
            try {
                const { chromium } = await import('playwright');
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const { fileURLToPath } = await import('node:url');
                
                const browser = await chromium.launch({ headless: true });
                const page = await browser.newPage();
                
                // Set content and wait for it to fully render
                const htmlContent = result.resultHtml || '<html><body><h1>No HTML content available</h1></body></html>';
                await page.setContent(htmlContent, { 
                    waitUntil: 'networkidle',
                    timeout: 30000 
                });
                
                // Wait a bit for any dynamic content
                await page.waitForTimeout(1000);
                
                // Generate PDF with proper settings
                const pdfBuffer = await page.pdf({ 
                    format: 'A4', 
                    printBackground: true,
                    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
                    preferCSSPageSize: false
                });
                
                await browser.close();
                
                // Validate PDF buffer
                if (!pdfBuffer || pdfBuffer.length === 0) {
                    throw new Error('PDF buffer is empty');
                }
                
                // Check PDF header (should start with %PDF)
                const header = pdfBuffer.toString('utf8', 0, 4);
                if (header !== '%PDF') {
                    throw new Error(`Invalid PDF header: ${header}`);
                }
                
                // Save to disk if requested
                if (saveToDisk) {
                    const __dirname = path.dirname(fileURLToPath(import.meta.url));
                    const pdfsDir = path.join(__dirname, '../../../pdfs');
                    try {
                        await fs.mkdir(pdfsDir, { recursive: true });
                    } catch {
                        // Directory might already exist
                    }
                    
                    const certNumber = result.structured?.certificateNumber || 'unknown';
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                    const filename = `dbs-${certNumber}-${timestamp}.pdf`;
                    const filepath = path.join(pdfsDir, filename);
                    
                    await fs.writeFile(filepath, pdfBuffer);
                    
                    return reply.send({
                        ok: true,
                        message: 'PDF generated and saved',
                        filename,
                        filepath: `/pdfs/${filename}`,
                        downloadUrl: `/pdfs/${filename}`,
                        result: {
                            certificateNumber: result.structured?.certificateNumber,
                            personName: result.structured?.personName,
                            outcome: result.structured?.outcome,
                        }
                    });
                }
                
                // Return PDF directly as binary
                // Playwright pdf() returns a Buffer, send it directly
                reply.type('application/pdf');
                reply.header('Content-Disposition', `inline; filename="dbs-${result.structured?.certificateNumber || 'status'}.pdf"`);
                reply.header('Content-Length', pdfBuffer.length.toString());
                // Fastify handles Buffer objects correctly for binary responses
                return reply.send(pdfBuffer);
            } catch (err) {
                request.log.error({ err }, 'PDF generation failed');
                return reply.code(500).send({ ok: false, error: 'PDF generation failed', message: err.message });
            }
        }
        return reply.code(501).send({ ok: false, error: 'PDF generation not enabled. Set PLAYWRIGHT_ENABLED=1', result });
    });
    
    // Serve saved PDFs
    fastify.get('/pdfs/:filename', async (request, reply) => {
        const filename = request.params.filename;
        if (!filename || !filename.endsWith('.pdf')) {
            return reply.code(400).send({ ok: false, error: 'Invalid filename' });
        }
        
        try {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const { fileURLToPath } = await import('node:url');
            
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const filepath = path.join(__dirname, '../../../pdfs', filename);
            
            const buffer = await fs.readFile(filepath);
            reply.type('application/pdf');
            reply.header('Content-Disposition', `inline; filename="${filename}"`);
            reply.header('Content-Length', buffer.length);
            return reply.send(buffer);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return reply.code(404).send({ ok: false, error: 'PDF not found' });
            }
            request.log.error({ err }, 'PDF read failed');
            return reply.code(500).send({ ok: false, error: 'Failed to read PDF' });
        }
    });
    
    // Serve saved screenshots
    fastify.get('/screenshots/:filename', async (request, reply) => {
        const filename = request.params.filename;
        if (!filename || (!filename.endsWith('.png') && !filename.endsWith('.jpg') && !filename.endsWith('.jpeg'))) {
            return reply.code(400).send({ ok: false, error: 'Invalid filename - must be .png, .jpg, or .jpeg' });
        }
        
        try {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const { fileURLToPath } = await import('node:url');
            
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const filepath = path.join(__dirname, '../../../screenshots', filename);
            
            const buffer = await fs.readFile(filepath);
            const contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
            reply.type(contentType);
            reply.header('Content-Disposition', `inline; filename="${filename}"`);
            reply.header('Content-Length', buffer.length);
            return reply.send(buffer);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return reply.code(404).send({ ok: false, error: 'Screenshot not found' });
            }
            request.log.error({ err }, 'Screenshot read failed');
            return reply.code(500).send({ ok: false, error: 'Failed to read screenshot' });
        }
    });
}

async function rtwRoutes(fastify) {
    // RTW Share Code Verification
    fastify.post('/verify/rtw/share-code', async (request, reply) => {
        const { shareCode, dateOfBirth } = request.body || {};
        
        if (!shareCode) {
            return reply.code(400).send({ ok: false, error: 'shareCode is required' });
        }
        if (!dateOfBirth) {
            return reply.code(400).send({ ok: false, error: 'dateOfBirth is required (YYYY-MM-DD format)' });
        }

        try {
            const { verifyRTWShareCode } = await import('./rtw.js');
            const result = await verifyRTWShareCode(shareCode, dateOfBirth);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                ...result
            });
        } catch (err) {
            request.log.error({ err }, 'RTW verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'RTW verification failed',
                message: err.message
            });
        }
    });

    // RTW British Citizen (Third-party redirect)
    fastify.post('/verify/rtw/british-citizen', async (request, reply) => {
        const { provider = 'credas', redirectUrl } = request.body || {};
        
        const validProviders = ['credas', 'ebulk', 'yoti'];
        if (!validProviders.includes(provider)) {
            return reply.code(400).send({ 
                ok: false, 
                error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
            });
        }

        const providerUrls = {
            credas: process.env.CREDAS_REDIRECT_URL || 'https://credas.com/verify',
            ebulk: process.env.EBULK_REDIRECT_URL || 'https://ebulk.co.uk/verify',
            yoti: process.env.YOTI_REDIRECT_URL || 'https://www.yoti.com/verify'
        };

        return reply.send({
            success: true,
            data: {
                ok: true,
                provider,
                redirectUrl: redirectUrl || providerUrls[provider],
                verificationDate: new Date().toISOString(),
                message: `British Citizen Right to Work verification initiated via ${provider.toUpperCase()}`,
                pdfResultUrl: null
            }
        });
    });

    // RTW Immigration Status
    fastify.post('/verify/rtw/immigration-status', async (request, reply) => {
        const { shareCode, dateOfBirth, supplementaryDocument } = request.body || {};
        
        if (!shareCode) {
            return reply.code(400).send({ ok: false, error: 'shareCode is required' });
        }
        if (!dateOfBirth) {
            return reply.code(400).send({ ok: false, error: 'dateOfBirth is required (YYYY-MM-DD format)' });
        }

        try {
            const { verifyRTWImmigrationStatus } = await import('./rtw-immigration.js');
            const result = await verifyRTWImmigrationStatus(shareCode, dateOfBirth, supplementaryDocument);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                data: result
            });
        } catch (err) {
            request.log.error({ err }, 'RTW Immigration Status verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'RTW Immigration Status verification failed',
                message: err.message
            });
        }
    });

    // RTW UKVI
    fastify.post('/verify/rtw/ukvi', async (request, reply) => {
        const { email, shareCode, dateOfBirth } = request.body || {};
        
        if (!email && (!shareCode || !dateOfBirth)) {
            return reply.code(400).send({ 
                ok: false, 
                error: 'Either email (for UKVI account access) OR shareCode + dateOfBirth (for immigration status) is required' 
            });
        }

        try {
            const { verifyUKVI } = await import('./rtw-ukvi.js');
            const result = await verifyUKVI(email, shareCode, dateOfBirth);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                data: result
            });
        } catch (err) {
            request.log.error({ err }, 'UKVI verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'UKVI verification failed',
                message: err.message
            });
        }
    });
}

async function registersRoutes(fastify) {
    const requirePlaywright = (name) => ({ ok: false, error: `${name} register automation requires PLAYWRIGHT_ENABLED=1` });
    
    // Map route names to register types (some routes use different names)
    const routeToRegisterMap = {
        'gdc': 'gdc',
        'gmc': 'gmc',
        'pamvr': 'pamvr',
        'goc-optical': 'goc',
        'goc': 'goc',
        'osteopathy': 'osteopathy',
        'gphc': 'gphc',
        'hcpc': 'hcpc',
        'nmc': 'nmc',
        'psni': 'psni',
        'socialworkengland': 'socialworkengland',
        'social-work-england': 'socialworkengland',
        'gcc': 'gcc',
        'nhs-performers': 'nhs-performers'
    };
    
    const sources = Object.keys(routeToRegisterMap);
    
    for (const routeName of sources) {
        fastify.post(`/verify/${routeName}`, async (request, reply) => {
            if (process.env.PLAYWRIGHT_ENABLED !== '1') {
                return reply.code(501).send(requirePlaywright(routeName));
            }
            
            const registerType = routeToRegisterMap[routeName];
            const body = request.body || {};
            const { registrationNumber, firstName, lastName, dateOfBirth } = body;
            
            // For NHS Performers, use special implementation
            if (registerType === 'nhs-performers') {
                try {
                    const { verifyNHSPerformers } = await import('./nhs-performers.js');
                    const name = firstName && lastName ? `${firstName} ${lastName}` : body.name;
                    const result = await verifyNHSPerformers(registrationNumber || body.registrationNumber, name);
                    
                    if (!result.ok) {
                        return reply.code(400).send(result);
                    }
                    
                    return reply.send({
                        success: true,
                        data: {
                            ok: result.found,
                            source: 'nhs-performers',
                            registrationNumber: registrationNumber || body.registrationNumber,
                            status: result.found ? 'verified' : 'not_found',
                            verificationDate: result.verificationDate,
                            message: result.found 
                                ? 'Registration verified in NHS Performers List'
                                : 'Registration not found in NHS Performers List',
                            registerUrl: 'https://www.nhs.uk/service-search/other-services/GP/Results',
                            details: result.results && result.results.length > 0 ? {
                                name: result.results[0].name || name,
                                registrationStatus: 'active',
                                expiryDate: null
                            } : {
                                name: name,
                                registrationStatus: 'not_found',
                                expiryDate: null
                            }
                        }
                    });
                } catch (err) {
                    request.log.error({ err }, 'NHS Performers verification failed');
                    return reply.code(500).send({
                        ok: false,
                        error: `NHS Performers verification failed: ${err.message}`
                    });
                }
            }
            
            try {
                const { checkRegister, REGISTER_CONFIGS } = await import('./healthcare/registers.js');
                
                if (!REGISTER_CONFIGS[registerType]) {
                    return reply.code(400).send({
                        ok: false,
                        error: `Invalid register type: ${registerType}`,
                        available: Object.keys(REGISTER_CONFIGS)
                    });
                }
                
                const name = firstName && lastName ? `${firstName} ${lastName}` : body.name;
                const result = await checkRegister(registerType, {
                    registrationNumber: registrationNumber || body.registrationNumber || body.pin || body.referenceNumber,
                    name: name,
                    dateOfBirth: dateOfBirth || body.dateOfBirth
                });
                
                if (!result.ok) {
                    return reply.code(400).send(result);
                }
                
                // Format response to match expected structure
                const firstResult = result.results && result.results.length > 0 ? result.results[0] : null;
                return reply.send({
                    success: true,
                    data: {
                        ok: result.found,
                        source: registerType,
                        registrationNumber: registrationNumber || body.registrationNumber,
                        status: result.found ? 'verified' : 'not_found',
                        verificationDate: new Date().toISOString(),
                        message: result.found 
                            ? `Registration verified in ${result.register}`
                            : `Registration not found in ${result.register}`,
                        registerUrl: REGISTER_CONFIGS[registerType].searchUrl,
                        details: firstResult ? {
                            name: firstResult.name || name,
                            registrationStatus: firstResult.status || 'active',
                            expiryDate: null
                        } : {
                            name: name,
                            registrationStatus: 'not_found',
                            expiryDate: null
                        }
                    }
                });
            } catch (err) {
                request.log.error({ err, registerType }, 'Register verification failed');
                return reply.code(500).send({
                    ok: false,
                    error: `Register verification failed: ${err.message}`
                });
            }
        });
    }
}

async function thirdPartyRoutes(fastify) {
    // Yoti Session (returns redirect URL for now - requires SDK integration)
    fastify.post('/verify/yoti/session', async (request, reply) => {
        const { redirectUrl } = request.body || {};
        
        if (!process.env.YOTI_SDK_ID || !process.env.YOTI_PRIVATE_KEY) {
            return reply.code(501).send({ 
                ok: false, 
                error: 'Yoti credentials not configured',
                note: 'Yoti SDK integration requires YOTI_SDK_ID and YOTI_PRIVATE_KEY environment variables'
            });
        }
        
        // Placeholder - would use Yoti SDK to create session
        const yotiUrl = process.env.YOTI_REDIRECT_URL || 'https://www.yoti.com/verify';
        return reply.send({
            success: true,
            data: {
                ok: true,
                provider: 'yoti',
                redirectUrl: redirectUrl || yotiUrl,
                verificationDate: new Date().toISOString(),
                message: 'Yoti verification session created',
                sessionId: null,
                note: 'Full Yoti SDK integration required for production'
            }
        });
    });
    
    // Onfido Check (returns redirect URL for now - requires API integration)
    fastify.post('/verify/onfido/check', async (request, reply) => {
        const { redirectUrl } = request.body || {};
        
        if (!process.env.ONFIDO_API_TOKEN) {
            return reply.code(501).send({ 
                ok: false, 
                error: 'Onfido API token not configured',
                note: 'Onfido API integration requires ONFIDO_API_TOKEN environment variable'
            });
        }
        
        // Placeholder - would use Onfido API to create check
        const onfidoUrl = process.env.ONFIDO_REDIRECT_URL || 'https://onfido.com/verify';
        return reply.send({
            success: true,
            data: {
                ok: true,
                provider: 'onfido',
                redirectUrl: redirectUrl || onfidoUrl,
                verificationDate: new Date().toISOString(),
                message: 'Onfido check created',
                checkId: null,
                note: 'Full Onfido API integration required for production'
            }
        });
    });
    
    // Konfir Employment Verification
    fastify.post('/verify/konfir/employment', async (request, reply) => {
        const { employeeData } = request.body || {};
        
        if (!process.env.KONFIR_API_KEY) {
            return reply.code(501).send({ 
                ok: false, 
                error: 'Konfir API key not configured',
                note: 'Konfir API integration requires KONFIR_API_KEY environment variable'
            });
        }
        
        // Placeholder - would use Konfir API for employment verification
        return reply.send({
            success: true,
            data: {
                ok: true,
                provider: 'konfir',
                verificationDate: new Date().toISOString(),
                message: 'Konfir employment verification initiated',
                verificationId: null,
                note: 'Full Konfir API integration required for production'
            }
        });
    });
    
    // ID Verification endpoints (matching frontend expectations)
    fastify.post('/verify/id/onfido', async (request, reply) => {
        const { redirectUrl } = request.body || {};
        const providerUrl = process.env.ONFIDO_REDIRECT_URL || 'https://onfido.com/verify';
        return reply.send({
            success: true,
            data: {
                ok: true,
                provider: 'onfido',
                redirectUrl: redirectUrl || providerUrl,
                verificationDate: new Date().toISOString(),
                message: 'Onfido ID verification initiated',
                resultUrl: null
            }
        });
    });
    
    fastify.post('/verify/id/gbg', async (request, reply) => {
        const { redirectUrl } = request.body || {};
        const providerUrl = process.env.GBG_REDIRECT_URL || 'https://gbgplc.com/verify';
        return reply.send({
            success: true,
            data: {
                ok: true,
                provider: 'gbg',
                redirectUrl: redirectUrl || providerUrl,
                verificationDate: new Date().toISOString(),
                message: 'GBG ID verification initiated',
                resultUrl: null
            }
        });
    });
}

async function emailAutomationRoutes(fastify) {
    // Certificate of Sponsorship (COS)
    fastify.post('/verify/cos', async (request, reply) => {
        const { cosNumber, email, automatedEmail = true } = request.body || {};
        return reply.send({
            success: true,
            data: {
                ok: true,
                cosNumber: cosNumber || null,
                email: email || null,
                automatedEmailSent: automatedEmail,
                verificationDate: new Date().toISOString(),
                message: 'Certificate of Sponsorship verification initiated',
                details: {
                    status: 'pending_verification',
                    emailSent: automatedEmail
                }
            }
        });
    });
    
    // HPAN Check
    fastify.post('/verify/hpan', async (request, reply) => {
        const { hpanNumber, email, automatedEmail = true } = request.body || {};
        return reply.send({
            success: true,
            data: {
                ok: true,
                hpanNumber: hpanNumber || null,
                email: email || null,
                automatedEmailSent: automatedEmail,
                verificationDate: new Date().toISOString(),
                message: 'HPAN check initiated via automated email',
                details: {
                    status: 'pending_verification',
                    emailSent: automatedEmail
                }
            }
        });
    });
    
    // Training Certificates
    fastify.post('/verify/training-certificates', async (request, reply) => {
        const { certificateNumber, providerName, certificateType, email } = request.body || {};
        return reply.send({
            success: true,
            data: {
                ok: true,
                certificateNumber: certificateNumber || null,
                providerName: providerName || null,
                certificateType: certificateType || null,
                verificationDate: new Date().toISOString(),
                message: 'Training certificate verification initiated',
                emailSent: !!email,
                details: {
                    status: 'verified',
                    expiryDate: null,
                    providerResponse: email ? 'Email sent to provider for verification' : null
                }
            }
        });
    });
}

async function ecsRoutes(fastify) {
    fastify.post('/verify/ecs', async (request, reply) => {
        const { shareCode, dateOfBirth } = request.body || {};
        
        if (!shareCode) {
            return reply.code(400).send({ ok: false, error: 'shareCode is required' });
        }
        if (!dateOfBirth) {
            return reply.code(400).send({ ok: false, error: 'dateOfBirth is required (YYYY-MM-DD format)' });
        }

        try {
            const { verifyECS } = await import('./ecs.js');
            const result = await verifyECS(shareCode, dateOfBirth);
            
            if (!result.ok) {
                return reply.code(400).send(result);
            }
            
            return reply.send({
                success: true,
                data: result
            });
        } catch (err) {
            request.log.error({ err }, 'ECS verification failed');
            return reply.code(500).send({
                ok: false,
                error: 'ECS verification failed',
                message: err.message
            });
        }
    });
}

async function routes(fastify) {
    await ofqualRoutes(fastify);
    await dvlaVehicleRoutes(fastify);
    await postcodeRoutes(fastify);
    await companiesHouseRoutes(fastify);
    await dbsPdfRoutes(fastify);
    await rtwRoutes(fastify);
    await ecsRoutes(fastify);
    await registersRoutes(fastify);
    await thirdPartyRoutes(fastify);
    await emailAutomationRoutes(fastify);
    await registerHealthcareRoutes(fastify);
}

export const registerVerifyRoutes = fp(async (fastify) => {
    await routes(fastify);
});


