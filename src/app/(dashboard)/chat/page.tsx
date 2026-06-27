import { requireUser } from "@/lib/session";
import { Chat } from "@/components/chat/chat";

export default async function ChatPage() {
  const user = await requireUser();
  return (
    <div className="h-dvh">
      <Chat user={{ name: user.name, role: user.role }} />
    </div>
  );
}
