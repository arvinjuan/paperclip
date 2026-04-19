import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, costEvents } from "@paperclipai/db";

export function getMonthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function syncMonthlySpendCounters(
  db: Db,
  input: {
    companyId: string;
    agentId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const monthStart = getMonthStart(now);

  const [{ agentSpend }] = await db
    .select({
      agentSpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, input.companyId),
        eq(costEvents.agentId, input.agentId),
        gte(costEvents.occurredAt, monthStart),
      ),
    );

  const [{ companySpend }] = await db
    .select({
      companySpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, input.companyId),
        gte(costEvents.occurredAt, monthStart),
      ),
    );

  const agentSpendCents = Number(agentSpend ?? 0);
  const companySpendCents = Number(companySpend ?? 0);

  const [updatedAgent] = await db
    .update(agents)
    .set({
      spentMonthlyCents: agentSpendCents,
      updatedAt: now,
    })
    .where(eq(agents.id, input.agentId))
    .returning();

  await db
    .update(companies)
    .set({
      spentMonthlyCents: companySpendCents,
      updatedAt: now,
    })
    .where(eq(companies.id, input.companyId));

  return { agentSpendCents, companySpendCents, updatedAgent };
}
