import { auth, db, FieldValue } from "../config/firebase";
import { generateAccountNumber, generateApplicationId } from "../utils/ids";
import { generateUniqueUserId } from "../utils/unique";
import { saveKycDocument } from "../utils/fileStorage";
import { Role } from "../types/roles";

const DEMO_PASSWORD = "A#123456";

const DEMO_USERS: { email: string; fullName: string; role: Role }[] = [
  { email: "client.demo@xbank.app", fullName: "Ayesha Rahman", role: "client" },
  { email: "employee.demo@xbank.app", fullName: "Tanvir Hasan", role: "employee" },
  { email: "officer.demo@xbank.app", fullName: "Nadia Chowdhury", role: "compliance_officer" },
  { email: "admin.demo@xbank.app", fullName: "System Administrator", role: "admin" },
];

// Reserved, fixed User IDs for the staff demo accounts (client keeps a random one).
// Anything created afterwards via Admin > Users continues from NEXT_STAFF_USER_ID.
const FIXED_STAFF_USER_IDS: Partial<Record<Role, string>> = {
  admin: "00001",
  compliance_officer: "00002",
  employee: "00003",
};
const NEXT_STAFF_USER_ID = 4;

// A 1x1 transparent PNG — stands in for scanned NID/signature images in seed data.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function getOrCreateAuthUser(email: string, displayName: string) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: DEMO_PASSWORD, displayName });
    return existing;
  } catch (err: any) {
    if (err?.errorInfo?.code !== "auth/user-not-found") throw err;
    return auth.createUser({ email, password: DEMO_PASSWORD, displayName });
  }
}

