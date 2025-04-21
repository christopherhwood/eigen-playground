// A minimal singleton WebSocket helper so that every React component talks to
// **the same** backend connection.  The previous implementation created a
// brand‑new WebSocket in every component (and, for MatrixPlayground, on every
// slider change).  That meant the matrix metadata sent from the playground
// lived on a *different* connection from the one used for chat/questions, so
// the server couldn't associate the two and defaulted to a determinant of 0.

let ws: WebSocket | null = null;

/**
 * Return a shared WebSocket instance.  If the connection hasn't been created
 * yet (or it was closed) we create a new one and keep it around for the rest
 * of the session.
 */
export function getWebSocket(): WebSocket {
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    const url = (import.meta as any).env.VITE_WS_URL || "ws://localhost:8000/ws";
    ws = new WebSocket(url);
  }
  return ws;
}

// Small helper so components can register listeners without worrying about the
// connection still being *in flight*.
export function whenSocketOpen(callback: () => void) {
  const socket = getWebSocket();
  if (socket.readyState === WebSocket.OPEN) {
    callback();
  } else {
    const handler = () => {
      socket.removeEventListener("open", handler);
      callback();
    };
    socket.addEventListener("open", handler);
  }
}
