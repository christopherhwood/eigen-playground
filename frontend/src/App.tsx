import MatrixPlayground from "./components/MatrixPlayground";
import FlowingDoc from "./components/FlowingDoc";
import ChatBar from "./components/ChatBar";

export default function App() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#222] flex flex-col items-center gap-6 py-6 pb-28">
      <h1 className="text-3xl font-semibold">Eigen‑Sandbox α</h1>
      <MatrixPlayground />
      <FlowingDoc />
      <ChatBar />
    </div>
  );
}
