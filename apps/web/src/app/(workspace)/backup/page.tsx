import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ChatPage } from "@/features/whatsapp/chat-page";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ChatPage backup />
    </Suspense>
  );
}
