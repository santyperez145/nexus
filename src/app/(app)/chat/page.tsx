import { Playground } from "@/components/chat/playground";
import { allModels } from "@/lib/catalog";

export default function ChatPage() {
  const models = allModels().map((m) => ({ id: m.id, name: m.name }));
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Chat</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Playground de Nexus. Las conversaciones quedan en este dispositivo.
      </p>
      <Playground models={models} />
    </div>
  );
}
