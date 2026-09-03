import { db } from "../config/firebase";
import { AgentTask, BaseAgent, EvidencePayload } from "./baseAgent";

export class IdentityKycAgent extends BaseAgent {
  readonly name = "IdentityKycAgent";

  constructor(private customerId: string) {
    super();
  }

  protected async collect(_task: AgentTask): Promise<EvidencePayload[]> {
    const [customerSnap, kycSnap] = await Promise.all([
      db.collection("customers").doc(this.customerId).get(),
      db.collection("kycRecords").where("customerId", "==", this.customerId).limit(1).get(),
    ]);
    if (!customerSnap.exists) return [];

    return [
      {
        evidenceType: "identity",
        sourceSystem: "meridian.kyc",
        relatedCustomerId: this.customerId,
        occurredAt: new Date(),
        data: {
          customer: customerSnap.data(),
          kyc: kycSnap.empty ? null : kycSnap.docs[0].data(),
        },
      },
    ];
  }
}
