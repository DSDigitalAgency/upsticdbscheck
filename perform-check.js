#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { performStatusCheck } from './src/status/flow.js';

function parseFromMarkdown(text) {
    const certMatch = text.match(/Certificate number\s*\n([0-9]+)/i) || text.match(/Certificate Number\s*([0-9]+)/i);
    const dobMatch = text.match(/Date of birth.*\nDay\n(\d+)\nMonth\n(\d+)\nYear\n(\d{4})/i);
    const requesterMatch = text.match(/Check performed by\s+([^\s]+)\s+([^\s]+)/i);

    // Prefer surname from: "Certificate for FIRST LAST,"
    let applicantSurname;
    const nameLine = text.match(/Certificate for\s+([A-Z][A-Z\s'\-]+),/i);
    if (nameLine) {
        const parts = nameLine[1].trim().split(/\s+/);
        applicantSurname = parts[parts.length - 1];
    } else {
        // Fallback: read following line after the labeled field
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (/Applicant’s surname on Certificate/i.test(lines[i])) {
                let j = i + 1;
                while (j < lines.length && lines[j].trim() === '') j++;
                const candidate = (lines[j] || '').trim();
                if (candidate && /[A-Z]{2,}/.test(candidate) && !/Date of birth/i.test(candidate)) {
                    applicantSurname = candidate.replace(/[^A-Za-z'\-\s]/g, '').trim();
                    break;
                }
            }
        }
    }

    return {
        organisationName: 'New Gen',
        requesterForename: requesterMatch ? requesterMatch[1] : 'Kalis',
        requesterSurname: requesterMatch ? requesterMatch[2] : 'Reddy',
        certificateNumber: certMatch ? certMatch[1].trim() : undefined,
        applicantSurname: applicantSurname || 'KUJU',
        dob: {
            day: dobMatch ? dobMatch[1] : '27',
            month: dobMatch ? dobMatch[2] : '5',
            year: dobMatch ? dobMatch[3] : '1994',
        },
    };
}

function parseArgs(argv) {
    const args = new Map();
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        const value = rest.length > 0 ? rest.join('=') : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '');
        args.set(key, value);
    }

    if (args.has('help')) return { help: true };

    if (args.has('json')) {
        return { jsonPath: args.get('json') };
    }

    const hasManual = args.has('organisationName') || args.has('requesterForename') || args.has('certificateNumber');
    if (!hasManual) return null;

    const dob = args.get('dob');
    let day, month, year;
    if (dob && /\d{1,2}\/\d{1,2}\/\d{4}/.test(dob)) {
        const [d, m, y] = dob.split('/');
        day = d; month = m; year = y;
    } else {
        day = args.get('day') || args.get('dobDay');
        month = args.get('month') || args.get('dobMonth');
        year = args.get('year') || args.get('dobYear');
    }

    return {
        details: {
            organisationName: args.get('organisationName'),
            requesterForename: args.get('requesterForename'),
            requesterSurname: args.get('requesterSurname'),
            certificateNumber: args.get('certificateNumber'),
            applicantSurname: args.get('applicantSurname'),
            dob: { day, month, year },
        }
    };
}

function printUsage() {
    // eslint-disable-next-line no-console
    console.log(`Usage:\n  node perform-check.js --json path/to/input.json\n  node perform-check.js --organisationName "New Gen" --requesterForename "Kalis" --requesterSurname "Reddy" --certificateNumber 001913551408 --applicantSurname KUJU --dob 27/5/1994\n  node perform-check.js  (falls back to perform-check.md)`);
}

async function main() {
    const parsed = parseArgs(process.argv);
    if (parsed && parsed.help) {
        printUsage();
        return;
    }

    let details;
    if (parsed && parsed.jsonPath) {
        const jsonPath = new URL(parsed.jsonPath, `file://${process.cwd()}/`);
        const text = await readFile(jsonPath, 'utf8');
        const data = JSON.parse(text);
        details = {
            organisationName: data.organisationName,
            requesterForename: data.requesterForename,
            requesterSurname: data.requesterSurname,
            certificateNumber: data.certificateNumber,
            applicantSurname: data.applicantSurname,
            dob: data.dob,
        };
    } else if (parsed && parsed.details) {
        details = parsed.details;
    } else {
        const mdPath = new URL('./perform-check.md', import.meta.url);
        const mdText = await readFile(mdPath, 'utf8');
        details = parseFromMarkdown(mdText);
    }
    const result = await performStatusCheck(details);
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

    const full = process.argv.includes('--raw');
    if (full) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ input: details, result }, null, 2));
    } else {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(simplified, null, 2));
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});


