import * as cheerio from 'cheerio';
import { loadConfig } from '../shared/config.js';

const config = loadConfig();

function parseSetCookieHeaders(setCookieHeaders = []) {
    const cookieMap = new Map();
    for (const header of setCookieHeaders) {
        const parts = header.split(';');
        const [nameValue] = parts;
        const idx = nameValue.indexOf('=');
        if (idx > 0) {
            const name = nameValue.slice(0, idx).trim();
            const value = nameValue.slice(idx + 1).trim();
            cookieMap.set(name, value);
        }
    }
    return cookieMap;
}

function mergeCookies(jar, newOnes) {
    for (const [name, value] of newOnes.entries()) {
        jar.set(name, value);
    }
    return jar;
}

function cookieHeaderFromJar(jar) {
    const pairs = [];
    for (const [name, value] of jar.entries()) {
        pairs.push(`${name}=${value}`);
    }
    return pairs.join('; ');
}

async function fetchWithCookies(initialUrl, options = {}, cookieJar = new Map(), maxRedirects = 10) {
    let url = initialUrl;
    let redirectCount = 0;
    let referer = options.referer;

    while (true) {
        const headers = new Headers(options.headers || {});
        if (cookieJar.size > 0) {
            headers.set('Cookie', cookieHeaderFromJar(cookieJar));
        }
        headers.set('User-Agent', config.userAgent);
        headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        headers.set('Accept-Language', 'en-GB,en;q=0.9');
        headers.set('Cache-Control', 'no-cache');
        headers.set('Pragma', 'no-cache');
        if (referer) headers.set('Referer', referer);

        const response = await fetch(url, { ...options, headers, redirect: 'manual' });

        // collect cookies
        const setCookie = (response.headers.getSetCookie?.() || []);
        if (Array.isArray(setCookie) && setCookie.length > 0) {
            mergeCookies(cookieJar, parseSetCookieHeaders(setCookie));
        } else {
            const single = response.headers.get('set-cookie');
            if (single) mergeCookies(cookieJar, parseSetCookieHeaders([single]));
        }

        // handle redirects manually
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirectCount++ >= maxRedirects) {
                throw new Error('redirect count exceeded');
            }
            const location = response.headers.get('location');
            if (!location) {
                throw new Error('redirect with no location header');
            }
            referer = url;
            url = absoluteUrl(url, location);
            // For 303 or 302 after POST, switch to GET per RFC
            if ((response.status === 303) || (response.status === 302 && (options.method || 'GET').toUpperCase() !== 'GET')) {
                options = { method: 'GET' };
            }
            // continue loop
            continue;
        }

        const contentType = response.headers.get('content-type') || '';
        let body;
        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml') || contentType.includes('text/plain')) {
            body = await response.text();
        } else {
            const buf = await response.arrayBuffer();
            try {
                body = new TextDecoder('utf-8').decode(buf);
            } catch {
                body = '';
            }
        }
        return { response, body, contentType, cookieJar };
    }
}

function extractForm(html) {
    const $ = cheerio.load(html);
    const form = $('form').first();
    if (!form || form.length === 0) return null;
    const action = form.attr('action') || '';
    const method = (form.attr('method') || 'GET').toUpperCase();
    const inputs = {};
    form.find('input, select, textarea, button').each((_, el) => {
        const name = $(el).attr('name');
        if (!name) return;
        const type = ($(el).attr('type') || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
            const checked = $(el).is(':checked');
            if (checked) {
                inputs[name] = $(el).val() ?? 'on';
            } else if (!(name in inputs)) {
                // leave unchecked unless we intend to set
            }
        } else if ($(el).is('button') || type === 'submit') {
            const value = $(el).val();
            if (name && (name.includes('eventId') || name === '_eventId_submit')) {
                inputs[name] = value ?? 'Continue';
            }
        } else {
            inputs[name] = $(el).val() ?? '';
        }
    });
    return { action, method, inputs, $ };
}

function absoluteUrl(base, maybeRelative) {
    try {
        return new URL(maybeRelative, base).toString();
    } catch {
        return maybeRelative;
    }
}

function urlEncodeForm(fields) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) sp.set(k, String(v));
    }
    return sp.toString();
}

function populateOrganisationFields($, fields) {
    const result = {};
    $('form input').each((_, el) => {
        const name = $(el).attr('name');
        if (!name) return;
        const id = $(el).attr('id');
        const labelText = id ? $(`label[for="${id}"]`).text().toLowerCase() : '';
        const lowerName = name.toLowerCase();
        if (name === 'organisationName') result[name] = fields.organisationName;
        else if (name === 'forename') result[name] = fields.forename;
        else if (name === 'surname') result[name] = fields.surname;
        else if (labelText.includes('organisation') || lowerName.includes('organisation')) result[name] = fields.organisationName;
        else if (labelText.includes('forename') || lowerName.includes('forename')) result[name] = fields.forename;
        else if (labelText.includes('surname') || lowerName.includes('surname')) result[name] = fields.surname;
    });
    return result;
}

