import { auth, db, FieldValue } from "../config/firebase";
import { generateTempPassword } from "../utils/ids";
import { generateUniqueAccountNumber, generateUniqueUserId } from "../utils/unique";
import { renderCredentialsEmail, sendEmail } from "../utils/email";
import { writeAuditLog } from "../utils/audit";
import { emitKycStatusChanged } from "../realtime/socket";

interface ProvisionResult {
  uid: string;
  customerId: string;
  accountNumber: string;
  userId: string;
  tempPassword: string;
}

/**
 * Runs the full "Admin approves -> account exists" pipeline from architecture
 * section 6-7: generates a unique 8-digit account number, 5-digit user ID and
 * 6-digit temporary password, creates the Firebase Auth user + Firestore
 * records, and emails (or simulates emailing) the credentials.
 */
export async function provisionClientFromApplication(
  applicationId: string,
  adminUid: string
): Promise<ProvisionResult> {
  const appRef = db.collection("clientApplications").doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new Error("Application not found");
  const application = appSnap.data()!;
  if (application.status === "approved") throw new Error("Application already approved");

  const [accountNumber, userId, tempPassword] = await Promise.all([
    generateUniqueAccountNumber(),
    generateUniqueUserId(),
    Promise.resolve(generateTempPassword()),
  ]);

  const userRecord = await auth.createUser({
    email: application.email,
    password: tempPassword,
    displayName: application.fullName,
  });

  const customerRef = db.collection("customers").doc();
  const kycRef = db.collection("kycRecords").doc();
  const accountRef = db.collection("accounts").doc();

  const batch = db.batch();
  batch.set(db.collection("users").doc(userRecord.uid), {
    email: application.email,
    userId,
    fullName: application.fullName,
    role: "client",
    status: "active",
    customerId: customerRef.id,
    mustChangePassword: true,
    failedLoginCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(customerRef, {
    userId: userRecord.uid,
    customerCode: userId,
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    dateOfBirth: application.dateOfBirth,
    gender: application.gender,
    address: application.address,
    occupation: application.occupation,
    nationality: application.nationality,
    kycStatus: "verified",
    applicationId,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(kycRef, {
    customerId: customerRef.id,
    applicationId,
    nidNumber: application.nidNumber,
    status: "verified",
    documents: application.documents ?? null,
    submittedAt: application.createdAt ?? FieldValue.serverTimestamp(),
    verifiedAt: FieldValue.serverTimestamp(),
    expiresAt: null,
  });
  batch.set(accountRef, {
    customerId: customerRef.id,
    accountNumber,
    accountType: "current",
    currency: "BDT",
    balance: 0,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(appRef, {
    status: "approved",
    reviewedBy: adminUid,
    reviewedAt: FieldValue.serverTimestamp(),
    linkedUserId: userRecord.uid,
    linkedCustomerId: customerRef.id,
    accountNumber,
  });
  batch.set(db.collection("notifications").doc(), {
    userId: userRecord.uid,
    type: "account_approved",
    message: `Welcome to X Bank. Your account ${accountNumber} is now active.`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  const { subject, text, html } = renderCredentialsEmail({
    fullName: application.fullName,
    accountNumber,
    userId,
    tempPassword,
  });
  const emailResult = await sendEmail({ to: application.email, subject, text, html, relatedApplicationId: applicationId, type: "account_opening" });

  await writeAuditLog({
    userId: adminUid,
    role: "admin",
    action: "kyc.approved",
    resource: "clientApplications",
    resourceId: applicationId,
    description: `Application ${applicationId} approved; account ${accountNumber} and User ID ${userId} generated.`,
  });
  await writeAuditLog({
    userId: adminUid,
    role: "admin",
    action: "account.created",
    resource: "accounts",
    resourceId: accountRef.id,
    description: `Current account ${accountNumber} created for customer ${customerRef.id}.`,
  });
  await writeAuditLog({
    userId: adminUid,
    role: "admin",
    action: "credentials.generated",
    resource: "users",
    resourceId: userRecord.uid,
    description: `Temporary credentials generated for User ID ${userId}.`,
  });
  await writeAuditLog({
    userId: adminUid,
    role: "admin",
    action: "email.sent",
    resource: "emailOutbox",
    resourceId: applicationId,
    description: emailResult.delivered
      ? `Credentials email delivered to ${application.email}.`
      : `Credentials email simulated for ${application.email} (no SMTP configured or delivery failed).`,
  });

  emitKycStatusChanged({ customerId: customerRef.id, status: "verified" });

  return { uid: userRecord.uid, customerId: customerRef.id, accountNumber, userId, tempPassword };
}
