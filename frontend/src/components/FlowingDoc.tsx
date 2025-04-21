import { useEffect, useRef, useState, useCallback } from "react";

export default function FlowingDoc() {
  const [paras, setParas] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);
  // Update the bubble messages type to include a conversationHistory array
  const [bubbleMessages, setBubbleMessages] = useState<Record<string, {
    userComment: string, 
    aiReply?: string,
    conversationHistory?: Array<{role: 'user' | 'ai', content: string}>
  }>>({});

  // Keep a mutable reference in sync with the state so that event‑handlers
  // registered only once (e.g. the WebSocket callbacks created in a mount‑
  // time useEffect) can always access the **latest** version of the data.
  const bubbleMessagesRef = useRef(bubbleMessages);
  useEffect(() => {
    bubbleMessagesRef.current = bubbleMessages;
  }, [bubbleMessages]);

  // Helper so we can update both the state and the ref in one go.  Using this
  // ensures that code running outside the React event‑loop (e.g. WebSocket
  // callbacks) always sees the freshest data without waiting for a re‑render.
  const updateBubbleMessages = useCallback(
    (updater: (prev: typeof bubbleMessages) => typeof bubbleMessages) => {
      setBubbleMessages(prev => {
        const next = updater(prev);
        bubbleMessagesRef.current = next;
        return next;
      });
    },
    []
  );

  // websocket for comments & chat replies only
  useEffect(() => {
    console.log("Setting up WebSocket connection");
    
    const wsUrl = (import.meta as any).env.VITE_WS_URL || "ws://localhost:8000/ws";
    console.log("WebSocket URL:", wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("WebSocket connection established");
    };
    
    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    ws.onmessage = (ev) => {
      try {
        console.log("WebSocket message received:", ev.data);
        const msg = JSON.parse(ev.data);
        console.log("Parsed message:", msg);
        
        if (msg.kind === "reply") {
          console.log("Handling reply message for target:", msg.targetId);
          handleReply(msg);
        }
        
        if (msg.kind === "chat-reply") {
          console.log("Handling chat reply");
          setParas((p) => [...p, `🤖 ${msg.text}`]);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };
    
    return () => {
      console.log("Closing WebSocket connection");
      ws.close();
    };
  }, []);

  // Listen for narrator & user chat lines
  useEffect(() => {
    // Matrix narratives reset document except for chat messages
    const narrativeHandler = (e: any) => {
      setParas([e.detail]);
      docRef.current?.querySelectorAll(".comment-bubble")?.forEach((b) => b.remove());
      updateBubbleMessages(() => ({}));
    };
    
    // Chat messages are always appended
    const appendHandler = (e: any) => {
      setParas((p) => [...p, e.detail]);
    };
    
    window.addEventListener("narrative", narrativeHandler);
    window.addEventListener("doc-append", appendHandler);
    
    return () => {
      window.removeEventListener("narrative", narrativeHandler);
      window.removeEventListener("doc-append", appendHandler);
    };
  }, []);

  // Handle clicks outside bubbles to deactivate them
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeBubbleId && e.target instanceof Node) {
        const bubble = document.getElementById(`bubble-${activeBubbleId}`);
        if (bubble && !bubble.contains(e.target)) {
          setActiveBubbleId(null);
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeBubbleId]);

  // Handle reply from server
  const handleReply = ({ targetId, text }: { targetId: string; text: string }) => {
    console.log("Received AI reply for:", targetId, text);
    
    try {
      // First manually update UI for immediate feedback
      const bubble = document.getElementById(`bubble-${targetId}`);
      const content = bubble?.querySelector('.bubble-content');
      
      if (bubble && content) {
        // Get the highlighted text to include in the updated view
        const span = document.getElementById(targetId);
        const highlightedText = span?.textContent || "";
        
        // Get current bubble data from state (via ref – avoids stale closure)
        const currentState = bubbleMessagesRef.current[targetId];
        const userComment = currentState?.userComment || "";
        
        // Build a **new** conversation history array instead of mutating the existing
        // one in-place.  Direct mutation occasionally led to stale state where
        // older messages disappeared after a follow‑up comment because the
        // underlying array reference was overwritten elsewhere.  Creating a
        // new array on every update guarantees React can track the changes
        // correctly and keeps the full transcript intact.

        const prevHistory = currentState?.conversationHistory || [];
        let conversationHistory: Array<{ role: 'user' | 'ai'; content: string }> = [];

        if (prevHistory.length === 0) {
          // First exchange – seed with the current user comment and the AI reply.
          conversationHistory = [
            { role: 'user', content: userComment },
            { role: 'ai',  content: text }
          ];
        } else {
          // Clone previous history to avoid mutating state directly
          conversationHistory = [...prevHistory];

          // The last item should be the user's follow‑up.  Append the AI reply.
          if (conversationHistory[conversationHistory.length - 1]?.role === 'user') {
            conversationHistory.push({ role: 'ai', content: text });
          } else {
            // If, for whatever reason, the order is off, add a corrective pair.
            console.warn('Conversation history out of expected order – repairing');
            conversationHistory.push({ role: 'user', content: userComment });
            conversationHistory.push({ role: 'ai', content: text });
          }
        }
        
        // Update the DOM directly for immediate feedback
        content.innerHTML = '';
        
        // Show highlighted text with more compact styling
        const highlightedDiv = document.createElement('div');
        highlightedDiv.className = 'highlighted-text text-gray-500 bg-gray-50';
        highlightedDiv.title = highlightedText; // Show full text on hover
        highlightedDiv.textContent = `"${highlightedText.length > 45 ? highlightedText.substring(0, 42) + '...' : highlightedText}"`;
        content.appendChild(highlightedDiv);
        
        // Show entire conversation history
        if (conversationHistory.length > 0) {
          conversationHistory.forEach(msg => {
            if (msg.role === 'user') {
              // Show user message
              const userDiv = document.createElement('div');
              userDiv.className = 'user-comment p-3 bg-blue-50';
              
              // Add a smaller label for the user's comment
              const labelSpan = document.createElement("span");
              labelSpan.className = "text-xs font-bold text-gray-700 inline-block mr-1";
              labelSpan.textContent = "You:";
              userDiv.appendChild(labelSpan);
              
              // Add the comment text with proper styling
              const commentTextSpan = document.createElement("span");
              commentTextSpan.className = "inline text-black";
              commentTextSpan.textContent = msg.content;
              userDiv.appendChild(commentTextSpan);
              
              content.appendChild(userDiv);
            } else {
              // Show AI message
              const aiDiv = document.createElement('div');
              aiDiv.className = 'ai-reply p-3 bg-gray-50 border-t';
              
              // Add a smaller label for the AI's response
              const aiLabelSpan = document.createElement("span");
              aiLabelSpan.className = "text-xs text-gray-700 inline-block mr-1";
              aiLabelSpan.textContent = "AI:";
              aiDiv.appendChild(aiLabelSpan);
              
              // Add the reply text with proper styling
              const aiTextSpan = document.createElement("span");
              aiTextSpan.className = "inline";
              aiTextSpan.textContent = msg.content;
              aiDiv.appendChild(aiTextSpan);
              
              content.appendChild(aiDiv);
            }
          });
        } else {
          // Fallback to legacy behavior if we don't have conversation history
          // Show user comment with label
          const userDiv = document.createElement('div');
          userDiv.className = 'user-comment p-3 bg-blue-50';
          
          // Add a smaller label for the user's comment
          const labelSpan = document.createElement("span");
          labelSpan.className = "text-xs font-bold text-gray-700 inline-block mr-1";
          labelSpan.textContent = "You:";
          userDiv.appendChild(labelSpan);
          
          // Add the comment text with proper styling
          const commentTextSpan = document.createElement("span");
          commentTextSpan.className = "inline text-black";
          commentTextSpan.textContent = userComment;
          userDiv.appendChild(commentTextSpan);
          
          content.appendChild(userDiv);
          
          // Show AI reply with label
          const aiDiv = document.createElement('div');
          aiDiv.className = 'ai-reply p-3 bg-gray-50 border-t';
          
          // Add a smaller label for the AI's response
          const aiLabelSpan = document.createElement("span");
          aiLabelSpan.className = "text-xs text-gray-700 inline-block mr-1";
          aiLabelSpan.textContent = "AI:";
          aiDiv.appendChild(aiLabelSpan);
          
          // Add the reply text with proper styling
          const aiTextSpan = document.createElement("span");
          aiTextSpan.className = "inline";
          aiTextSpan.textContent = text;
          aiDiv.appendChild(aiTextSpan);
          
          content.appendChild(aiDiv);
        }
        
        // Add reply form
        const replyForm = document.createElement('form');
        replyForm.className = 'follow-up-form p-2 border-t bg-white';
        
        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Add a follow-up comment...';
        textarea.className = 'w-full p-2 border rounded text-sm min-h-[40px] resize-none';
        textarea.rows = 2;
        
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600';
        submitBtn.textContent = 'Reply';
        
        replyForm.appendChild(textarea);
        replyForm.appendChild(submitBtn);
        content.appendChild(replyForm);

        // Always ensure the latest exchange is visible
        content.scrollTop = content.scrollHeight;
        
        // Handle follow-up submission (direct event handlers)
        submitBtn.addEventListener('click', function(e) {
          e.preventDefault();
          console.log("FOLLOW-UP BUTTON CLICKED (after AI reply)");
          
          const followUpText = textarea.value.trim();
          if (!followUpText || !wsRef.current) return;
          
          try {
            // Visual feedback
            submitBtn.textContent = "Sending...";
            submitBtn.style.opacity = "0.7";
            
            // Get current conversation history (or initialize if empty)
            const currentState = bubbleMessagesRef.current[targetId] || { conversationHistory: [] };
            let updatedHistory = currentState.conversationHistory || [];
            
            // Add the new user message to the conversation history
            updatedHistory = [...updatedHistory, { role: 'user', content: followUpText }];
            
            // Optimistically update state first, preserving conversation history
            updateBubbleMessages((prev) => ({
              ...prev,
              [targetId]: { 
                userComment: followUpText, 
                aiReply: undefined,
                conversationHistory: updatedHistory
              }
            }));
            
            // Append only the new user follow‑up; keep the existing
            // conversation intact so the UI grows downward instead of being
            // rebuilt from scratch (which caused the earlier “replacement”
            // effect the user noticed).

            // Remove the follow‑up form so it doesn’t stay visible after the
            // message is sent, and clear any previous loading indicator.

            replyForm.parentElement?.removeChild(replyForm);

            const previousLoading = content.querySelector('.ai-loading');
            if (previousLoading) {
              previousLoading.remove();
            }

            // 3.  Append the user’s follow‑up message.
            const userDiv = document.createElement('div');
            userDiv.className = 'user-comment p-3 bg-blue-50';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'text-xs font-bold text-gray-700 inline-block mr-1';
            labelSpan.textContent = 'You:';
            userDiv.appendChild(labelSpan);
            const commentTextSpan = document.createElement('span');
            commentTextSpan.className = 'inline text-black';
            commentTextSpan.textContent = followUpText;
            userDiv.appendChild(commentTextSpan);
            content.appendChild(userDiv);

            // 4.  Append new loading indicator.
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'ai-loading p-3 bg-gray-100 italic text-gray-500 border-t';
            loadingDiv.textContent = 'AI is responding...';
            content.appendChild(loadingDiv);
            
            // Send message to server
            wsRef.current.send(
              JSON.stringify({
                kind: "comment",
                targetId: targetId,
                text: followUpText,
                snippet: highlightedText,
                paragraph: span?.closest('p')?.innerText || "",
                isFollowup: true
              })
            );
            
          } catch (error) {
            console.error("Error with follow-up:", error);
          }
        });
        
        replyForm.addEventListener('submit', function(e) {
          e.preventDefault();
          submitBtn.click();
        });
      }
      
      // Update the state
      updateBubbleMessages(prev => {
        const targetBubble = prev[targetId];
        if (targetBubble) {
          console.log("Updating state with AI reply for", targetId);
          
          // Get or initialize the conversation history
          let conversationHistory = targetBubble.conversationHistory || [];
          
          // If the history is empty but we have a user comment and AI reply
          if (conversationHistory.length === 0 && targetBubble.userComment) {
            conversationHistory = [
              { role: 'user', content: targetBubble.userComment },
              { role: 'ai', content: text }
            ];
          } else if (conversationHistory.length > 0) {
            // Check if the last message is from the user and add the AI reply
            if (conversationHistory[conversationHistory.length - 1].role === 'user') {
              conversationHistory.push({ role: 'ai', content: text });
            }
            // If the last message is already from AI, don't add anything
            // This prevents duplicate AI messages
          }
          
          return {
            ...prev,
            [targetId]: {
              ...targetBubble,
              aiReply: text,
              conversationHistory: conversationHistory
            }
          };
        }
        
        console.log("No bubble found in state for", targetId, "creating new entry");
        // If no bubble exists yet, create one with default values
        return {
          ...prev,
          [targetId]: {
            userComment: document.getElementById(targetId)?.textContent || "",
            aiReply: text,
            conversationHistory: [
              { role: 'user', content: document.getElementById(targetId)?.textContent || "" },
              { role: 'ai', content: text }
            ]
          }
        };
      });
      
      // Keep the bubble visible after AI response 
      // This ensures the user can read the full conversation
      
    } catch (error) {
      console.error("Error handling AI reply:", error);
    }
  };

  // Create or find and update a comment bubble
  const createCommentBubble = (targetId: string, highlightedText: string) => {
    console.log("Creating comment bubble for:", targetId, highlightedText);
    
    const span = document.getElementById(targetId);
    if (!span || !docRef.current) {
      console.error("Could not find span or docRef is null", {targetId, span, docRef: docRef.current});
      return;
    }

    // Initialise state entry for this bubble
    updateBubbleMessages(prev => ({
      ...prev,
      [targetId]: {
        userComment: "",
        aiReply: undefined,
        conversationHistory: []
      }
    }));

    // Create the bubble container if it doesn't exist
    let bubble = document.getElementById(`bubble-${targetId}`);
    if (!bubble) {
      console.log("Creating new bubble element");
      bubble = document.createElement("div");
      bubble.id = `bubble-${targetId}`;
      bubble.className = "comment-bubble fixed bg-white border rounded-lg shadow-lg w-64 overflow-hidden transition-all duration-200";
      // Show the bubble initially for comment creation, will be hidden after submission
      bubble.style.display = "block";
      
      // Create the content area
      const contentDiv = document.createElement("div");
      contentDiv.className = "bubble-content flex flex-col max-h-[300px] overflow-y-auto";
      bubble.appendChild(contentDiv);
      
      // Append to document body for now
      document.body.appendChild(bubble);
      
      // Position the bubble next to the highlighted text
      const spanRect = span.getBoundingClientRect();
      const docRect = docRef.current.getBoundingClientRect();
      
      // Calculate the position - keep it within viewport
      const bubbleTop = spanRect.top + window.scrollY;
      
      // Calculate left position to avoid running off screen
      // Use the minimum of (document right + 20px) or (viewport width - bubble width - 20px)
      const maxLeft = window.innerWidth - 280; // 280 = bubble width (256px) + padding
      const docRightPos = docRect.right + window.scrollX + 20;
      const bubbleLeft = Math.min(docRightPos, maxLeft);
      
      console.log("Positioning bubble:", {
        bubbleTop, 
        bubbleLeft, 
        spanRect, 
        docRect,
        scrollY: window.scrollY,
        scrollX: window.scrollX
      });
      
      // Set the position
      bubble.style.position = "absolute";
      bubble.style.top = `${bubbleTop}px`;
      bubble.style.left = `${bubbleLeft}px`;
      bubble.style.zIndex = "1000";
    }

    // Create the comment form
    const contentDiv = bubble.querySelector(".bubble-content");
    if (contentDiv) {
      contentDiv.innerHTML = ""; // Clear any existing content
      
      // Show highlighted text at the top
      const highlightedDiv = document.createElement("div");
      highlightedDiv.className = "highlighted-text p-2 text-xs text-gray-500 border-b bg-gray-50";
      highlightedDiv.textContent = `"${highlightedText}"`;
      contentDiv.appendChild(highlightedDiv);
      
      // Add comment form
      const commentForm = document.createElement("form");
      commentForm.className = "comment-form p-2";
      
      const textarea = document.createElement("textarea");
      textarea.placeholder = "Add a comment...";
      textarea.className = "w-full p-2 border rounded text-sm min-h-[60px] resize-none";
      textarea.autofocus = true;
      
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600";
      submitBtn.textContent = "Comment";
      
      commentForm.appendChild(textarea);
      commentForm.appendChild(submitBtn);
      contentDiv.appendChild(commentForm);
      
      // Handle form submission
      commentForm.onsubmit = (e) => {
        e.preventDefault();
        const commentText = textarea.value.trim();
        if (!commentText || !wsRef.current) return;
        
        // Get the paragraph text for context
        const paraElem = span.closest('p');
        const paraText = paraElem ? paraElem.innerText : "";
        
        // Initialize conversation history with the first user message
        const initialConversation = [{ role: 'user' as const, content: commentText }];
        
        // Optimistically update the UI before server response
        // Update the bubble data with the user's comment and start conversation history
      updateBubbleMessages(prev => ({
          ...prev,
          [targetId]: { 
            userComment: commentText, 
            aiReply: undefined,
            conversationHistory: initialConversation
          }
        }));
        
        // Update the bubble to show loading state immediately
        updateBubbleContent(targetId, commentText);
        
        // Send the comment to the server
        wsRef.current.send(
          JSON.stringify({
            kind: "comment",
            targetId: targetId,
            text: commentText,
            snippet: highlightedText,
            paragraph: paraText,
          })
        );
      };
      
      // Focus the textarea
      setTimeout(() => textarea.focus(), 0);
    }

    // Activate this bubble
    setActiveBubbleId(targetId);
  };

  // Update bubble content
  const updateBubbleContent = (targetId: string, userMessage?: string) => {
    console.log("Updating bubble content for", targetId);
    
    // Make sure we have bubble data, or create a default entry
    let bubbleData = bubbleMessages[targetId];
    if (!bubbleData) {
      console.warn("No bubble data found for", targetId, "- creating a default entry");
      bubbleData = { userComment: userMessage || "", aiReply: undefined } as any;
      updateBubbleMessages(prev => ({
        ...prev,
        [targetId]: bubbleData
      }));
    } else if (userMessage) {
      // Update with the provided user message if available – clone instead of mutating
      updateBubbleMessages(prev => ({
        ...prev,
        [targetId]: {
          ...prev[targetId],
          userComment: userMessage,
        },
      }));
    }

    const bubble = document.getElementById(`bubble-${targetId}`);
    const contentDiv = bubble?.querySelector(".bubble-content");
    if (!bubble || !contentDiv) {
      console.error("Cannot find bubble or content div", {bubble, contentDiv, targetId});
      return;
    }

    // Update position when updating content
    // This ensures bubble follows highlighted text if document scrolls
    const span = document.getElementById(targetId);
    if (span && docRef.current) {
      const spanRect = span.getBoundingClientRect();
      const docRect = docRef.current.getBoundingClientRect();
      
      // Update position
      const bubbleTop = spanRect.top + window.scrollY;
      const bubbleLeft = docRect.right + window.scrollX + 20;
      
      bubble.style.top = `${bubbleTop}px`;
      bubble.style.left = `${bubbleLeft}px`;
    }

    // Clear existing content
    contentDiv.innerHTML = '';

    // Get the highlighted text
    const highlightSpan = document.getElementById(targetId);
    const highlightedText = highlightSpan?.textContent || "";

    // Add highlighted text at the top with more compact styling
    const highlightedDiv = document.createElement("div");
    highlightedDiv.className = "highlighted-text text-gray-500 bg-gray-50";
    highlightedDiv.title = highlightedText; // Show full text on hover
    highlightedDiv.textContent = `"${highlightedText.length > 45 ? highlightedText.substring(0, 42) + '...' : highlightedText}"`;
    contentDiv.appendChild(highlightedDiv);

    // If user hasn't entered a comment yet, show the comment form
    if (!bubbleData.userComment && (!bubbleData.conversationHistory || bubbleData.conversationHistory.length === 0)) {
      // Add comment form
      const commentForm = document.createElement("form");
      commentForm.className = "comment-form p-2";
      
      const textarea = document.createElement("textarea");
      textarea.placeholder = "Add a comment...";
      textarea.className = "w-full p-2 border rounded text-sm min-h-[60px] resize-none";
      textarea.autofocus = true;
      
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600";
      submitBtn.textContent = "Comment";
      
      commentForm.appendChild(textarea);
      commentForm.appendChild(submitBtn);
      contentDiv.appendChild(commentForm);
      
      // Direct event handlers with simple inline code
      submitBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log("BUTTON CLICKED DIRECTLY");
        
        // Simple version with minimal code
        const commentText = textarea.value.trim();
        if (!commentText || !wsRef.current) {
          console.log("Empty comment or no websocket", {commentText, ws: wsRef.current});
          return;
        }
        
        try {
          // Show visual feedback that the button was clicked
          submitBtn.textContent = "Sending...";
          submitBtn.style.opacity = "0.7";
          
          // Optimistically update the UI before server response
          // Set message in state immediately
          console.log("Optimistically setting bubble message state");
          updateBubbleMessages(prev => {
            console.log("Previous state:", prev);
            
            // Get any existing bubble data
            const existingBubble = prev[targetId] || {};
            
            // Get or initialize conversation history
            let updatedHistory = existingBubble.conversationHistory || [];
            if (updatedHistory.length === 0 && existingBubble.userComment) {
              // If we have a userComment but no history, initialize it
              updatedHistory = [{ role: 'user', content: existingBubble.userComment }];
              if (existingBubble.aiReply) {
                updatedHistory.push({ role: 'ai', content: existingBubble.aiReply });
              }
            }
            
            // Add the new user message to history
            updatedHistory = [...updatedHistory, { role: 'user', content: commentText }];
            
            const newState = {
              ...prev,
              [targetId]: { 
                userComment: commentText, 
                aiReply: undefined,
                conversationHistory: updatedHistory
              }
            };
            console.log("New state:", newState);
            return newState;
          });
          
          // Force an immediate update to show we're waiting for AI
          console.log("Forcing immediate update of bubble content");
          
          const message = {
            kind: "comment",
            targetId: targetId,
            text: commentText,
            snippet: highlightedText,
            paragraph: document.getElementById(targetId)?.closest('p')?.innerText || ""
          };
          
          console.log("SENDING COMMENT:", message);
          wsRef.current.send(JSON.stringify(message));
          
          // Immediately update the bubble content
          const bubble = document.getElementById(`bubble-${targetId}`);
          const content = bubble?.querySelector('.bubble-content');
          if (content) {
            content.innerHTML = '';
            
            // Show highlighted text with compact styling
            const highlightedDiv = document.createElement('div');
            highlightedDiv.className = 'highlighted-text text-gray-500 bg-gray-50';
            highlightedDiv.title = highlightedText; // Show full text on hover
            highlightedDiv.textContent = `"${highlightedText.length > 45 ? highlightedText.substring(0, 42) + '...' : highlightedText}"`;
            content.appendChild(highlightedDiv);
            
            // Show the user's comment with label
            const userDiv = document.createElement('div');
            userDiv.className = 'user-comment p-3 bg-blue-50';
            
            // Add a smaller label
            const labelSpan = document.createElement("span");
            labelSpan.className = "text-xs text-gray-700 inline-block mr-1";
            labelSpan.textContent = "You:";
            userDiv.appendChild(labelSpan);
            
            // Add comment text with proper styling
            const commentTextSpan = document.createElement("span");
            commentTextSpan.className = "inline";
            commentTextSpan.textContent = commentText;
            userDiv.appendChild(commentTextSpan);
            
            content.appendChild(userDiv);
            
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'ai-loading p-3 bg-gray-100 italic text-gray-500 border-t';
            loadingDiv.textContent = 'AI is responding...';
            content.appendChild(loadingDiv);
            
            // After submitting, keep the bubble visible briefly so user can see the loading state
            if (bubble) {
              bubble.classList.remove("collapsed");
              bubble.style.display = "block";
              bubble.style.opacity = "1";
            }
            
            // Keep the bubble visible until the AI responds
            // The bubble will remain visible so users can see their comment and the "AI is responding" message
          }
          
        } catch (err) {
          console.error("ERROR SENDING COMMENT:", err);
          alert("Error sending comment. Check console for details.");
        }
      });
      
      // Also handle form submission
      commentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        console.log("Form submitted");
        submitBtn.click(); // Trigger the click handler
      });
      
      // Focus the textarea
      setTimeout(() => textarea.focus(), 10);
      
      return; // Exit early - we're showing the form
    }

    // Otherwise show the conversation
    
    // Check if we have conversation history to display
    if (bubbleData.conversationHistory && bubbleData.conversationHistory.length > 0) {
      // Display the entire conversation history
      bubbleData.conversationHistory.forEach(msg => {
        if (msg.role === 'user') {
          // Show user message
          const userDiv = document.createElement("div");
          userDiv.className = "user-comment p-3 bg-blue-50";
          
          // Add a smaller label for the user's comment
          const labelSpan = document.createElement("span");
          labelSpan.className = "text-xs font-bold text-gray-700 inline-block mr-1";
          labelSpan.textContent = "You:";
          userDiv.appendChild(labelSpan);
          
          // Add the comment text with proper styling
          const commentTextSpan = document.createElement("span");
          commentTextSpan.className = "inline text-black";
          commentTextSpan.textContent = msg.content;
          userDiv.appendChild(commentTextSpan);
          
          contentDiv.appendChild(userDiv);
        } else {
          // Show AI message
          const aiDiv = document.createElement("div");
          aiDiv.className = "ai-reply p-3 bg-gray-50 border-t";
          
          // Add a smaller label for the AI's response
          const aiLabelSpan = document.createElement("span");
          aiLabelSpan.className = "text-xs text-gray-700 inline-block mr-1";
          aiLabelSpan.textContent = "AI:";
          aiDiv.appendChild(aiLabelSpan);
          
          // Add the reply text with proper styling
          const aiTextSpan = document.createElement("span");
          aiTextSpan.className = "inline";
          aiTextSpan.textContent = msg.content;
          aiDiv.appendChild(aiTextSpan);
          
          contentDiv.appendChild(aiDiv);
        }
      });
    } else {
      // Fallback to legacy behavior
      // Add user comment with a clear label
      const userDiv = document.createElement("div");
      userDiv.className = "user-comment p-3 bg-blue-50";
      
      // Add a smaller label for the user's comment
      const labelSpan = document.createElement("span");
      labelSpan.className = "text-xs font-bold text-gray-700 inline-block mr-1";
      labelSpan.textContent = "You:";
      userDiv.appendChild(labelSpan);
      
      // Add the comment text with proper styling
      const commentTextSpan = document.createElement("span");
      commentTextSpan.className = "inline text-black";
      commentTextSpan.textContent = bubbleData.userComment;
      userDiv.appendChild(commentTextSpan);
      
      contentDiv.appendChild(userDiv);

      // Add AI reply if available
      if (bubbleData.aiReply) {
        const aiDiv = document.createElement("div");
        aiDiv.className = "ai-reply p-3 bg-gray-50 border-t";
        
        // Add a smaller label for the AI's response
        const aiLabelSpan = document.createElement("span");
        aiLabelSpan.className = "text-xs text-gray-700 inline-block mr-1";
        aiLabelSpan.textContent = "AI:";
        aiDiv.appendChild(aiLabelSpan);
        
        // Add the reply text with proper styling
        const aiTextSpan = document.createElement("span");
        aiTextSpan.className = "inline";
        aiTextSpan.textContent = bubbleData.aiReply;
        aiDiv.appendChild(aiTextSpan);
        
        contentDiv.appendChild(aiDiv);
      }
    }

    // Only add the reply box if this bubble is active
    if (activeBubbleId === targetId) {
        const replyForm = document.createElement("form");
        replyForm.className = "follow-up-form p-2 border-t bg-white";
        
        const textarea = document.createElement("textarea");
        textarea.placeholder = "Add a follow-up comment...";
        textarea.className = "w-full p-2 border rounded text-sm min-h-[40px] resize-none";
        textarea.rows = 2;
        
        const submitBtn = document.createElement("button");
        submitBtn.type = "submit";
        submitBtn.className = "mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600";
        submitBtn.textContent = "Reply";
        
        replyForm.appendChild(textarea);
        replyForm.appendChild(submitBtn);
        contentDiv.appendChild(replyForm);
        
        // Direct event handler for follow-up button
        submitBtn.addEventListener('click', function(e) {
          e.preventDefault();
          console.log("FOLLOW-UP BUTTON CLICKED DIRECTLY");
          
          // Simple version with minimal code
          const followUpText = textarea.value.trim();
          if (!followUpText || !wsRef.current) {
            console.log("Empty follow-up or no websocket", {followUpText, ws: wsRef.current});
            return;
          }
          
          try {
            // Show visual feedback
            submitBtn.textContent = "Sending...";
            submitBtn.style.opacity = "0.7";
            
            // Optimistically update state and UI first
            // Set message in state immediately
            console.log("Optimistically setting follow-up in bubble state");
            updateBubbleMessages(prev => {
              console.log("Previous state:", prev);
              // Get the existing bubble data, or initialize if needed
              const existingBubble = prev[targetId] || { 
                userComment: "", 
                aiReply: undefined, 
                conversationHistory: [] 
              };
              
              // Get current conversation history or initialize
              let updatedHistory = existingBubble.conversationHistory || [];
              
              // Add the new user follow-up to history
              updatedHistory = [...updatedHistory, { role: 'user', content: followUpText }];
              
              const newState = {
                ...prev,
                [targetId]: { 
                  ...existingBubble, // Preserve existing data
                  userComment: followUpText, // Update latest user comment
                  aiReply: undefined, // Clear AI reply, waiting for new one
                  conversationHistory: updatedHistory // Update history
                }
              };
              console.log("New state after follow-up:", newState);
              return newState;
            });
            
            // Force an update to show waiting for AI
            console.log("Forcing update for follow-up response");
            
            const message = {
              kind: "comment",
              targetId: targetId,
              text: followUpText,
              snippet: highlightedText,
              paragraph: document.getElementById(targetId)?.closest('p')?.innerText || "",
              isFollowup: true
            };
            
            console.log("SENDING FOLLOW-UP:", message);
            wsRef.current.send(JSON.stringify(message));
            
            // --- Start: Immediate UI Update (Append Logic) ---
            const bubble = document.getElementById(`bubble-${targetId}`);
            const content = bubble?.querySelector('.bubble-content');
            
            if (content) {
              // 1. Remove existing follow-up form if present
              const existingForm = content.querySelector('.follow-up-form');
              if (existingForm) {
                content.removeChild(existingForm);
              }
              
              // 2. Remove existing loading indicator if present
              const existingLoading = content.querySelector('.ai-loading');
              if (existingLoading) {
                content.removeChild(existingLoading);
              }
              
              // 3. Create and append the new user message div
              const userDiv = document.createElement('div');
              userDiv.className = 'user-comment p-3 bg-blue-50';
              const labelSpan = document.createElement("span");
              labelSpan.className = "text-xs font-bold text-gray-700 inline-block mr-1";
              labelSpan.textContent = "You:";
              userDiv.appendChild(labelSpan);
              const commentTextSpan = document.createElement("span");
              commentTextSpan.className = "inline text-black";
              commentTextSpan.textContent = followUpText; // The user's new message
              userDiv.appendChild(commentTextSpan);
              content.appendChild(userDiv);
              
              // 4. Create and append the new loading indicator
              const loadingDiv = document.createElement('div');
              loadingDiv.className = 'ai-loading p-3 bg-gray-100 italic text-gray-500 border-t';
              loadingDiv.textContent = 'AI is responding...';
              content.appendChild(loadingDiv);
              
              // 5. Ensure the bubble scrolls to the bottom
              content.scrollTop = content.scrollHeight;
            }
            // --- End: Immediate UI Update (Append Logic) ---
            
          } catch (err) {
            console.error("ERROR SENDING FOLLOW-UP:", err);
            alert("Error sending follow-up. Check console for details.");
          }
        }); // End of submitBtn click handler
        
        // Also handle form submission
        replyForm.addEventListener('submit', function(e) {
          e.preventDefault();
          console.log("Follow-up form submitted");
          submitBtn.click(); // Trigger the click handler
        });
        
        // Focus the textarea
        setTimeout(() => textarea.focus(), 10);
      } // End of if(activeBubbleId === targetId)
    
    // Show loading indicator if we're waiting for an AI reply and not showing a reply form
    if (!bubbleData.aiReply && activeBubbleId !== targetId && bubbleData.userComment) {
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "ai-loading p-3 bg-gray-50 italic text-gray-500 border-t";
      loadingDiv.textContent = "AI is responding...";
      contentDiv.appendChild(loadingDiv);
    }

    // Never collapse bubbles after user action or when they have AI reply
    if (bubbleData.aiReply || bubbleData.userComment) {
      if (bubble) {
        bubble.classList.remove("collapsed");
      
        // Add a click handler to toggle expansion
        bubble.onclick = (e) => {
          // Only handle clicks on the bubble container itself
          if (e.target !== bubble || !(e.target instanceof HTMLElement)) return;
          
          console.log("Bubble clicked");
          // Prevent toggling if click was inside form elements
          const clickedElement = e.target as HTMLElement;
          if (clickedElement.closest('.follow-up-form') || clickedElement.closest('.comment-form')) {
            return;
          }

          if (bubble.classList.contains("collapsed")) {
            // Expand when collapsed
            bubble.classList.remove("collapsed");
            setActiveBubbleId(targetId);
            // Update position on expand
            const span = document.getElementById(targetId);
            if (span && docRef.current) {
              const spanRect = span.getBoundingClientRect();
              const docRect = docRef.current.getBoundingClientRect();
              const bubbleTop = spanRect.top + window.scrollY;
              const maxLeft = window.innerWidth - 280; // Bubble width + padding
              const docRightPos = docRect.right + window.scrollX + 20;
              const bubbleLeft = Math.min(docRightPos, maxLeft);
              bubble.style.top = `${bubbleTop}px`;
              bubble.style.left = `${bubbleLeft}px`;
            }
          } else {
            // Collapse when expanded
            bubble.classList.add("collapsed");
            if (activeBubbleId === targetId) {
              setActiveBubbleId(null);
            }
          }
        };
      }
    } else {
      // No need to collapse empty bubbles
      if (bubble) {
         bubble.classList.remove("collapsed");
      }
    }
    
    // Always ensure we have proper scrolling
    contentDiv.classList.add("max-h-[300px]");
    contentDiv.classList.add("overflow-y-auto");
  };

  // COMMENT FLOW --------------------------------------------------------------
  // Direct comment creation on selection (no tooltip button)
  const createCommentOnSelection = (range: Range) => {
    try {
      // capture snippet and paragraph text
      const highlighted = range.toString();
      const paraElem = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const paraText = (paraElem as HTMLElement).innerText;

      const id = `sel-${Date.now()}`;
      const span = document.createElement("span");
      span.id = id;
      span.className = "bg-yellow-100";
      
      // Try to surround the selection with a span
      try {
        range.surroundContents(span);
      } catch (e) {
        console.error("Error surrounding range:", e);
        // Alternative approach if surroundContents fails
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
      }
      
      // Create a proper comment box with a text input
      createCommentBubble(id, highlighted);
      
      // Clear the selection
      window.getSelection()?.removeAllRanges();
      
    } catch (error) {
      console.error("Error creating comment:", error);
      console.log("Selection error:", error);
    }
  };

  // mouse up handler
  const handleMouseUp = (e: MouseEvent) => {
    // Get the current selection
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      return; // No selection or collapsed selection
    }
    
    // Make sure the selection is inside our document
    const range = sel.getRangeAt(0);
    if (!docRef.current || !docRef.current.contains(range.commonAncestorContainer)) {
      return; // Selection is outside our document
    }
    
    // Get the selection's bounding rectangle
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return; // Invalid selection size
    }
    
    // Small delay to ensure it's a deliberate selection, not just a click
    setTimeout(() => {
      const selectedText = sel.toString().trim();
      if (selectedText.length > 0) {
        createCommentOnSelection(range);
      }
    }, 200); // Slightly longer delay to ensure it's a deliberate selection
  };

  useEffect(() => {
    // Selection handler for comment creation
    document.addEventListener("mouseup", handleMouseUp);
    
    // Click handler for document to hide all bubbles
    const docClickHandler = (e: MouseEvent) => {
      if (docRef.current && docRef.current.contains(e.target as Node)) {
        // Hide all comment bubbles when clicking in the document (unless it's a highlighted span)
        const target = e.target as HTMLElement;
        if (!target.classList || !target.classList.contains('bg-yellow-100')) {
          // Hide all comment bubbles
          document.querySelectorAll('.comment-bubble').forEach(bubble => {
            (bubble as HTMLElement).style.display = 'none';
          });
        }
      }
    };
    
    // Click handler for highlighted spans to show their bubble
    const highlightClickHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList && target.classList.contains('bg-yellow-100')) {
        e.stopPropagation(); // Prevent document click from hiding the bubble
        
        // Hide all other bubbles first
        document.querySelectorAll('.comment-bubble').forEach(bubble => {
          (bubble as HTMLElement).style.display = 'none';
        });
        
        // Show this span's bubble
        const spanId = target.id;
        const bubbleId = `bubble-${spanId}`;
        const bubble = document.getElementById(bubbleId);
        if (bubble) {
          bubble.style.display = 'block';
          // Make sure it's expanded
          bubble.classList.remove('collapsed');
          // Position it correctly
          const span = document.getElementById(spanId);
          if (span && docRef.current) {
            const spanRect = span.getBoundingClientRect();
            const docRect = docRef.current.getBoundingClientRect();
            
            bubble.style.top = `${spanRect.top + window.scrollY}px`;
            bubble.style.left = `${docRect.right + window.scrollX + 20}px`;
          }
          
          // Update the active bubble
          setActiveBubbleId(spanId);
        }
      }
    };
    
    document.addEventListener("click", docClickHandler);
    document.addEventListener("click", highlightClickHandler, true); // Use capture phase
    
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("click", docClickHandler);
      document.removeEventListener("click", highlightClickHandler, true);
    };
  }, []);

  // Automatic scrolling when content changes
  useEffect(() => {
    if (docRef.current) {
      docRef.current.scrollTop = docRef.current.scrollHeight;
    }
  }, [paras]);

  return (
    <div
      ref={docRef}
      id="doc"
      className="prose max-w-prose px-4 relative h-[calc(100vh-400px)] min-h-[300px] overflow-y-auto border rounded bg-white shadow"
    >
      {paras.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      
      <style>{`
        .comment-bubble {
          transition: all 0.2s ease;
          z-index: 1000;
          box-shadow: 0 3px 10px rgba(0,0,0,0.15);
          border: 2px solid #e5e7eb;
          min-height: 120px;
          max-height: none !important;
          overflow: visible;
          background-color: white;
          padding: 0;
          width: 280px;
        }
        .comment-bubble .bubble-content {
          width: 100%;
          min-height: 120px;
          max-height: 300px !important;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .comment-bubble:hover {
          border-color: #d1d5db;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .comment-bubble .highlighted-text {
          white-space: nowrap;
          padding: 6px 10px;
          min-height: 22px;
          max-height: 22px;
          line-height: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          display: block;
          width: 100%;
          border-bottom: 1px solid #eee;
        }
        .comment-bubble .user-comment,
        .comment-bubble .ai-reply {
          padding: 8px 10px;
          width: 100%;
          word-break: break-word;
          min-height: 36px;
          flex: 0 0 auto;
          display: block;
          font-size: 13px;
          line-height: 1.4;
          color: #000;
        }
        /* Make label and content appear on same line properly */
        .comment-bubble .text-xs.text-gray-700.inline-block {
          display: inline-block;
          font-weight: bold;
          margin-right: 5px;
          color: #4B5563; /* text-gray-700 */
        }
        .comment-bubble textarea {
          border: 1px solid #e5e7eb;
          font-size: 13px;
          resize: none;
          width: 100%;
          padding: 8px;
        }
        .comment-bubble .comment-form,
        .comment-bubble .follow-up-form {
          padding: 10px;
          width: 100%;
        }
        .comment-bubble button {
          background-color: #2563eb;
          transition: background-color 0.15s;
        }
        .comment-bubble button:hover {
          background-color: #1d4ed8;
        }
        .user-comment {
          word-break: break-word;
          font-size: 13px;
          color: #000;
        }
        .ai-reply {
          word-break: break-word;
          font-size: 13px;
        }
        .highlighted-text {
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #6b7280;
          font-size: 12px;
        }
        .ai-loading {
          font-size: 12px;
          color: #9ca3af;
        }
        .bg-yellow-100 {
          background-color: rgba(254, 240, 138, 0.5); /* Lighter highlight */
          border-bottom: 1px dotted #d97706;
          padding: 0 1px;
          cursor: pointer;
          position: relative;
        }
        .bg-yellow-100:hover {
          background-color: rgba(254, 240, 138, 0.8);
        }
        .bg-yellow-100:after {
          content: "";
          position: absolute;
          top: -3px;
          right: -10px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #d97706;
          opacity: 0.7;
        }
        /* Add a subtle border around the document to clearly define the margin space */
        #doc {
          border-color: #e5e7eb;
        }
      `}</style>
    </div>
  );
}