function populateCertificateFields($, fields) {
    const result = {};
    $('form input, form select').each((_, el) => {
        const name = $(el).attr('name');
        if (!name) return;
        const id = $(el).attr('id');
        const labelText = id ? $(`label[for="${id}"]`).text().toLowerCase() : '';
        const lowerName = name.toLowerCase();
        if (name === 'certificateNumber') result[name] = fields.certificateNumber;
        else if (name === 'surname') result[name] = fields.applicantSurname;
        else if (name === 'dayOfBirth') result[name] = fields.dob.day;
        else if (name === 'monthOfBirth') result[name] = fields.dob.month;
        else if (name === 'yearOfBirth') result[name] = fields.dob.year;
        else if (labelText.includes('certificate') || lowerName.includes('certificate')) result[name] = fields.certificateNumber;
        else if (labelText.includes('surname') || lowerName.includes('surname')) result[name] = fields.applicantSurname;
        else if (labelText.includes('day') || lowerName.includes('day')) result[name] = fields.dob.day;
        else if (labelText.includes('month') || lowerName.includes('month')) result[name] = fields.dob.month;
        else if (labelText.includes('year') || lowerName.includes('year')) result[name] = fields.dob.year;
    });
    return result;
}

function agreeLegalDeclaration($) {
    const result = {};
    const checkbox = $('form input[type="checkbox"]').filter((_, el) => {
        const id = $(el).attr('id');
        const label = id ? $(`label[for="${id}"]`).text().toLowerCase() : '';
        return label.includes('agree') || label.includes('legal');
    }).first();
    if (checkbox && checkbox.attr('name')) {
        result[checkbox.attr('name')] = checkbox.val() ?? 'on';
    }
    return result;
}

