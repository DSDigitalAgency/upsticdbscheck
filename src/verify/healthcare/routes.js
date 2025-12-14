import fp from 'fastify-plugin';
import { checkRegister, REGISTER_CONFIGS } from './registers.js';
import { performStatusCheck } from '../../status/flow.js';

async function healthcareRoutes(fastify) {
    // Healthcare worker comprehensive verification
    fastify.post('/verify/healthcare/worker', async (request, reply) => {
        const body = request.body || {};
        const {
            registrationNumber,
            registerType, // gdc, gmc, nmc, hcpc, etc.
            name,
            dbsDetails,
            rightToWorkShareCode,
        } = body;

        const results = {
            registerCheck: null,
            dbsCheck: null,
            rightToWork: null,
            overall: { verified: false, errors: [] },
        };

        // 1. Professional Register Check
        if (registrationNumber && registerType) {
            if (!REGISTER_CONFIGS[registerType]) {
                results.overall.errors.push(`Invalid register type: ${registerType}`);
            } else {
                try {
                    const regResult = await checkRegister(registerType, { registrationNumber, name });
                    results.registerCheck = regResult;
                    if (!regResult.ok || !regResult.found) {
                        results.overall.errors.push(`Register verification failed: ${regResult.error || 'Not found'}`);
                    }
                } catch (err) {
                    results.overall.errors.push(`Register check error: ${err.message}`);
                }
            }
        }

        // 2. DBS Check
        if (dbsDetails) {
            try {
                const dbsResult = await performStatusCheck(dbsDetails);
                results.dbsCheck = {
                    ok: dbsResult.ok,
                    outcome: dbsResult.structured?.outcome,
                    error: dbsResult.error,
                };
                if (!dbsResult.ok || dbsResult.structured?.outcome === 'not_current') {
                    results.overall.errors.push(`DBS check failed or not current`);
                }
            } catch (err) {
                results.overall.errors.push(`DBS check error: ${err.message}`);
            }
        }

        // 3. Right to Work
        if (rightToWorkShareCode) {
            try {
                const { verifyRTWShareCode } = await import('../rtw.js');
                // Handle both object and string formats
                const shareCode = typeof rightToWorkShareCode === 'string' 
                    ? rightToWorkShareCode 
                    : rightToWorkShareCode.shareCode;
                const dateOfBirth = rightToWorkShareCode.dateOfBirth || rightToWorkShareCode.dob;
                
                if (shareCode && dateOfBirth) {
                    const rtwResult = await verifyRTWShareCode(shareCode, dateOfBirth);
                    results.rightToWork = {
                        ok: rtwResult.ok && rtwResult.verified,
                        verified: rtwResult.verified,
                        result: rtwResult.data?.result,
                        error: rtwResult.error,
                    };
                    if (!rtwResult.ok || !rtwResult.verified) {
                        results.overall.errors.push(`Right to Work verification failed: ${rtwResult.error || 'Not verified'}`);
                    }
                } else {
                    results.rightToWork = {
                        ok: false,
                        error: 'Right to Work requires shareCode and dateOfBirth',
                    };
                }
            } catch (err) {
                results.rightToWork = {
                    ok: false,
                    error: `Right to Work check error: ${err.message}`,
                };
                results.overall.errors.push(`Right to Work check error: ${err.message}`);
            }
        }

        // Overall verification status
        results.overall.verified = results.overall.errors.length === 0 &&
            (results.registerCheck?.found || !registrationNumber) &&
            (results.dbsCheck?.ok || !dbsDetails);

        return reply.send({
            ok: results.overall.verified,
            results,
            timestamp: new Date().toISOString(),
        });
    });

    // Individual register check endpoint
    fastify.post('/verify/healthcare/register/:registerType', async (request, reply) => {
        const registerType = request.params.registerType;
        const body = request.body || {};
        
        if (!REGISTER_CONFIGS[registerType]) {
            return reply.code(400).send({
                ok: false,
                error: `Invalid register type. Available: ${Object.keys(REGISTER_CONFIGS).join(', ')}`,
            });
        }

        const result = await checkRegister(registerType, body);
        return reply.send(result);
    });

    // Agency verification
    fastify.post('/verify/healthcare/agency', async (request, reply) => {
        const { companyName, companyNumber, postcode } = request.body || {};
        const results = {
            companiesHouse: null,
            postcode: null,
            overall: { verified: false },
        };

        // Companies House check
        if (companyNumber) {
            const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
            if (apiKey) {
                try {
                    const auth = Buffer.from(`${apiKey}:`).toString('base64');
                    const res = await fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}`, {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Accept': 'application/json',
                        },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        results.companiesHouse = {
                            ok: true,
                            companyName: data.company_name,
                            status: data.company_status,
                            incorporationDate: data.date_of_creation,
                        };
                    }
                } catch (err) {
                    results.companiesHouse = { ok: false, error: err.message };
                }
            }
        }

        // Postcode validation
        if (postcode) {
            try {
                const res = await fetch(`https://postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`);
                if (res.ok) {
                    const data = await res.json();
                    results.postcode = {
                        ok: true,
                        postcode: data.result?.postcode,
                        adminDistrict: data.result?.admin_district,
                    };
                }
            } catch (err) {
                results.postcode = { ok: false, error: err.message };
            }
        }

        results.overall.verified = (results.companiesHouse?.ok || !companyNumber) && (results.postcode?.ok || !postcode);

        return reply.send({
            ok: results.overall.verified,
            results,
            timestamp: new Date().toISOString(),
        });
    });

    // List available registers
    fastify.get('/verify/healthcare/registers', async () => {
        return {
            ok: true,
            registers: Object.entries(REGISTER_CONFIGS).map(([key, config]) => ({
                code: key,
                name: config.name,
                searchUrl: config.searchUrl,
            })),
        };
    });
}

export const registerHealthcareRoutes = fp(async (fastify) => {
    await healthcareRoutes(fastify);
});

