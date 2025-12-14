3.9 Required APIs 
Right to Work - UK Home Office 
British Citizen
Credas – 3rd Party Integration / redirect - Result needs to saved as a PDF format
E-bulk – 3rd Party Integration / redirect Result needs to saved as a PDF format
Yoti – 3rd Party Integration / redirect to Result needs to saved as a PDF format
Non British Citizen
Employer – RECRUITER PORTAL
Right to work online check: using share code https://www.gov.uk/view-right-to-work - Result needs to save as a PDF format
Employer Checking Service 
https://www.gov.uk/employee-immigration-employment-status Result needs to saved as a PDF format plus option to upload Supplementary Document for non British CITIZENS
Candidate: AGENCY WORKER PORTAL
UKVI account: Get access to your online immigration status (eVisa): https://www.gov.uk/get-access-evisa
View and prove your immigration status: get a share code https://www.gov.uk/view-prove-immigration-status
COS – EMAIL AUTOMATION

Professional Checks API
Integration for validating and verifying professional credentials. 
GDC – Automation
https://olr.gdc-uk.org/searchregister
GMC – Automation 
Physician Associate Managed Voluntary Register (PAMVR) - Automation 
https://www.fparcp.co.uk/pamvr/search
GPC (General Optical Council) –  Automation
https://str.optical.org
GOC (Osteopathic) –  Automation
https://www.osteopathy.org.uk/register-search/
GPC (Pharmacy) –  Automation
https://www.pharmacyregulation.org/registers?utm_source=chatgpt.com
HCPC - API
NMC - API
Pharmaceutical Society of Northern Ireland - Automation
https://registers.psni.org.uk
Social Work England – Automation
https://www.socialworkengland.org.uk/umbraco/surface/searchregister/results?utm_source=chatgpt.com
General Chiropractic Council – Automation
https://www.gcc-uk.org/?utm_source=chatgpt.com
NHS England Performers list – Automation
https://secure.pcse.england.nhs.uk/PerformersLists/
Konfir (government-accredited provider) of employment, income verification and gap verification services. (API Integration) - Automated – Daily / Weekly / Monthly checks, 
HPAN checks – Automated email 

Sage and QuickBooks – API are accessible on the internet.
Payroll and invoicing management. 
Reference Checks – Automation, + anuual + post placement feedback
Compliance – Traffic light system (Automation)
ID / DL / RTW Checks / Certificate of Sponsorship – Home Office, DVLA API and 3rd Party Integration / redirect – 
Onfido - https://documentation.onfido.com - 3rd Party Integration / redirect
GBG GB Group - 3rd Party Integration / redirect
Driving License Checks: Access to Driver Data (ADD) API Guide https://developer-portal.driver-vehicle-licensing.api.gov.uk/apis/driver-view/driver-view-description.html#introduction
Access to Driver Data API 
DVLA Authentication 
DVLA Vehicle Enquiry Service 
Driver Image API 
Example Workflow for Healthcare Recruitment (Nurses/Carers):
Step 1: Authentication
Use the DVLA Authentication API to verify the identity of the candidate.
Step 2: Driver Data Check
Use the Access to Driver Data API to check if the driver’s licence is valid, whether they have any endorsements or penalty points, and what vehicle categories they are authorised to drive.
Step 3: Vehicle Check (if applicable)
If the candidate is using their own vehicle or will be using a company vehicle, use the DVLA Vehicle Enquiry Service to check the vehicle’s tax status, MOT status, and other relevant details.
Step 4: Identity Verification
If required, use the Driver Image API to match the driver’s photo on their driving licence with the person applying for the role.

Integration Considerations:
Automation: These checks can be automated in a custom-built CRM system where different API calls are triggered based on the type of check required. For example, you could set up an automated process where:
The driver is authenticated first.
Their driver data is checked second.
If they are driving a vehicle, the vehicle's MOT and tax status are verified.
The driver’s image is confirmed when necessary.
Bulk checks can be run for multiple employees or vehicles at once.
APIs as Independent Calls: Even though you can create an integrated system within your CRM, each API typically serves a different purpose and is called independently. However, you can sequence these checks in the order that fits your recruitment process.
DBS 
New DBS Checks – E-bulk Plus 3rd Party Integration / redirect 
DBS Update service checks – Automate the process by building a custom workflow in your CRM and leveraging web scraping or browser automation to interact with the DBS Update Service directly
Automating with Web Scraping/Browser Automation or
Custom CRM Development for Automated Integration
Qualification checks - Ofqual Register of Regulated Qualifications API https://github.com/OfqualGovUK/ofqual-register-api
Students – Automated email to university to check their admission
Professional Checks - (GDC, GMC, PAMVR, GPC (General Optical Council), GOC (Osteopathic), GPC (Pharmacy), HCPC,NMC, Pharmaceutical Society of Northern Ireland, Social Work England, General Chiropractic Council, NHS England Performers list, Konfir (government-accredited provider) of employment, income verification and gap verification services. (API Integration) - Automated – Daily / Weekly / Monthly checks, HPAN checks – Automated email 
Occupational Health Checks – HBC – Requested API access, automated email for annual check rrenewal equest
Mandatory Training certificates checks - Automated – Daily / Weekly / Monthly checks 
https://www.healthcare-register.co.uk – Automation required. No API
Automated email to the providers for training evrification
Vendor Management Systems – parsing vacancies 
Communication: Email – Gmail and outlook, VOIP, SMS, What’s app
External CRM – Data import and export 
CV / Vacancies Parsing 
Job postings – Job portals and social media Integrations – Reed, Indeed, Jobs Gov, Nurses.co.uk, Facebook, LinkedIn
Calendar integration 
Address – API – drop down list - Ideal-Postcodes.co.uk PAF Licensed
Accounting Software – Xero API Available online.
Option for this software to integrate to Public APIs for integrations into ATS, HRIS or CRMs. 
Partners – Optional if anyone wants to partner with us. 
Zapier – API and webhooks
SOME Screen shots what the info might be



