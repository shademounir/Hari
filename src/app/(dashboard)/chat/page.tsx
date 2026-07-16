import { requireUser } from "@/lib/session";
import { getAvailableChatModels } from "@/lib/ai/providers";
import { Chat } from "@/components/chat/chat";

export default async function ChatPage() {
  const user = await requireUser();
  // Computed server-side: gateway models are hidden when no AI_GATEWAY_API_KEY is
  // set, so the picker never offers a model that would fail at request time.
  const models = getAvailableChatModels();
  return (
    <div className="h-full">
      <Chat user={user} models={models} />
    </div>
  );
}
