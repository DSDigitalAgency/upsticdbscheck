#!/usr/bin/env node
/**
 * Comprehensive test script for ALL verification methods
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5002';
const PLAYWRIGHT_ENABLED = process.env.PLAYWRIGHT_ENABLED === '1';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test data from screenshots
const testData = {
    dbs: {
        name: 'DBS Certificate Check',
        method: 'POST',
        path: '/status/check',
        body: {
            organisationName: 'Test Organisation',
            requesterForename: 'SANGEETHA',
            requesterSurname: 'DYANA KOSHY',
            certificateNumber: '001902752645',
            applicantSurname: 'DYANA KOSHY',
            dob: { day: '13', month: '11', year: '1986' }
        },
        expectedStatus: [200, 400]
    },
    rtwShareCode: {
        name: 'RTW Share Code',
        method: 'POST',
        path: '/verify/rtw/share-code',
        body: {
            shareCode: 'W5LLFY5DN',
            dateOfBirth: '1986-11-13'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    rtwImmigration: {
        name: 'RTW Immigration Status',
        method: 'POST',
        path: '/verify/rtw/immigration-status',
        body: {
            shareCode: 'W5LLFY5DN',
            dateOfBirth: '1986-11-13'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    rtwUKVI: {
        name: 'RTW UKVI',
        method: 'POST',
        path: '/verify/rtw/ukvi',
        body: {
            shareCode: 'W5LLFY5DN',
            dateOfBirth: '1986-11-13'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    rtwBritish: {
        name: 'RTW British Citizen',
        method: 'POST',
        path: '/verify/rtw/british-citizen',
        body: {
            provider: 'credas'
        },
        expectedStatus: [200]
    },
    ecs: {
        name: 'ECS Verification',
        method: 'POST',
        path: '/verify/ecs',
        body: {
            shareCode: 'W5LLFY5DN',
            dateOfBirth: '1986-11-13'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    nmc: {
        name: 'Professional Register - NMC',
        method: 'POST',
        path: '/verify/nmc',
        body: {
            registrationNumber: '19F05740',
            firstName: 'SANGEETHA',
            lastName: 'DYANA KOSHY'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    nhsPerformers: {
        name: 'NHS Performers List',
        method: 'POST',
        path: '/verify/nhs-performers',
        body: {
            registrationNumber: '19F05740',
            name: 'SANGEETHA DYANA KOSHY'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    ofqual: {
        name: 'Ofqual Qualification',
        method: 'GET',
        path: '/verify/ofqual/qualification?qualificationNumber=JBJGJG&qualificationTitle=NVHFGVJBG&awardingOrganisation=GUGUGU',
        expectedStatus: [200, 400, 501, 503],
        requiresPlaywright: true
    },
    dbsPdf: {
        name: 'DBS Update Service PDF',
        method: 'POST',
        path: '/verify/dbs/update-service/pdf',
        body: {
            organisationName: 'Test Organisation',
            requesterForename: 'SANGEETHA',
            requesterSurname: 'DYANA KOSHY',
            certificateNumber: '001902752645',
            applicantSurname: 'DYANA KOSHY',
            dob: { day: '13', month: '11', year: '1986' }
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    postcode: {
        name: 'Postcode Lookup',
        method: 'GET',
        path: '/verify/postcode/SW1A1AA',
        expectedStatus: [200, 400]
    },
    companiesHouse: {
        name: 'Companies House',
        method: 'GET',
        path: '/verify/companies-house/search?q=test',
        expectedStatus: [200, 400, 501]
    },
    dvla: {
        name: 'DVLA Vehicle',
        method: 'POST',
        path: '/verify/dvla/vehicle-enquiry',
        body: { registrationNumber: 'AB12CDE' },
        expectedStatus: [200, 400, 501, 503]
    },
    cos: {
        name: 'Certificate of Sponsorship',
        method: 'POST',
        path: '/verify/cos',
        body: {
            cosNumber: 'LKKNJGHFGF',
            email: 'KO@PROXY.COM'
        },
        expectedStatus: [200]
    },
    hpan: {
        name: 'HPAN Check',
        method: 'POST',
        path: '/verify/hpan',
        body: {
            hpanNumber: 'HVHGJBJB',
            email: 'MBJGJB'
        },
        expectedStatus: [200]
    },
    training: {
        name: 'Training Certificates',
        method: 'POST',
        path: '/verify/training-certificates',
        body: {
            certificateNumber: 'NBJBKBHK',
            providerName: 'MBNJKKN',
            certificateType: 'JBJGHIHIH',
            email: 'JBJIHIHIHN'
        },
        expectedStatus: [200]
    },
    onfidoId: {
        name: 'Onfido ID Verification',
        method: 'POST',
        path: '/verify/id/onfido',
        body: {},
        expectedStatus: [200]
    },
    gbgId: {
        name: 'GBG ID Verification',
        method: 'POST',
        path: '/verify/id/gbg',
        body: {},
        expectedStatus: [200]
    },
    yoti: {
        name: 'Yoti Session',
        method: 'POST',
        path: '/verify/yoti/session',
        body: {},
        expectedStatus: [200, 501]
    },
    onfidoCheck: {
        name: 'Onfido Check',
        method: 'POST',
        path: '/verify/onfido/check',
        body: {},
        expectedStatus: [200, 501]
    },
    konfir: {
        name: 'Konfir Employment',
        method: 'POST',
        path: '/verify/konfir/employment',
        body: {},
        expectedStatus: [200, 501]
    },
    healthcareRegister: {
        name: 'Healthcare Register - NMC',
        method: 'POST',
        path: '/verify/healthcare/register/nmc',
        body: {
            registrationNumber: '19F05740',
            name: 'SANGEETHA DYANA KOSHY'
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    },
    healthcareWorker: {
        name: 'Healthcare Worker Comprehensive',
        method: 'POST',
        path: '/verify/healthcare/worker',
        body: {
            registrationNumber: '19F05740',
            registerType: 'nmc',
            name: 'SANGEETHA DYANA KOSHY',
            dbsDetails: {
                organisationName: 'Test Organisation',
                requesterForename: 'SANGEETHA',
                requesterSurname: 'DYANA KOSHY',
                certificateNumber: '001902752645',
                applicantSurname: 'DYANA KOSHY',
                dob: { day: '13', month: '11', year: '1986' }
            },
            rightToWorkShareCode: {
                shareCode: 'W5LLFY5DN',
                dateOfBirth: '1986-11-13'
            }
        },
        expectedStatus: [200, 400, 501],
        requiresPlaywright: true
    }
};

async function runTest(testName, testConfig) {
    const { method, path, body, expectedStatus, requiresPlaywright } = testConfig;
    
    if (requiresPlaywright && !PLAYWRIGHT_ENABLED) {
        return {
            name: testName,
            skipped: true,
            reason: 'Requires PLAYWRIGHT_ENABLED=1'
        };
    }
    
    const url = `${BASE_URL}${path}`;
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
    }
    
    const startTime = Date.now();
    try {
        const response = await fetch(url, options);
        const elapsed = Date.now() - startTime;
        const status = response.status;
        const contentType = response.headers.get('content-type') || '';
        
        let data = null;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType.includes('text/')) {
            data = await response.text();
        } else if (contentType.includes('application/pdf')) {
            const buffer = await response.arrayBuffer();
            data = `[PDF binary, ${buffer.byteLength} bytes]`;
        } else {
            data = await response.text();
        }
        
        const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
        const isExpectedStatus = expectedStatuses.includes(status);
        const success = status >= 200 && status < 300;
        
        return {
            name: testName,
            status,
            expectedStatus: expectedStatuses,
            isExpectedStatus,
            success,
            elapsed,
            data: data ? (typeof data === 'string' && data.length > 200 ? data.substring(0, 200) + '...' : data) : null
        };
    } catch (error) {
        return {
            name: testName,
            error: error.message,
            elapsed: Date.now() - startTime,
            success: false
        };
    }
}

async function main() {
    log('\n🧪 Testing ALL Verification Methods\n', 'cyan');
    log(`Base URL: ${BASE_URL}`, 'blue');
    log(`Playwright Enabled: ${PLAYWRIGHT_ENABLED ? 'Yes ✓' : 'No ✗'}`, PLAYWRIGHT_ENABLED ? 'green' : 'red');
    log('', 'reset');
    
    const tests = Object.entries(testData);
    const results = [];
    
    log('='.repeat(80), 'cyan');
    log('TESTING ALL ENDPOINTS', 'cyan');
    log('='.repeat(80), 'cyan');
    log('', 'reset');
    
    // Group tests by category
    const categories = {
        'DBS Services': ['dbs', 'dbsPdf'],
        'Right to Work': ['rtwShareCode', 'rtwImmigration', 'rtwUKVI', 'rtwBritish', 'ecs'],
        'Professional Registers': ['nmc', 'nhsPerformers', 'healthcareRegister'],
        'Other Verifications': ['ofqual', 'postcode', 'companiesHouse', 'dvla'],
        'Placeholder Responses': ['cos', 'hpan', 'training'],
        'Third-Party ID': ['onfidoId', 'gbgId', 'yoti', 'onfidoCheck', 'konfir'],
        'Healthcare': ['healthcareWorker']
    };
    
    let testIndex = 1;
    for (const [category, testKeys] of Object.entries(categories)) {
        log(`\n📋 ${category}:`, 'magenta');
        log('', 'reset');
        
        for (const key of testKeys) {
            const test = testData[key];
            log(`${testIndex}. ${test.name}`, 'cyan');
            
            const result = await runTest(test.name, test);
            results.push(result);
            
            if (result.skipped) {
                log(`   ⚠ Skipped: ${result.reason}`, 'yellow');
            } else if (result.error) {
                log(`   ❌ Error: ${result.error}`, 'red');
            } else if (result.isExpectedStatus) {
                const statusColor = result.success ? 'green' : 'yellow';
                log(`   ✅ Status: ${result.status} (${result.elapsed}ms)`, statusColor);
                if (result.data && typeof result.data === 'object' && result.data.ok !== undefined) {
                    log(`   Response: ok=${result.data.ok}`, 'green');
                }
            } else {
                log(`   ⚠ Status: ${result.status} (expected ${result.expectedStatus.join(' or ')})`, 'yellow');
            }
            
            testIndex++;
            log('', 'reset');
        }
    }
    
    // Summary
    log('='.repeat(80), 'cyan');
    log('\n📊 SUMMARY\n', 'cyan');
    
    const successful = results.filter(r => r.success && !r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped && !r.isExpectedStatus).length;
    const skipped = results.filter(r => r.skipped).length;
    const expectedFailures = results.filter(r => !r.success && r.isExpectedStatus).length;
    
    log(`✅ Successful: ${successful}`, 'green');
    log(`❌ Failed: ${failed}`, 'red');
    log(`⚠️  Skipped: ${skipped}`, 'yellow');
    log(`📝 Expected Status (non-200): ${expectedFailures}`, 'blue');
    log(`📊 Total Tests: ${results.length}`, 'cyan');
    log('', 'reset');
    
    // Check server
    try {
        const healthCheck = await fetch(`${BASE_URL}/health`);
        if (healthCheck.ok) {
            log('✓ Server is running and accessible', 'green');
        } else {
            log('✗ Server health check failed', 'red');
        }
    } catch (error) {
        log(`✗ Cannot connect to server at ${BASE_URL}`, 'red');
        log(`  Error: ${error.message}`, 'red');
        log(`  Make sure the server is running: npm run dev`, 'yellow');
    }
    
    if (!PLAYWRIGHT_ENABLED && skipped > 0) {
        log('\n💡 To test Playwright-dependent endpoints:', 'yellow');
        log('   PLAYWRIGHT_ENABLED=1 npm run dev', 'blue');
        log('   Then run: PLAYWRIGHT_ENABLED=1 node test-all-verifications.js', 'blue');
    }
    
    log('', 'reset');
}

main().catch((error) => {
    log(`\n❌ Test script error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

