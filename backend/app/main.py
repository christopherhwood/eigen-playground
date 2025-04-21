from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import os, json, openai, asyncio

openai.api_key = os.getenv("OPENAI_API_KEY")
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def format_matrix(m):
    if not m:
        return "unknown"
    return f"[[{m['a']:.2f}, {m['b']:.2f}], [{m['c']:.2f}, {m['d']:.2f}]]"

async def llm_chat(messages, model="gpt-4o-mini", max_tokens=1000):
    resp = await asyncio.to_thread(
        openai.chat.completions.create,
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.6,
    )
    return resp.choices[0].message.content.strip()

# narrator builder retained from v1.0 (unchanged)

def build_narrator_prompt(msg, prev):
    a, b, c, d = msg["a"], msg["b"], msg["c"], msg["d"]
    trace = msg["trace"]
    det = msg["det"]
    disc = msg["disc"]
    collapsed = msg["collapsed"]

    concepts = prev.get("concepts", set())
    want_defs = []
    if "basis" not in concepts:
        want_defs.append("basis")
    if "basis" in concepts and "test" not in concepts:
        want_defs.append("test")
    if disc >= 0 and "eigen" not in concepts and "basis" in concepts:
        want_defs.append("eigen")

    defs = {
        "basis": "A basis vector is one of the two arrows <1,0> and <0,1>. Together they span the plane.",
        "test": "Test vectors are extra sample arrows so you can see how random directions move.",
        "eigen": "An eigenvector keeps its direction after the transform—only its length changes by λ.",
    }
    definition_snippets = " " + " ".join(defs[d] for d in want_defs)

    tone = "Write like you're texting a friend. Keep it short, casual, and easy to understand. No markdown formatting."

    changes = []
    if det * prev.get("det", 1) < 0:
        changes.append("Determinant sign flipped → orientation reversed.")
    if collapsed and not prev.get("collapsed", False):
        changes.append("All transformed arrows collapse to the origin.")
    if (prev.get("disc", 1) < 0) and (disc >= 0):
        changes.append("Real eigenvectors appeared—bold orange arrows.")
    if (prev.get("disc", 0) >= 0) and (disc < 0):
        changes.append("Eigenvectors vanished; the matrix now only rotates.")
    change_sentence = " ".join(changes) if changes else "Watch how the arrows reposition."

    prompt = f"""You are describing a matrix visualization that the user is currently seeing on screen.
The visualization shows a 2×2 transformation matrix and its effect on vectors in 2D space.
The current matrix is {format_matrix(msg)} with values a={a:.2f}, b={b:.2f}, c={c:.2f}, d={d:.2f}.
The determinant is {det:.2f} and discriminant is {disc:.2f}.
{change_sentence}{definition_snippets}

IMPORTANT: Don't use phrases like "imagine" or hypotheticals - the user is already looking at this transformation.
Describe what they ARE seeing, not what they COULD see. Refer directly to the visual elements on screen.
{tone}"""

    concepts.update(want_defs)
    prev.update({"concepts": concepts, "det": det, "disc": disc, "collapsed": collapsed})
    return prompt

