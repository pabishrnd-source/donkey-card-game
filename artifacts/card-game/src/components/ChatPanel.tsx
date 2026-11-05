import { useMemo, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";
import { type ChatMessage } from "@/lib/gameTypes";
import { cn } from "@/lib/utils";

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEvent = {
  results: {
    length: number;
    item(index: number): SpeechRecognitionResult;
  };
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const speechWindow = window as typeof window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface ChatPanelProps {
  messages: ChatMessage[];
  myPlayerId: string | null;
  onSend: (text: string) => void;
  compact?: boolean;
}

export function ChatPanel({ messages, myPlayerId, onSend, compact = false }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  const supportsVoice = Boolean(SpeechRecognition);

  const visibleMessages = useMemo(() => messages.slice(-40), [messages]);

  function sendCurrentText() {
    const cleanText = text.trim();
    if (!cleanText) return;
    onSend(cleanText);
    setText("");
  }

  function toggleVoiceInput() {
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results.item(index)[0].transcript;
      }
      setText(transcript.trim());

      const lastResult = event.results.item(event.results.length - 1);
      if (lastResult.isFinal && transcript.trim()) {
        onSend(transcript.trim());
        setText("");
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <section
      className={cn(
        "rounded-xl border-2 border-yellow-300 bg-green-950/85 p-2.5 text-white shadow-xl",
        compact ? "space-y-2" : "space-y-3",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-normal text-yellow-100">Chat</h2>
        <span className="text-[11px] font-semibold text-yellow-100/70">
          Type or speak
        </span>
      </div>

      <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg bg-black/20 p-2 sm:max-h-44">
        {visibleMessages.length === 0 ? (
          <p className="text-xs italic text-white/55">No messages yet.</p>
        ) : (
          visibleMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-lg px-2 py-1 text-xs",
                message.playerId === myPlayerId ? "ml-6 bg-yellow-300 text-green-950" : "mr-6 bg-white/15",
              )}
            >
              <p className="font-black">{message.playerName}</p>
              <p className="break-words">{message.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") sendCurrentText();
          }}
          maxLength={240}
          placeholder="Message players"
          className="min-w-0 flex-1 rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-yellow-400"
        />
        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={!supportsVoice}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border border-yellow-200 bg-green-700 text-yellow-100",
            listening && "bg-red-600 text-white",
            !supportsVoice && "opacity-40",
          )}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
        >
          {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
        </button>
        <button
          type="button"
          onClick={sendCurrentText}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-yellow-300 text-green-950"
          aria-label="Send chat message"
        >
          <Send className="size-4" />
        </button>
      </div>
    </section>
  );
}
