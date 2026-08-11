import { notFound } from "next/navigation";
import { RoomScreen } from "@/components/screens/RoomScreen";
import { SetupNotice } from "@/components/SetupNotice";
import { isValidShareCode } from "@/lib/shareCode";
import { configProblem, isSupabaseConfigured } from "@/lib/supabase";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isSupabaseConfigured) return <SetupNotice problem={configProblem} />;
  if (!isValidShareCode(code)) notFound();

  return <RoomScreen shareCode={code} />;
}
