import { useEffect, useRef, useState } from "react";

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<{ sender: "user" | "bot"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws");
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.kind === "chat-reply") setLog((l) => [...l, { sender: "bot", text: msg.text }]);
    };
    return () => ws.close();
  }, []);

  const send = () => {
    if (!input.trim() || !wsRef.current) return;
    setLog((l) => [...l, { sender: "user", text: input }]);
    wsRef.current.send(JSON.stringify({ kind: "chat", text: input }));
    setInput("");
  };

  return (
    <div className="mt-6 mb-2">
      <h3 className="text-lg font-medium mb-2">Ask a Question</h3>
      {open ? (
        <div className="bg-white shadow-lg border rounded p-3 flex flex-col h-64">
          <div className="flex-1 overflow-y-auto mb-2 text-sm">
            {log.length === 0 ? (
              <p className="text-gray-500 text-center italic">Ask a question about linear algebra or the matrix visualization</p>
            ) : (
              log.map((m, i) => (
                <p key={i} className={`mb-2 ${m.sender === "user" ? "text-right font-medium" : "text-left italic text-gray-700"}`}>{m.text}</p>
              ))
            )}
          </div>
          <div className="flex gap-1">
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              placeholder="Type your question here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="bg-amber-500 text-white px-3 py-1 rounded text-sm" onClick={send}>Send</button>
          </div>
        </div>
      ) : (
        <button className="w-full bg-amber-500 text-white px-3 py-2 rounded text-sm" onClick={() => setOpen(true)}>
          Ask a Question About Linear Algebra
        </button>
      )}
    </div>
  );
}