export async function performStatusCheck(details, log = false) {
    const cookieJar = new Map();
    // Normalize inputs defensively
    const norm = {
        organisationName: (details.organisationName || '').trim(),
        requesterForename: (details.requesterForename || '').trim(),
        requesterSurname: (details.requesterSurname || '').trim(),
        certificateNumber: String(details.certificateNumber || '').replace(/\D+/g, '').trim(),
        applicantSurname: String(details.applicantSurname || '').trim().toUpperCase(),
        dob: {
            day: String(details?.dob?.day || '').trim().padStart(2, '0'),
            month: String(details?.dob?.month || '').trim().padStart(2, '0'),
            year: String(details?.dob?.year || '').trim(),
        },
    };
    const steps = [];

    // Step 1: e2s1 - landing organisation details
    const step1 = await fetchWithCookies(config.targets.e2s1, { method: 'GET' }, cookieJar);
    steps.push({ url: config.targets.e2s1, status: step1.response.status });
    let form1 = extractForm(step1.body);
    if (form1) {
        const orgFields = populateOrganisationFields(form1.$, {
            organisationName: norm.organisationName,
            forename: norm.requesterForename,
            surname: norm.requesterSurname,
        });
        if (!('_eventId_submit' in form1.inputs)) {
            form1.inputs._eventId_submit = 'Continue';
        }
        const payload = { ...form1.inputs, ...orgFields };
        const actionUrl = absoluteUrl(step1.response.url, form1.action || config.targets.e2s1);
        const step1Submit = await fetchWithCookies(actionUrl, {
            method: (form1.method || 'POST'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: urlEncodeForm(payload),
        }, cookieJar);
        steps.push({ url: actionUrl, status: step1Submit.response.status });

        // Step 2: redirected to certificate details (execution may vary, e.g., e2s4 or e2s6)
        const form2 = extractForm(step1Submit.body);
        if (form2) {
            const certFields = populateCertificateFields(form2.$, {
                certificateNumber: norm.certificateNumber,
                applicantSurname: norm.applicantSurname,
                dob: norm.dob,
            });
            if (!('_eventId_submit' in form2.inputs)) {
                form2.inputs._eventId_submit = 'Continue';
            }
            const payload2 = { ...form2.inputs, ...certFields };
            const actionUrl2 = absoluteUrl(step1Submit.response.url, form2.action);
            const step2Submit = await fetchWithCookies(actionUrl2, {
                method: (form2.method || 'POST'),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: urlEncodeForm(payload2),
            }, cookieJar);
            steps.push({ url: actionUrl2, status: step2Submit.response.status });

            // Step 3: legal declaration e2s5
            const form3 = extractForm(step2Submit.body);
            if (form3) {
                const agree = agreeLegalDeclaration(form3.$);
                if (!('_eventId_submit' in form3.inputs)) {
                    form3.inputs._eventId_submit = 'Continue';
                }
                const payload3 = { ...form3.inputs, ...agree };
                const actionUrl3 = absoluteUrl(step2Submit.response.url, form3.action);
                const step3Submit = await fetchWithCookies(actionUrl3, {
                    method: (form3.method || 'POST'),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: urlEncodeForm(payload3),
                }, cookieJar);
                steps.push({ url: actionUrl3, status: step3Submit.response.status });

                // Final page likely contains the result text
                const finalHtml = (step3Submit.body || '').toString();
                const $final = cheerio.load(finalHtml);
                const resultText = $final('main').text().trim() || $final('body').text().trim() || null;
                const title = $final('title').text().trim();
                const summary = $final('h1, h2').first().text().trim();

                // Extract structured details
                const bodyText = $final('body').text().replace(/\s+/g, ' ').trim();
                const headerText = $final('main').text().replace(/\s+/g, ' ').trim();
                const combined = `${headerText} ${bodyText}`;

                // Check for website error messages first
                if (/your certificate number is invalid/i.test(combined)) {
                    return {
                        ok: false,
                        error: 'Your Certificate number is invalid',
                        steps,
                        resultText,
                        resultHtml: finalHtml,
                        finalUrl: step3Submit.response.url,
                    };
                }
                if (/please fix the following errors/i.test(combined)) {
                    // Generic validation failure on website
                    return {
                        ok: false,
                        error: 'Website validation failed: Please fix the following errors',
                        steps,
                        resultText,
                        resultHtml: finalHtml,
                        finalUrl: step3Submit.response.url,
                    };
                }
                if (/details entered do not match|do not match those held/i.test(combined)) {
                    const errorMatch = combined.match(/details entered do not match[^.]*\./i);
                    return {
                        ok: false,
                        error: errorMatch ? errorMatch[0].trim() : 'The details entered do not match those held on our system. Please check and try again.',
                        steps,
                        resultText,
                        resultHtml: finalHtml,
                        finalUrl: step3Submit.response.url,
                    };
                }

                const nameMatch = combined.match(/Certificate for\s+([^,]+),/i);
                const dobMatch = combined.match(/Date of Birth:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
                const numberMatch = combined.match(/Certificate Number\s*(\d{12})/i);
                const printDateMatch = combined.match(/Certificate Print Date:\s*(\d{2})\/(\d{2})\/(\d{4})/i);

                let outcomeText = '';
                const outcomeSentences = [
                    'This Certificate did not reveal any information and remains current as no further information has been identified since its issue.',
                    'This Certificate remains current as no further information has been identified since its issue.',
                    'This Certificate is no longer current. Please apply for a new DBS check to get the most up to date information.'
                ];
                for (const sentence of outcomeSentences) {
                    if (combined.includes(sentence)) {
                        outcomeText = sentence;
                        break;
                    }
                }
                let outcome = null;
                if (/no longer current/i.test(outcomeText)) outcome = 'not_current';
                else if (/did not reveal any information/i.test(outcomeText)) outcome = 'clear_and_current';
                else if (/remains current/i.test(outcomeText)) outcome = 'current';

                const structured = {
                    personName: nameMatch ? nameMatch[1].trim() : undefined,
                    dateOfBirth: dobMatch ? `${dobMatch[1]}/${dobMatch[2]}/${dobMatch[3]}` : undefined,
                    certificateNumber: numberMatch ? numberMatch[1] : undefined,
                    certificatePrintDate: printDateMatch ? `${printDateMatch[1]}/${printDateMatch[2]}/${printDateMatch[3]}` : undefined,
                    outcomeText: outcomeText || undefined,
                    outcome,
                };

                // Guardrails: ensure this is a valid, consistent success
                const hasAllCoreFields = Boolean(structured.personName && structured.dateOfBirth && structured.certificateNumber && structured.certificatePrintDate && structured.outcome);
                const looksLikeSuccessPage = /Certificate check results/i.test(summary || '') || /Certificate check results/i.test(title || '');
                const matchesInputCert = details?.certificateNumber ? structured.certificateNumber === String(details.certificateNumber) : true;

                if (!looksLikeSuccessPage || !hasAllCoreFields || !matchesInputCert) {
                    return {
                        ok: false,
                        error: !looksLikeSuccessPage ? 'Unexpected page content' : !hasAllCoreFields ? 'Incomplete result from website' : 'Certificate number mismatch',
                        steps,
                        resultText,
                        resultHtml: finalHtml,
                        finalUrl: step3Submit.response.url,
                        structured,
                    };
                }

                return {
                    ok: true,
                    title,
                    summary,
                    resultText,
                    resultHtml: finalHtml,
                    finalUrl: step3Submit.response.url,
                    structured,
                    steps,
                };
            }
        }
    }

    return { ok: false, error: 'Unable to navigate the status check flow', steps };
}