async function seedRules() {
  const rules = [
    { code: "RULE-001", name: "Large Transaction", weight: 30, threshold: 200000, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-002", name: "Multiple High-Value Transactions", weight: 12, threshold: 3, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-003", name: "Unusual Transaction Frequency", weight: 8, threshold: 8, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-004", name: "Rapid Fund Movement", weight: 10, threshold: 15, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-005", name: "High-Risk Location", weight: 15, threshold: 0, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-006", name: "Unusual Behavior", weight: 15, threshold: 5, enabled: true, linkedControlIds: [] as string[] },
    { code: "RULE-007", name: "KYC Problem", weight: 10, threshold: 0, enabled: true, linkedControlIds: [] as string[] },
  ];
  for (const rule of rules) {
    await db.collection("complianceRules").doc(rule.code).set(
      { ...rule, config: {}, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  console.log(`Seeded ${rules.length} compliance rules.`);
}

async function seedFrameworksAndControls() {
  const existing = await db.collection("complianceFrameworks").limit(1).get();
  if (!existing.empty) {
    console.log("Compliance frameworks already seeded, skipping.");
    return;
  }

  const iso = await db.collection("complianceFrameworks").add({
    name: "ISO/IEC 27001:2022",
    version: "2022",
    source: "ISO",
    description: "Information security management — FinTech-relevant Annex A controls.",
    createdAt: FieldValue.serverTimestamp(),
  });
  const nist = await db.collection("complianceFrameworks").add({
    name: "NIST Cybersecurity Framework (CSF) 2.0",
    version: "2.0",
    source: "NIST",
    description: "Voluntary framework for managing cybersecurity risk — FinTech-relevant categories.",
    createdAt: FieldValue.serverTimestamp(),
  });
  const bb = await db.collection("complianceFrameworks").add({
    name: "Bangladesh Bank Guideline on ICT Security",
    version: "4.0 (2023)",
    source: "BB",
    description: "Bangladesh Bank ICT Security Guideline — selected AI/FinTech-relevant controls.",
    createdAt: FieldValue.serverTimestamp(),
  });
  const cis = await db.collection("complianceFrameworks").add({
    name: "CIS Controls v8",
    version: "8",
    source: "CIS",
    description: "Center for Internet Security Controls — most relevant to a FinTech compliance monitoring system.",
    createdAt: FieldValue.serverTimestamp(),
  });

  const controls = [
    // ISO/IEC 27001:2022 — Annex A — A.5 Organizational Controls
    { frameworkId: iso.id, controlId: "A.5.1", name: "Policies for information security", requirement: "An information security policy and topic-specific policies are defined, approved by management, published, communicated, and periodically reviewed.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.9", name: "Inventory of information and other associated assets", requirement: "An inventory of information and other associated assets, including owners, is developed and maintained.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.15", name: "Access control", requirement: "Rules to control physical and logical access to information and other associated assets are established and implemented based on business and security requirements.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.19", name: "Information security in supplier relationships", requirement: "Processes and procedures are defined and implemented to manage the information security risks associated with the use of supplier's products or services.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.20", name: "Addressing information security within supplier agreements", requirement: "Relevant information security requirements are established and agreed with each supplier based on the type of supplier relationship.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.21", name: "Managing information security in the ICT supply chain", requirement: "Processes and procedures are defined and implemented to manage the information security risks associated with the ICT products and services supply chain.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.22", name: "Monitoring, review and change management of supplier services", requirement: "The organization regularly monitors, reviews, evaluates, and manages change in supplier information security practices and service delivery.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.23", name: "Information security for use of cloud services", requirement: "Processes for acquisition, use, management, and exit from cloud services are established in accordance with the organization's information security requirements.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.24", name: "Information security incident management planning and preparation", requirement: "The organization plans and prepares for managing information security incidents by defining, establishing, and communicating incident management processes, roles, and responsibilities.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.30", name: "ICT readiness for business continuity", requirement: "ICT readiness is planned, implemented, maintained, and tested based on business continuity objectives and ICT continuity requirements.", category: "Organizational Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.31", name: "Legal, statutory, regulatory and contractual requirements", requirement: "Legal, statutory, regulatory, and contractual requirements relevant to information security are identified, documented, and kept up to date.", category: "Organizational Controls", rules: ["RULE-005"] },
    { frameworkId: iso.id, controlId: "A.5.34", name: "Privacy and protection of personal identifiable information (PII)", requirement: "The organization identifies and meets the requirements regarding the preservation of privacy and protection of PII according to applicable laws, regulations, and contractual requirements.", category: "Organizational Controls", rules: ["RULE-007"] },
    // A.6 People Controls
    { frameworkId: iso.id, controlId: "A.6.3", name: "Information security awareness, education and training", requirement: "Personnel of the organization and relevant interested parties receive appropriate information security awareness, education, and training, and regular updates on organizational policies and procedures relevant to their job function.", category: "People Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.6.5", name: "Responsibilities after termination or change of employment", requirement: "Information security responsibilities and duties that remain valid after termination or change of employment are defined, enforced, and communicated to relevant personnel and other interested parties.", category: "People Controls", rules: [] as string[] },
    // A.7 Physical Controls
    { frameworkId: iso.id, controlId: "A.7.1", name: "Physical security perimeters", requirement: "Security perimeters are defined and used to protect areas that contain information and other associated assets.", category: "Physical Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.7.4", name: "Physical security monitoring", requirement: "Premises are continuously monitored for unauthorized physical access.", category: "Physical Controls", rules: [] as string[] },
    // A.8 Technological Controls
    { frameworkId: iso.id, controlId: "A.8.2", name: "Privileged access rights", requirement: "The allocation and use of privileged access rights are restricted and managed.", category: "Technological Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.8.5", name: "Secure authentication", requirement: "Secure authentication technologies and procedures are implemented based on information access restrictions and the access control policy.", category: "Technological Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.8.8", name: "Management of technical vulnerabilities", requirement: "Information about technical vulnerabilities of information systems in use is obtained in a timely manner, the organization's exposure to such vulnerabilities is evaluated, and appropriate measures are taken.", category: "Technological Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.8.9", name: "Configuration management", requirement: "Configurations, including security configurations, of hardware, software, services, and networks are established, documented, implemented, monitored, and reviewed.", category: "Technological Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.8.12", name: "Data leakage prevention", requirement: "Data leakage prevention measures are applied to systems, networks, and other devices that process, store, or transmit sensitive information.", category: "Technological Controls", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.8.16", name: "Monitoring activities", requirement: "Networks, systems, and applications are monitored for anomalous behavior, and appropriate actions are taken to evaluate potential information security incidents.", category: "Technological Controls", rules: ["RULE-001", "RULE-002", "RULE-003"] },
    { frameworkId: iso.id, controlId: "A.8.24", name: "Use of cryptography", requirement: "Rules for the effective use of cryptography, including cryptographic key management, are defined and implemented to protect the confidentiality, integrity, and authenticity of information.", category: "Technological Controls", rules: [] as string[] },

    // NIST CSF 2.0 — GOVERN (GV)
    { frameworkId: nist.id, controlId: "GV.OC", name: "Organizational Context", requirement: "Mission, stakeholder expectations, dependencies, and legal/regulatory/contractual requirements surrounding cybersecurity risk decisions are identified and understood.", category: "Govern", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "GV.RM", name: "Risk Management Strategy", requirement: "Priorities, constraints, risk tolerance and appetite statements, and assumptions are established, communicated, and used to support operational risk decisions.", category: "Govern", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "GV.RR", name: "Roles, Responsibilities, and Authorities", requirement: "Cybersecurity roles, responsibilities, and authorities are established and communicated to foster accountability, performance assessment, and continuous improvement.", category: "Govern", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "GV.PO", name: "Policy", requirement: "Organizational cybersecurity policy is established, communicated, and enforced.", category: "Govern", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "GV.SC", name: "Cybersecurity Supply Chain Risk Management", requirement: "Cyber supply chain risk management processes are identified, established, managed, monitored, and improved by organizational stakeholders.", category: "Govern", rules: [] as string[] },
    // IDENTIFY (ID)
    { frameworkId: nist.id, controlId: "ID.AM", name: "Asset Management", requirement: "Assets (data, hardware, software, systems, facilities, services, and people) that enable the organization to achieve business purposes are identified and managed consistent with their relative importance.", category: "Identify", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "ID.RA", name: "Risk Assessment", requirement: "The cybersecurity risk to the organization, assets, and individuals is identified, validated, and understood.", category: "Identify", rules: ["RULE-005", "RULE-006"] },
    // PROTECT (PR)
    { frameworkId: nist.id, controlId: "PR.AA", name: "Identity Management, Authentication, and Access Control", requirement: "Access to physical and logical assets is limited to authorized users, services, and hardware, and is managed consistent with the assessed risk of unauthorized access.", category: "Protect", rules: ["RULE-007"] },
    { frameworkId: nist.id, controlId: "PR.AT", name: "Awareness and Training", requirement: "The organization's personnel are provided with cybersecurity awareness and training so they can perform their cybersecurity-related duties and responsibilities.", category: "Protect", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "PR.DS", name: "Data Security", requirement: "Data is managed consistent with the organization's risk strategy to protect the confidentiality, integrity, and availability of information.", category: "Protect", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "PR.PS", name: "Platform Security", requirement: "The hardware, software, and services of physical and virtual platforms are managed consistent with the organization's risk strategy to protect their confidentiality, integrity, and availability.", category: "Protect", rules: [] as string[] },
    // DETECT (DE)
    { frameworkId: nist.id, controlId: "DE.CM", name: "Continuous Monitoring", requirement: "Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events.", category: "Detect", rules: ["RULE-001", "RULE-004"] },
    { frameworkId: nist.id, controlId: "DE.AE", name: "Adverse Event Analysis", requirement: "Anomalies, indicators of compromise, and other potentially adverse events are analyzed to characterize the events and detect cybersecurity incidents.", category: "Detect", rules: [] as string[] },
    // RESPOND (RS)
    { frameworkId: nist.id, controlId: "RS.MA", name: "Incident Management", requirement: "Responses to detected cybersecurity incidents are managed.", category: "Respond", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "RS.CO", name: "Incident Response Reporting and Communication", requirement: "Response activities are coordinated with internal and external stakeholders as required by laws, regulations, or policies.", category: "Respond", rules: [] as string[] },
    // RECOVER (RC)
    { frameworkId: nist.id, controlId: "RC.RP", name: "Incident Recovery Plan Execution", requirement: "Restoration activities are performed to ensure operational availability of systems and services affected by cybersecurity incidents.", category: "Recover", rules: [] as string[] },
    { frameworkId: nist.id, controlId: "RC.CO", name: "Incident Recovery Communication", requirement: "Restoration activities are coordinated with internal and external parties, such as customers, regulators, and coordinating centers.", category: "Recover", rules: [] as string[] },

    // Bangladesh Bank Guideline on ICT Security, v4.0 (2023) — selected AI/FinTech-relevant sections
    { frameworkId: bb.id, controlId: "5.3", name: "Data Security Management", requirement: "The Organization shall establish a data security management policy covering data classification, retention, custodianship, and data loss prevention (DLP) to protect information — including PII — from unauthorized access, disclosure, or loss across all its states: at rest, in transit, and in use.", category: "Data & Cryptography", rules: ["RULE-007"] },
    { frameworkId: bb.id, controlId: "5.17", name: "Log Management", requirement: "The Organization shall implement a centralized log management system to collect and correlate events from servers, network devices, databases, and applications in a single repository, integrated with a SIEM for in-depth analysis, with logs archived per the log retention policy.", category: "Data & Cryptography", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "5.18", name: "Cryptography", requirement: "The Organization shall use strong cryptography to protect data confidentiality, integrity, and authenticity, encrypt data at rest and in transit for critical data, and securely generate, store, back up, rotate, and destroy cryptographic keys.", category: "Data & Cryptography", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "6.1", name: "Threat and Vulnerability Management", requirement: "The Organization shall establish a process to identify, risk-rate, and remediate security vulnerabilities in a timely manner, including patch risk assessment, alternative controls when patches are unavailable, and secure coding practices to address common application vulnerabilities.", category: "Threat & Vulnerability Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "6.2", name: "Vulnerability Assessment and Penetration Testing (VAPT)", requirement: "The Organization shall perform periodic vulnerability scans (at least half-yearly internally, annually by an independent party for critical systems) and conduct internal/external penetration testing at least annually and after significant infrastructure or application changes, with a time-bound remediation plan.", category: "Threat & Vulnerability Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "6.3", name: "Security Incident Management and Monitoring", requirement: "The Organization shall establish an Incident Response Plan, an Incident Monitoring System, and a Security/Information Security Operation Center (SOC/ISOC) staffed 24/7 to detect, log, escalate, and respond to security incidents, and shall provide incident response training.", category: "Threat & Vulnerability Management", rules: ["RULE-001", "RULE-002", "RULE-003"] },
    { frameworkId: bb.id, controlId: "7.1", name: "Governance, Risk and Compliance (Cloud Security)", requirement: "The Organization shall maintain a cloud computing strategy aligned with its overall IT strategy, architecture, and risk appetite, and shall follow Bangladesh Bank's Guideline on Cloud Computing and applicable laws when using cloud services.", category: "Cloud Governance", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "8.1", name: "User Identity and Access Management", requirement: "The Organization shall define, implement, and periodically review an identity and access management procedure ensuring segregation of duties, role-based access provisioning and revocation approved by an appropriate authority, and audit logging of access activities.", category: "Access Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "8.2", name: "Credential Management", requirement: "The Organization shall enforce a strong password policy (minimum length, complexity, expiry, first-login change, lockout on failed attempts), periodic access reviews, immediate revocation of unneeded access, and secure custody of administrative passwords.", category: "Access Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "8.3", name: "Privileged Access Management", requirement: "The Organization shall apply stringent screening for privileged roles and enforce controls for privileged users, including strong authentication, restricted numbers of privileged accounts, need-to-have access, timely activity review, and a ban on shared or unsupervised vendor privileged access.", category: "Access Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "8.4", name: "Remote Access Management", requirement: "The Organization shall encrypt remote connections and require strong, multi-factor authentication for remote access, permitting connections only from devices secured according to organizational standards.", category: "Access Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "8.5", name: "Input Control", requirement: "The Organization shall enforce session time-outs, maintain an audit trail with user ID and timestamp for data insertion, deletion, and modification, prevent the same user from being both maker and checker of a transaction, and restrict access to sensitive data fields.", category: "Access Management", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "9.1", name: "Business Continuity Plan (BCP)", requirement: "The Organization shall maintain an approved, circulated Business Continuity Plan based on a Business Impact Analysis defining Recovery Time/Point Objectives and Maximum Tolerable Downtime, with board-level ownership, adequate BCM staffing and budget, and regular testing, training, and exercises including cyber security scenarios.", category: "Business Continuity & DR", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "9.2", name: "Disaster Recovery Plan (DRP)", requirement: "The Organization shall incorporate a DRP within its BCP, establish a geographically separated Disaster Recovery Site approved by Bangladesh Bank, test its effectiveness at least annually, and maintain a documented, tested data backup and restore strategy including encryption of offsite backups.", category: "Business Continuity & DR", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.1", name: "Software Documentation", requirement: "The Organization shall document and obtain approval for business requirements, system design, functionality, security features, and installation/user manuals for all software, keeping documentation safely stored and available.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.2", name: "Separation of Environments", requirement: "The Organization shall separate development, testing, and production environments, with separate user credentials for each, to reduce the risk of unauthorized access or changes to the operational environment.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.3", name: "In-house Software Development", requirement: "The Organization shall follow a secure Software Development Life Cycle based on industry standards (e.g., OWASP, SANS), enforce independent code review for secure coding compliance, protect source code, and apply formal change control throughout development, including for mobile applications.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.4", name: "Procured Software Management", requirement: "Agreements with software vendors shall require the vendor to maintain information security practices (preferably aligned with standards such as CMMI) during development and to ensure the secure transfer of business information between the Organization and the vendor.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.5", name: "Software Testing", requirement: "The Organization shall keep the testing team separate from the development team, and require User Acceptance Testing during development and User Verification Testing post-deployment, using carefully selected, protected, and controlled test data.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.6", name: "Software Security Requirements", requirement: "The Organization shall embed information security throughout the documented SDLC, test security functionality during development, and restrict application/system installation to authorized IT personnel only.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.7", name: "Statutory Requirements", requirement: "User Acceptance Testing shall be signed off by relevant business units before going live, applicable banking and regulatory requirements under Bangladesh law shall be considered, and design-flaw defects shall be escalated promptly to the vendor and within the Organization.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "10.8", name: "Application Programming Interfaces (APIs) Management", requirement: "The Organization shall implement safeguards for secure API development and delivery, including third-party vetting, strong authentication and encryption, API key/token protection with defined expiry, security testing before production deployment, real-time monitoring and alerting, and capacity planning against denial-of-service attacks.", category: "System Acquisition & Development", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "11.3", name: "QR Based Transactions", requirement: "QR-based transactions shall require Password/PIN-based authentication, with merchant and customer awareness of legitimate QR codes and enforced transaction limits.", category: "Digital & Payment Channels", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "11.4", name: "Internet and App Banking", requirement: "The Organization shall protect and authenticate online banking access with Multi-Factor Authentication, secure session management and timeouts, monitoring for abnormal activity, resilience against DoS/DDoS and man-in-the-middle attacks, secure coding, and regular SAST/DAST testing and application hardening.", category: "Digital & Payment Channels", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "11.5", name: "Payment Cards", requirement: "The Organization shall protect sensitive payment card data through encryption, secure PIN/key generation and distribution, segregation of card personalization/PIN/distribution/activation duties, PCI DSS compliance, OTP-verified card activation, card capture after repeated failed PIN attempts, and monitoring for transactions deviating from a cardholder's usual usage pattern.", category: "Digital & Payment Channels", rules: ["RULE-006"] },
    { frameworkId: bb.id, controlId: "11.6", name: "Payment Interoperability", requirement: "The Organization shall implement all applicable security features for interoperable digital transactions and secure data transmission using a standard method such as the latest version of TLS.", category: "Digital & Payment Channels", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "11.7", name: "Mobile Financial Services", requirement: "The Organization shall adopt a risk-based mobile financial services security policy covering transaction and frequency limits, fraud and AML checks, SIM-replacement controls, device registration/binding, multi-factor and risk-based transaction authentication, secure storage/erasure of sensitive data on devices, anomaly monitoring, and audit-ready logging.", category: "Digital & Payment Channels", rules: ["RULE-002", "RULE-003", "RULE-006"] },
    { frameworkId: bb.id, controlId: "12.5", name: "Cross-border Support Services", requirement: "Cross-border support arrangements shall have documented service continuity assurance, a multi-layered Disaster Recovery Site, remote access governed by the Organization's access control requirements and a signed SLA/NDA, and prior Bangladesh Bank approval before establishment.", category: "Third-Party & Outsourcing", rules: [] as string[] },
    { frameworkId: bb.id, controlId: "12.6", name: "Security, Screening and Control (Outsourcing/Service Provider Mgmt)", requirement: "The Organization shall run a comprehensive outsourcing risk management program with board-level oversight, pre-appointment due diligence, contractual security/confidentiality/data-protection requirements at least as stringent as its own, prompt access revocation on termination, and an up-to-date third-party service catalog and SLA/AMC dashboard.", category: "Third-Party & Outsourcing", rules: [] as string[] },

    // CIS Controls v8 — most relevant to a FinTech compliance monitoring system
    { frameworkId: cis.id, controlId: "CIS 3", name: "Data Protection", requirement: "Protect sensitive data by identifying, handling, storing, transferring, retaining, and securely disposing of data.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 5", name: "Account Management", requirement: "Manage user and system accounts throughout their lifecycle, including creation, modification, disabling, and deletion.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 6", name: "Access Control Management", requirement: "Ensure users have only the access and privileges required for their roles, including proper authentication and authorization.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 7", name: "Continuous Vulnerability Management", requirement: "Continuously identify, assess, prioritize, and remediate vulnerabilities in systems and applications.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 8", name: "Audit Log Management", requirement: "Collect, manage, review, and retain logs to detect security events and support investigation and compliance.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 12", name: "Network Infrastructure Management", requirement: "Establish and maintain secure network infrastructure, including configuration, segmentation, and network device management.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 13", name: "Network Monitoring and Defense", requirement: "Continuously monitor network activity and defend against unauthorized connections, attacks, and suspicious behavior.", category: "", rules: ["RULE-001", "RULE-002", "RULE-003"] },
    { frameworkId: cis.id, controlId: "CIS 15", name: "Service Provider Management", requirement: "Assess and manage cybersecurity risks associated with third-party service providers and vendors.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 16", name: "Application Software Security", requirement: "Develop, maintain, and protect applications using secure development practices, testing, and vulnerability management.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 17", name: "Incident Response Management", requirement: "Establish and maintain processes to detect, respond to, investigate, and recover from cybersecurity incidents.", category: "", rules: [] as string[] },
    { frameworkId: cis.id, controlId: "CIS 18", name: "Penetration Testing", requirement: "Conduct penetration tests to identify exploitable security weaknesses and verify that vulnerabilities are properly addressed.", category: "", rules: [] as string[] },
  ];

  const frameworkMeta = new Map<string, { source: string; version: string }>([
    [iso.id, { source: "ISO", version: "2022" }],
    [nist.id, { source: "NIST", version: "2.0" }],
    [bb.id, { source: "BB", version: "4.0 (2023)" }],
    [cis.id, { source: "CIS", version: "8" }],
  ]);

  const ruleToControls = new Map<string, string[]>();
  for (const c of controls) {
    const meta = frameworkMeta.get(c.frameworkId)!;
    const ref = await db.collection("complianceControls").add({
      frameworkId: c.frameworkId,
      controlId: c.controlId,
      name: c.name,
      requirement: c.requirement,
      category: c.category,
      source: meta.source,
      version: meta.version,
      status: "active",
      evidenceCount: 0,
      lastChecked: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const ruleCode of c.rules) {
      ruleToControls.set(ruleCode, [...(ruleToControls.get(ruleCode) ?? []), ref.id]);
    }
  }

  for (const [ruleCode, controlIds] of ruleToControls) {
    await db.collection("complianceRules").doc(ruleCode).set({ linkedControlIds: controlIds }, { merge: true });
  }

  console.log(`Seeded 4 frameworks and ${controls.length} controls, linked to monitoring rules.`);
}

async function seedSampleApplications() {
  const existing = await db.collection("clientApplications").limit(1).get();
  if (!existing.empty) {
    console.log("Sample applications already seeded, skipping.");
    return;
  }

  const samples = [
    { fullName: "Karim Uddin", email: "karim.uddin.demo@example.com", status: "pending_approval" as const },
    { fullName: "Farzana Akter", email: "farzana.akter.demo@example.com", status: "info_requested" as const },
    { fullName: "Shakil Ahmed", email: "shakil.ahmed.demo@example.com", status: "rejected" as const },
  ];

  for (const s of samples) {
    const applicationId = generateApplicationId();
    const documents = {
      nidFront: await saveKycDocument(applicationId, "nidFront", PLACEHOLDER_PNG, "image/png"),
      nidBack: await saveKycDocument(applicationId, "nidBack", PLACEHOLDER_PNG, "image/png"),
      signature: await saveKycDocument(applicationId, "signature", PLACEHOLDER_PNG, "image/png"),
    };
    await db.collection("clientApplications").doc(applicationId).set({
      fullName: s.fullName,
      dateOfBirth: "1996-05-20",
      gender: "other",
      email: s.email,
      phone: "+8801711111111",
      address: "Dhaka, Bangladesh",
      occupation: "Business",
      nationality: "Bangladeshi",
      nidNumber: `199600${Math.floor(Math.random() * 900000 + 100000)}`,
      documents,
      status: s.status,
      reviewRemarks: s.status === "rejected" ? "NID photo does not match signature records." : s.status === "info_requested" ? "Please resubmit a clearer NID back photo." : null,
      reviewedBy: null,
      reviewedAt: s.status === "pending_approval" ? null : FieldValue.serverTimestamp(),
      linkedUserId: null,
      linkedCustomerId: null,
      accountNumber: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`Seeded ${samples.length} sample client applications for the Admin > Applications queue.`);
}

async function main() {
  console.log("Seeding X Bank demo data...\n");

  const uidByRole: Partial<Record<Role, string>> = {};
  const credentialLines: string[] = [];

  for (const u of DEMO_USERS) {
    const authUser = await getOrCreateAuthUser(u.email, u.fullName);
    uidByRole[u.role] = authUser.uid;

    const existing = await db.collection("users").doc(authUser.uid).get();
    const fixedId = FIXED_STAFF_USER_IDS[u.role];
    let userId = fixedId ?? (existing.data()?.userId as string | undefined);
    if (!userId) userId = await generateUniqueUserId();

    await db.collection("users").doc(authUser.uid).set(
      {
        email: u.email,
        fullName: u.fullName,
        userId,
        role: u.role,
        status: "active",
        mustChangePassword: false,
        failedLoginCount: 0,
        createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    credentialLines.push(`  ${u.role.padEnd(20)} role="${u.role.startsWith("compliance") ? "compliance" : u.role}"  userId=${userId}  ${u.email}`);
  }

  const staffCounterRef = db.collection("counters").doc("staffUserId");
  const staffCounterSnap = await staffCounterRef.get();
  const currentNext = (staffCounterSnap.data()?.next as number) ?? 0;
  await staffCounterRef.set({ next: Math.max(currentNext, NEXT_STAFF_USER_ID) }, { merge: true });

  const clientUid = uidByRole.client!;
  const userDoc = await db.collection("users").doc(clientUid).get();

  let customerId = userDoc.data()?.customerId as string | undefined;
  if (!customerId) {
    const customerRef = db.collection("customers").doc();
    customerId = customerRef.id;
    await customerRef.set({
      userId: clientUid,
      customerCode: userDoc.data()?.userId,
      fullName: "Ayesha Rahman",
      email: "client.demo@xbank.app",
      phone: "+8801700000000",
      dateOfBirth: "1994-03-12",
      gender: "female",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
      occupation: "Software Engineer",
      nationality: "Bangladeshi",
      kycStatus: "verified",
      createdAt: FieldValue.serverTimestamp(),
    });
    await db.collection("users").doc(clientUid).update({ customerId });
    await db.collection("kycRecords").add({
      customerId,
      nidNumber: "1994123456789",
      status: "verified",
      submittedAt: FieldValue.serverTimestamp(),
      verifiedAt: FieldValue.serverTimestamp(),
      expiresAt: null,
    });

    const savingsRef = db.collection("accounts").doc();
    await savingsRef.set({
      customerId,
      accountNumber: generateAccountNumber(),
      accountType: "current",
      currency: "BDT",
      balance: 845250,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
    const currentRef = db.collection("accounts").doc();
    await currentRef.set({
      customerId,
      accountNumber: generateAccountNumber(),
      accountType: "current",
      currency: "BDT",
      balance: 120000,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("beneficiaries").add({
      customerId,
      beneficiaryName: "Karim Traders Ltd.",
      accountNumber: generateAccountNumber(),
      bankName: "X Bank",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("notifications").add({
      userId: clientUid,
      type: "welcome",
      message: "Welcome to X Bank. Your account is now active.",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`✓ Seeded customer profile, KYC, 2 accounts, 1 beneficiary for ${customerId}`);
  } else {
    console.log("Customer profile already exists, skipping.");
  }

  await seedRules();
  await seedFrameworksAndControls();
  await seedSampleApplications();

  console.log("\nDemo credentials — log in with Role + User ID + Password:");
  console.log(`  Password (all accounts): ${DEMO_PASSWORD}\n`);
  credentialLines.forEach((l) => console.log(l));
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
