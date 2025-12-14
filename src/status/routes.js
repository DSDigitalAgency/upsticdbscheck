import fp from 'fastify-plugin';
import { loadConfig } from '../shared/config.js';
import { checkUrlStatus } from './checker.js';
import { performStatusCheck } from './flow.js';

const config = loadConfig();

async function routes(fastify) {
    // 404 handler for unknown routes
    fastify.setNotFoundHandler(async (request, reply) => {
        return reply.code(404).send({
            ok: false,
            error: 'Not Found',
            path: request.url,
            method: request.method,
        });
    });

    fastify.get('/health', async () => ({ status: 'ok' }));

    fastify.get('/status/:execution', async (request, reply) => {
        const execution = String(request.params.execution || '').toLowerCase();
        const targetUrl = config.targets[execution];
        if (!targetUrl) {
            return reply.code(400).send({ ok: false, error: 'Unknown execution. Use e2s1, e2s4, or e2s5.' });
        }
        const result = await checkUrlStatus(targetUrl);
        return reply.send({ execution, targetUrl, ...result });
    });

    fastify.get('/status', async () => {
        const entries = Object.entries(config.targets);
        const checks = await Promise.all(entries.map(async ([key, url]) => {
            const result = await checkUrlStatus(url);
            return [key, { targetUrl: url, ...result }];
        }));
        return Object.fromEntries(checks);
    });

    fastify.post('/status/check', async (request, reply) => {
        const body = request.body || {};
        const details = {
            organisationName: body.organisationName,
            requesterForename: body.requesterForename,
            requesterSurname: body.requesterSurname,
            certificateNumber: body.certificateNumber,
            applicantSurname: body.applicantSurname,
            dob: {
                day: body.dob?.day,
                month: body.dob?.month,
                year: body.dob?.year,
            },
        };

        // Validation
        const errors = [];
        if (!details.organisationName || details.organisationName.trim() === '') {
            errors.push('organisationName is required');
        }
        if (!details.requesterForename || details.requesterForename.trim() === '') {
            errors.push('requesterForename is required');
        }
        if (!details.requesterSurname || details.requesterSurname.trim() === '') {
            errors.push('requesterSurname is required');
        }
        if (!details.certificateNumber || details.certificateNumber.trim() === '') {
            errors.push('certificateNumber is required');
        }
        if (!details.applicantSurname || details.applicantSurname.trim() === '') {
            errors.push('applicantSurname is required');
        }
        if (!details.dob.day || !details.dob.month || !details.dob.year) {
            errors.push('dob.day, dob.month, and dob.year are all required');
        }

        if (errors.length > 0) {
            request.log.warn({ body, errors }, 'Invalid request');
            return reply.code(400).send({
                ok: false,
                error: 'Validation failed',
                errors,
            });
        }

        try {
            const result = await performStatusCheck(details);

            // Log input and output
            request.log.info({ details }, 'Status check input');
            request.log.info({ result }, 'Status check output');

            // If check failed, return error response
            if (!result.ok) {
                return reply.code(400).send({
                    ok: false,
                    error: result.error || 'Status check failed',
                    steps: result.steps || [],
                });
            }

            // By default, return a simplified response; use ?raw=1 for full
            const wantRaw = request.query?.raw === '1' || request.query?.raw === 1 || request.query?.raw === true;
            if (wantRaw) return reply.send(result);

            const s = result.structured || {};
            const simplified = {
                ok: !!result.ok,
                personName: s.personName,
                dateOfBirth: s.dateOfBirth,
                certificateNumber: s.certificateNumber,
                certificatePrintDate: s.certificatePrintDate,
                outcome: s.outcome,
                outcomeText: s.outcomeText,
            };
            return reply.send(simplified);
        } catch (err) {
            request.log.error({ err, details }, 'Status check exception');
            return reply.code(500).send({
                ok: false,
                error: 'Internal server error',
                message: err.message,
            });
        }
    });

    fastify.get('/status/check/default', async () => {
        const fs = await import('node:fs/promises');
        const path = new URL('../../perform-check.md', import.meta.url);
        const text = await fs.readFile(path, 'utf8');
        const certMatch = text.match(/Certificate number\s*\n([0-9]+)/i) || text.match(/Certificate Number\s*([0-9]+)/i);
        const surnameMatch = text.match(/Applicant’s surname.*\n([A-Z\-\s']+)/i);
        const dobMatch = text.match(/Date of birth.*\nDay\n(\d+)\nMonth\n(\d+)\nYear\n(\d{4})/i);
        const nameLine = text.match(/Certificate for\s+([A-Z\s'\-]+),/i);
        const requesterMatch = text.match(/Check performed by\s+([^\s]+)\s+([^\s]+)/i);

        const details = {
            organisationName: 'Org',
            requesterForename: requesterMatch ? requesterMatch[1] : 'Requester',
            requesterSurname: requesterMatch ? requesterMatch[2] : 'Name',
            certificateNumber: certMatch ? certMatch[1].trim() : undefined,
            applicantSurname: surnameMatch ? surnameMatch[1].trim() : (nameLine ? nameLine[1].split(' ').slice(-1)[0] : undefined),
            dob: {
                day: dobMatch ? dobMatch[1] : undefined,
                month: dobMatch ? dobMatch[2] : undefined,
                year: dobMatch ? dobMatch[3] : undefined,
            },
        };
        const result = await performStatusCheck(details);
        return { input: details, result };
    });
}

export const registerStatusRoutes = fp(async (fastify) => {
    await routes(fastify);
});


