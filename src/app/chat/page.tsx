import { ChatClient } from "@/components/chat";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Chat intake · not a form"
        title="Raise a purchase request"
        description="Describe the need naturally. The assistant matches the item master, asks for only the missing fields and requires confirmation. It will never invent an item or a supplier."
      />
      <ChatClient />
    </div>
  );
}
