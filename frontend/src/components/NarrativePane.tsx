import { useEffect, useRef, useState } from "react";
import ChatDrawer from "./ChatDrawer";

export default function NarrativePane() {
  const [sentences, setSentences] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const selRef = useRef<Range | null>(null);

  // connect once to same websocket but only listen (MatrixPlayground also opens its own for send) 
  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws");
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.kind === "matrix") setSentences((s) => [...s.slice(-9), msg.text]);
      if (msg.kind === "reply") insertReply(msg); // helper below
    };
    return () => ws.close();
  }, []);

  const insertReply = (msg: { targetId: string; text: string }) => {
    const node = document.getElementById(msg.targetId);
    if (!node) return;
    const div = document.createElement("div");
    div.className = "ml-4 mt-1 text-xs text-gray-600 border-l pl-2 italic";
    div.textContent = msg.text;
    node.appendChild(div);
  };

  // comment flow
  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    selRef.current = sel.getRangeAt(0);
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.createElement("button");
    btn.textContent = "Comment";
    btn.className = "fixed z-50 bg-amber-500 text-white text-xs px-2 py-1 rounded shadow";
    btn.style.top = `${rect.bottom + window.scrollY}px`;
    btn.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(btn);
    btn.onclick = () => {
      document.body.removeChild(btn);
      const text = prompt("Your comment?");
      if (!text || !selRef.current || !wsRef.current) return;
      const id = `sel-${Date.now()}`;
      const span = document.createElement("span");
      span.id = id;
      span.className = "bg-yellow-100";
      selRef.current.surroundContents(span);
      wsRef.current.send(
        JSON.stringify({ kind: "comment", targetId: id, text })
      );
    };
  };

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 bg-white shadow rounded relative">
      <h2 className="text-xl font-medium mb-2">Matrix Explanation</h2>
      <p className="text-sm text-gray-600 mb-4">
        This panel provides explanations about what's happening as you adjust the matrix values.
        You can highlight any text and click "Comment" to ask about specific parts.
      </p>
      
      <div className="flex-grow overflow-y-auto mb-4">
        {sentences.length === 0 ? (
          <p className="text-gray-500 italic">Adjust the sliders on the left to see explanations here.</p>
        ) : (
          sentences.map((s, i) => (
            <p key={i} className="mb-3 leading-relaxed select-text cursor-text">
              {s}
            </p>
          ))
        )}
      </div>
      
      <ChatDrawer />
    </div>
  );
}