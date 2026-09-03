import { auth, db, FieldValue } from "../config/firebase";
import { generateAccountNumber, generateApplicationId } from "../utils/ids";
import { generateUniqueUserId } from "../utils/unique";
import { saveKycDocument, hashBuffer } from "../utils/fileStorage";
import { Role } from "../types/roles";

const DEMO_PASSWORD = "123456";

const DEMO_USERS: { email: string; fullName: string; role: Role }[] = [
  { email: "client.demo@xbank.app", fullName: "Ayesha Rahman", role: "client" },
  { email: "employee.demo@xbank.app", fullName: "Tanvir Hasan", role: "employee" },
  { email: "officer.demo@xbank.app", fullName: "Nadia Chowdhury", role: "compliance_officer" },
  { email: "manager.demo@xbank.app", fullName: "Rafiq Islam", role: "compliance_manager" },
  { email: "admin.demo@xbank.app", fullName: "System Administrator", role: "admin" },
];

// Reserved, fixed User IDs for the staff demo accounts (client keeps a random one).
// Anything created afterwards via Admin > Users continues from NEXT_STAFF_USER_ID.
const FIXED_STAFF_USER_IDS: Partial<Record<Role, string>> = {
  admin: "00001",
  compliance_officer: "00002",
  employee: "00003",
  compliance_manager: "00004",
};
const NEXT_STAFF_USER_ID = 5;

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
    description: "Information security management — representative controls only, not a certification claim.",
    createdAt: FieldValue.serverTimestamp(),
  });
  const nist = await db.collection("complianceFrameworks").add({
    name: "NIST Cybersecurity Framework",
    version: "2.0",
    source: "NIST",
    description: "Voluntary framework for managing cybersecurity risk — representative controls only.",
    createdAt: FieldValue.serverTimestamp(),
  });

  const controls = [
    { frameworkId: iso.id, controlId: "A.8.16", name: "Monitoring activities", requirement: "Networks, systems and applications shall be monitored for anomalous behaviour.", category: "Operations Security", rules: ["RULE-001", "RULE-002", "RULE-003"] },
    { frameworkId: iso.id, controlId: "A.5.15", name: "Access control", requirement: "Rules to control physical and logical access shall be established based on business requirements.", category: "Access Control", rules: [] as string[] },
    { frameworkId: iso.id, controlId: "A.5.34", name: "Privacy and PII protection", requirement: "Identify and meet requirements for the preservation of privacy of PII.", category: "Identity", rules: ["RULE-007"] },
    { frameworkId: iso.id, controlId: "A.8.23", name: "Web filtering / geo-risk", requirement: "Access to external sites shall be managed to reduce exposure to malicious content and high-risk jurisdictions.", category: "Network Security", rules: ["RULE-005"] },
    { frameworkId: nist.id, controlId: "DE.CM-01", name: "Continuous monitoring", requirement: "Networks and network services are monitored to find potentially adverse events.", category: "Detect", rules: ["RULE-001", "RULE-004"] },
    { frameworkId: nist.id, controlId: "ID.RA-05", name: "Risk-informed prioritization", requirement: "Threats, vulnerabilities, likelihoods and impacts are used to determine risk.", category: "Identify", rules: ["RULE-006"] },
    { frameworkId: nist.id, controlId: "PR.AA-05", name: "Identity proofing", requirement: "Access permissions and authorizations are managed based on verified identity.", category: "Protect", rules: ["RULE-007"] },
  ];

  const ruleToControls = new Map<string, string[]>();
  for (const c of controls) {
    const ref = await db.collection("complianceControls").add({
      frameworkId: c.frameworkId,
      controlId: c.controlId,
      name: c.name,
      requirement: c.requirement,
      category: c.category,
      source: c.frameworkId === iso.id ? "ISO" : "NIST",
      version: c.frameworkId === iso.id ? "2022" : "2.0",
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

  console.log(`Seeded 2 frameworks and ${controls.length} controls, linked to monitoring rules.`);
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
      nidFront: { filename: saveKycDocument(applicationId, "nidFront", PLACEHOLDER_PNG, "image/png"), hash: hashBuffer(PLACEHOLDER_PNG), mimeType: "image/png" },
      nidBack: { filename: saveKycDocument(applicationId, "nidBack", PLACEHOLDER_PNG, "image/png"), hash: hashBuffer(PLACEHOLDER_PNG), mimeType: "image/png" },
      signature: { filename: saveKycDocument(applicationId, "signature", PLACEHOLDER_PNG, "image/png"), hash: hashBuffer(PLACEHOLDER_PNG), mimeType: "image/png" },
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
