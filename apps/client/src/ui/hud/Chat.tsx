import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN } from "@hangout/shared";
import { sendChat, setTyping } from "../../net/session";
import { useGame } from "../../state/store";

/** Chat log plus the input box (Enter opens it, Enter sends, Esc closes). */
export function Chat() {
  const chat = useGame((s) => s.chat);
  const open = useGame((s) => s.chatOpen);
  const set = useGame((s) => s.set);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [chat]);
  // Others see a "…" bubble over you while there's text in the box.
  useEffect(() => setTyping(open && text.trim().length > 0), [open, text]);

  return (
    <div className="chat">
      <div className="chat-log" ref={list}>
        {chat.map((m) => (
          <div key={`${m.at}-${m.from}`}>
            <b>{m.name}:</b> {m.text}
          </div>
        ))}
      </div>
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) sendChat(text);
            setText("");
            set({ chatOpen: false });
          }}
        >
          <input
            ref={input}
            value={text}
            maxLength={CHAT_MAX_LEN}
            placeholder="Say something…"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => set({ chatOpen: false })}
            onKeyDown={(e) => e.key === "Escape" && set({ chatOpen: false })}
          />
        </form>
      ) : (
        <button className="ghost small" onClick={() => set({ chatOpen: true })}>
          Press Enter to chat
        </button>
      )}
    </div>
  );
}
