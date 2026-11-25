import { useEffect, useRef, useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import {
  finishConversation,
  sendConversationTurn,
  startConversation,
  type ConversationSummary,
  type Correction,
} from "../../lib/agentsApi";
import { SPEECH_LANG } from "../../lib/lessonsApi";
import type { Mnemonic } from "../../lib/mnemonicsApi";
import { getRecognition, transcriptsOf, type Recognition } from "../../lib/speech";

interface Message {
  role:        "user" | "assistant";
  text:        string;
  correction?: Correction | null;
}

export default function ConversationPanel({
  card,
  learning,
  native,
  onClose,
}: {
  card: Mnemonic;
  learning: string;
  native: string;
  onClose: () => void;
}) {
  const { speak, cancel } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";
  const Recognizer = getRecognition();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(true);
  const [notice, setNotice]     = useState<string | null>(null);
  const [left, setLeft]         = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [summary, setSummary]   = useState<ConversationSummary | null>(null);
  const started = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startConversation(card.id, learning, native)
      .then(answer => {
        setLeft(answer.remaining_today);
        if (answer.reply) setMessages([{ role: "assistant", text: answer.reply }]);
        else setNotice(answer.message ?? "The AI partner is not available right now.");
      })
      .catch(error => setNotice(error instanceof Error ? error.message : "Could not start the conversation."))
      .finally(() => setBusy(false));
  }, [card.id, learning, native]);

  useEffect(() => () => {
    recognition.current?.abort();
    cancel();
  }, [cancel]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setBusy(true);
    setNotice(null);
    try {
      const answer = await sendConversationTurn(card.id, learning, native, history, text);
      setLeft(answer.remaining_today);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], correction: answer.correction };
        return answer.reply ? [...updated, { role: "assistant", text: answer.reply }] : updated;
      });
      if (!answer.reply) setNotice(answer.message ?? "No answer this time. Try again.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    if (!Recognizer) return;
    recognition.current?.abort();
    const rec = new Recognizer();
    rec.lang = voice;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = event => setInput(prev => [prev, transcriptsOf(event)[0] ?? ""].filter(Boolean).join(" "));
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  const finish = async () => {
    setBusy(true);
    cancel();
    const own = messages.filter(m => m.role === "user");
    try {
      setSummary(
        await finishConversation(
          card.id,
          learning,
          native,
          own.map(m => m.text),
          own.flatMap(m => (m.correction ? [m.correction] : [])),
        ),
      );
      setMessages([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the results.");
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <section className="card step-card chat-summary">
        <p className="eyebrow">Conversation finished</p>
        <h2 className="h2">Nice talk!</h2>
        <p>
          {summary.words_used.length > 0
            ? <>You used <b>{summary.words_used.join(", ")}</b>.</>
            : "Next time, try to use the lesson words."}
        </p>
        <p className="muted">
          {summary.mistakes_saved === 0
            ? "No corrections this time."
            : `${summary.mistakes_saved} correction${summary.mistakes_saved === 1 ? "" : "s"} saved to practise later.`}
          {" "}The conversation itself was not saved.
        </p>
        <button className="btn btn--primary self-start" onClick={onClose}>Back to my cards</button>
      </section>
    );
  }

  return (
    <section className="card chat" aria-label={`Conversation about ${card.word}`}>
      <header className="chat__head">
        <div className="chat__pic">
          {card.image_url ? <img src={card.image_url} alt="" /> : <span aria-hidden="true">{card.emoji ?? "🐢"}</span>}
        </div>
        <div className="grow">
          <p className="eyebrow">Talk about your picture · {card.word}</p>
          <p className="chat__sentence">“{card.sentence}”</p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
      </header>

      <div className="chat__log" aria-live="polite">
        {messages.map((message, i) => (
          <div key={i} className="chat__row" data-role={message.role}>
            <div className="chat__bubble">
              <span>{message.text}</span>
              {message.role === "assistant" && (
                <button className="chat__speak" onClick={() => speak(message.text, voice)} aria-label="Listen">🔊</button>
              )}
            </div>
            {message.correction && (
              <p className="chat__fix">
                Better: <b>{message.correction.right}</b>
                {message.correction.why && <span className="muted"> · {message.correction.why}</span>}
              </p>
            )}
          </div>
        ))}
        {busy && <p className="chat__typing" role="status">…</p>}
        <div ref={bottom} />
      </div>

      {notice && <p className="grammar-tip grammar-tip--quiet" role="alert">{notice}</p>}

      <form className="chat__form" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="visually-hidden" htmlFor="chat-input">Your answer</label>
        <input
          id="chat-input"
          className="input grow"
          value={input}
          maxLength={300}
          onChange={e => setInput(e.target.value)}
          placeholder="Write or say your answer"
          autoComplete="off"
          disabled={messages.length === 0}
        />
        {Recognizer && (
          <button type="button" className="btn btn--light" onClick={listen} disabled={listening || messages.length === 0}>
            {listening ? "Listening…" : "🎤"}
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy || !input.trim()}>Send</button>
      </form>

      <div className="row row--between">
        <p className="small muted">Not saved: only the words you used and the corrections are kept.{left !== null && ` · ${left} AI answers left today`}</p>
        <button className="btn btn--secondary btn--sm" onClick={finish} disabled={busy || !messages.some(m => m.role === "user")}>
          End conversation
        </button>
      </div>
    </section>
  );
}