@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    await ws.accept()
    state = {
        "concepts": set(),
        "det": 1,
        "disc": 1,
        "collapsed": False,
        "matrix_msg": None,
        "last_narrative": "",
        "chat_history": [],  # list of {role, content}
    }

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            kind = msg.get("kind")

            # ── MATRIX EVENT ───────────────────────────────
            if kind == "matrix":
                # Reset chat history because context has changed
                state["chat_history"] = []

                prompt = build_narrator_prompt(msg, state)
                text = await llm_chat([{"role": "user", "content": prompt}])
                state["matrix_msg"] = msg
                state["last_narrative"] = text
                await ws.send_text(json.dumps({"kind": "matrix", "text": text}))

            # ── COMMENT EVENT ──────────────────────────────
            elif kind == "comment":
                snippet = msg.get("snippet", "")
                paragraph = msg.get("paragraph", state["last_narrative"])
                is_followup = msg.get("isFollowup", False)
                matrix = state['matrix_msg']
                
                # Extract additional matrix properties for context
                det = matrix.get("det", 0) if matrix else 0
                disc = matrix.get("disc", 0) if matrix else 0
                eigenvalues = matrix.get("eigenvalues", []) if matrix else []
                has_eigenvectors = disc >= 0
                
                system_context = (
                    f"You are an assistant in an educational app about linear transformations and matrices.\n"
                    f"The app shows a 2×2 transformation matrix [[a,b],[c,d]] and visualizes how it transforms vectors in 2D space.\n"
                    f"Current matrix {format_matrix(state['matrix_msg'])} with determinant={det:.2f}, discriminant={disc:.2f}.\n"
                    f"{'Real eigenvectors exist and are shown as orange arrows.' if has_eigenvectors else 'No real eigenvectors exist for this matrix (complex eigenvalues).'}\n"
                    f"{'The determinant is negative, so the orientation is flipped.' if det < 0 else ''}\n"
                    f"{'The determinant is zero, so the transformation collapses space.' if det == 0 else ''}\n\n"
                    f"IMPORTANT: Write in simple, accessible language as if you're texting a friend. Assume the user is new to linear algebra concepts.\n"
                    f"Keep your responses concise and conversational - like a text message, not an essay. Don't use markdown formatting.\n"
                    f"Be casual and friendly. Use short sentences, contractions (don't instead of do not), and relate concepts to what they can see on screen.\n"
                    f"When relevant, suggest specific changes they could make to the matrix sliders to illustrate your points - for example:\n"
                    f"'Try setting a=1, b=0, c=0, d=2 to see a pure scaling transformation' or\n"
                    f"'Move the c slider all the way negative to see what happens to the basis vectors'\n"
                )
                
                if is_followup:
                    prompt = (
                        f"{system_context}\n"
                        f"This is a follow-up question in a comment thread. The user previously highlighted: '{snippet}'.\n"
                        f"Their new comment: '{msg['text']}'.\n"
                        "Respond to their follow-up in a casual, text message-like style. Be concise, friendly, and straight to the point - like you're texting with a friend. Don't use markdown formatting. When it would help illustrate a concept, suggest specific matrix values they could try."
                    )
                else:
                    prompt = (
                        f"{system_context}\n"
                        f"Paragraph: '{paragraph}'.\n"
                        f"Highlighted snippet: '{snippet}'.\n"
                        f"Visitor comment: '{msg['text']}'.\n"
                        "Respond to their comment in a casual, text message-like style. Be concise, friendly, and straight to the point - like you're texting with a friend. Don't use markdown formatting. When it would help illustrate a concept, suggest specific matrix values they could try (like 'Try a=0, b=1, c=-1, d=0 to see rotation')."
                    )
                text = await llm_chat([{"role": "user", "content": prompt}])
                await ws.send_text(json.dumps({"kind": "reply", "targetId": msg["targetId"], "text": text}))

            # ── CHAT EVENT ────────────────────────────────
            elif kind == "chat":
                # append user message to history
                state["chat_history"].append({"role": "user", "content": msg["text"]})

                # build system/context message
                matrix = state['matrix_msg']
                
                # Extract additional matrix properties for context
                det = matrix.get("det", 0) if matrix else 0
                disc = matrix.get("disc", 0) if matrix else 0
                eigenvalues = matrix.get("eigenvalues", []) if matrix else []
                has_eigenvectors = disc >= 0
                
                system_ctx = (
                    f"You are an assistant in an educational app about linear transformations and matrices.\n"
                    f"The app shows a 2×2 transformation matrix [[a,b],[c,d]] and visualizes how it transforms vectors in 2D space.\n"
                    f"Current matrix {format_matrix(state['matrix_msg'])} with determinant={det:.2f}, discriminant={disc:.2f}.\n"
                    f"{'Real eigenvectors exist and are shown as orange arrows.' if has_eigenvectors else 'No real eigenvectors exist for this matrix (complex eigenvalues).'}\n"
                    f"{'The determinant is negative, so the orientation is flipped.' if det < 0 else ''}\n"
                    f"{'The determinant is zero, so the transformation collapses space.' if det == 0 else ''}\n"
                    f"Last explanation: '{state['last_narrative']}'.\n\n"
                    f"IMPORTANT: Write in simple, accessible language as if you're texting a friend. Assume the user is new to linear algebra concepts.\n"
                    f"Keep your responses concise and conversational - like a text message, not an essay. Don't use markdown formatting.\n"
                    f"Be casual and friendly. Use short sentences, contractions (don't instead of do not), and relate concepts to what they can see on screen.\n\n"
                    f"Answer their questions about the matrix in a casual, text-message style. Keep it short and sweet while still being helpful.\n"
                    f"When relevant, suggest specific changes they could make to the matrix sliders to illustrate your points - for example:\n"
                    f"'Try setting a=1, b=0, c=0, d=2 to see a pure scaling transformation' or\n"
                    f"'Move the c slider all the way negative to see what happens to the basis vectors'"
                )

                # keep last 6 messages to stay within context window
                history = state["chat_history"][-6:]
                messages = [{"role": "system", "content": system_ctx}] + history

                answer = await llm_chat(messages)
                # append assistant reply to history
                state["chat_history"].append({"role": "assistant", "content": answer})

                await ws.send_text(json.dumps({"kind": "chat-reply", "text": answer}))
    except Exception as e:
        # Handle WebSocketDisconnect and other exceptions gracefully
        print(f"WebSocket closed: {str(e)}")