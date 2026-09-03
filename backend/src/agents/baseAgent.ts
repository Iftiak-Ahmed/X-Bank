import crypto from "node:crypto";
import { db, FieldValue } from "../config/firebase";

export interface EvidencePayload {
  evidenceType: "transaction" | "identity" | "access" | "compliance";
  sourceSystem: string;
  relatedCustomerId?: string | null;
  relatedTransactionId?: string | null;
  relatedControlId?: string | null;
  data: Record<string, unknown>;
  occurredAt: FirebaseFirestore.Timestamp | Date;
}

export interface AgentTask {
  taskId: string;
  triggeredBy: string; // domain event name, e.g. "transaction.created"
}

/**
 * Every collector agent follows the same 8-step lifecycle described in the
 * architecture doc (section 10): receive task -> determine evidence types ->
 * retrieve -> normalize -> validate -> store -> record decision -> handoff.
 * Subclasses implement steps 2-4; this base handles 5-8 uniformly so every
 * agent produces the same auditable shape.
 */
export abstract class BaseAgent {
  abstract readonly name: string;

  protected abstract collect(task: AgentTask): Promise<EvidencePayload[]>;

  async run(task: AgentTask): Promise<string[]> {
    const startedAt = Date.now();
    let evidenceIds: string[] = [];
    let decision = "collected";

    try {
      const payloads = await this.collect(task); // retrieve + normalize
      const valid = payloads.filter((p) => this.validate(p)); // validate
      if (valid.length < payloads.length) decision = "partial_validation_failure";

      const writes = await Promise.all(valid.map((p) => this.store(p))); // store
      evidenceIds = writes;
    } catch (err) {
      decision = "error";
      throw err;
    } finally {
      await db.collection("agentActions").add({
        agentName: this.name,
        task: task.triggeredBy,
        taskId: task.taskId,
        decision,
        evidenceIds,
        durationMs: Date.now() - startedAt,
        executedAt: FieldValue.serverTimestamp(),
      }); // record decision trail
    }

    return evidenceIds; // handoff — caller passes IDs into the analysis engine
  }

  private validate(payload: EvidencePayload): boolean {
    return Boolean(payload.data && Object.keys(payload.data).length > 0);
  }

  private async store(payload: EvidencePayload): Promise<string> {
    const hash = crypto.createHash("sha256").update(JSON.stringify(payload.data)).digest("hex");
    const ref = await db.collection("evidence").add({
      evidenceType: payload.evidenceType,
      sourceSystem: payload.sourceSystem,
      relatedCustomerId: payload.relatedCustomerId ?? null,
      relatedTransactionId: payload.relatedTransactionId ?? null,
      relatedControlId: payload.relatedControlId ?? null,
      data: payload.data,
      hash,
      provenance: this.name,
      validationStatus: "valid",
      occurredAt: payload.occurredAt,
      collectedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }
}
