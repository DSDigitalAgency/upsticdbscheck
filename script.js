#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { performStatusCheck } from './src/status/flow.js';

function parseArgs(argv) {
    const args = new Map();
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        const value = rest.length ? rest.join('=') : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '');
        args.set(key, value);
    }
    return args;
}

function asCase(name, details) {
    return { name, details };
}

function summarizeResult(name, input, result) {
    const s = result.structured || {};
    return {
        case: name,
        ok: !!result.ok,
        error: result.error || undefined,
        personName: s.personName,
        dateOfBirth: s.dateOfBirth,
        certificateNumber: s.certificateNumber,
        certificatePrintDate: s.certificatePrintDate,
        outcome: s.outcome,
        outcomeText: s.outcomeText,
    };
}

async function main() {
    const args = parseArgs(process.argv);

    let cases = [];
    if (args.has('json')) {
        const path = new URL(args.get('json'), `file://${process.cwd()}/`);
        const text = await readFile(path, 'utf8');
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error('JSON must be an array of cases');
        cases = arr.map((c, idx) => asCase(c.name || `case_${idx + 1}`, c.details || c));
    } else {
        // Default demo cases
        cases = [
            asCase('mary_sakyi', {
                organisationName: 'New Gen',
                requesterForename: 'Megha',
                requesterSurname: 'Sah',
                certificateNumber: '001852310824',
                applicantSurname: 'SAKYI',
                dob: { day: '16', month: '10', year: '1981' },
            }),
            asCase('valid_kuju', {
                organisationName: 'New Gen',
                requesterForename: 'Kalis',
                requesterSurname: 'Reddy',
                certificateNumber: '001913551408',
                applicantSurname: 'KUJU',
                dob: { day: '27', month: '5', year: '1994' },
            }),
            asCase('wrong_surname', {
                organisationName: 'New Gen',
                requesterForename: 'Kalis',
                requesterSurname: 'Reddy',
                certificateNumber: '001913551408',
                applicantSurname: 'WRONGSURNAME',
                dob: { day: '27', month: '5', year: '1994' },
            }),
            asCase('wrong_certificate', {
                organisationName: 'New Gen',
                requesterForename: 'Kalis',
                requesterSurname: 'Reddy',
                certificateNumber: '00191355140823',
                applicantSurname: 'KUJU',
                dob: { day: '27', month: '5', year: '1994' },
            }),
        ];
    }

    const results = [];
    for (const c of cases) {
        try {
            const res = await performStatusCheck(c.details);
            const summary = summarizeResult(c.name, c.details, res);
            results.push(summary);
            if (!args.has('quiet')) {
                if (summary.ok) {
                    // eslint-disable-next-line no-console
                    console.log(`[OK] ${summary.case} → ${summary.outcome} | ${summary.personName} | ${summary.certificateNumber}`);
                } else {
                    // eslint-disable-next-line no-console
                    console.log(`[FAIL] ${summary.case} → ${summary.error}`);
                }
            }
        } catch (err) {
            results.push({ case: c.name, ok: false, error: err.message });
            if (!args.has('quiet')) {
                // eslint-disable-next-line no-console
                console.log(`[FAIL] ${c.name} → ${err.message}`);
            }
        }
    }

    if (args.has('json') || args.has('printJson')) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ count: results.length, results }, null, 2));
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});


