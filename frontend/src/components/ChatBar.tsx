import { useEffect, useRef, useState } from "react";

export default function ChatBar() {
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws");
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.kind === "chat-reply") {
        window.dispatchEvent(new CustomEvent("doc-append", { detail: `🤖 ${msg.text}` }));
      }
    };
    return () => ws.close();
  }, []);

  const send = () => {
    if (!input.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ kind: "chat", text: input }));
    window.dispatchEvent(new CustomEvent("doc-append", { detail: `🧑 ${input}` }));
    setInput("");
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex gap-2 items-center">
      <input
        className="flex-1 border rounded px-3 py-2 text-sm"
        placeholder="Ask a question…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
      />
      <button className="bg-amber-500 text-white px-4 py-2 rounded text-sm" onClick={send}>Send</button>
    </div>
  );
}