import { HomeScreen } from "@/components/screens/HomeScreen";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function Page() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return <HomeScreen />;
}
