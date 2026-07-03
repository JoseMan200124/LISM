import { NextResponse } from "next/server";
import { getPublicPlans } from "@/lib/billing-plans-data";

export async function GET() {
  const { data, mode } = await getPublicPlans();
  return NextResponse.json({ data, mode });
}
