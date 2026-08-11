import { notFound } from "next/navigation";
import { SessionScreen } from "@/components/screens/SessionScreen";
import { SetupNotice } from "@/components/SetupNotice";
import { isValidShareCode } from "@/lib/shareCode";
import { configProblem, isSupabaseConfigured } from "@/lib/supabase";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string; sessionId: string }>;
}) {
  const { code, sessionId } = await params;
  if (!isSupabaseConfigured) return <SetupNotice problem={configProblem} />;
  if (!isValidShareCode(code)) notFound();

  return <SessionScreen shareCode={code} sessionId={sessionId} />;
}
