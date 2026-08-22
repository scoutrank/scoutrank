import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Sparkles, X, Zap, Trophy, Brain, Target } from 'lucide-react';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY ?? '';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are Scout Bot, an elite AI sports performance coach. You help athletes reach their peak potential through personalised training advice, performance analysis, and mental coaching.

Your personality:
- Elite coach energy: direct, confident, data-driven, and genuinely invested in athlete success
- Use sports terminology naturally and speak to athletes as professionals
- Be concise but thorough — quality over quantity
- Inspire action, not just give information

You specialise in:
- Sport-specific training plans and periodisation
- Performance analysis and weakness identification  
- Pre-competition mental preparation
- Injury prevention, recovery, and nutrition
- Talent development and scouting advice
- Career guidance for athletes

Format your responses with clear structure using markdown when helpful. Always end with an actionable next step.`;

type Role = 'user' | 'assistant' | 'system';
type Msg = { id: string; role: Role; content: string; streaming?: boolean };

const WELCOME = `# Welcome to Scout Bot! 🏆

I'm your personal **AI sports performance coach** — here to help you train smarter, compete better, and get discovered.

What I can help you with today:`;

const FEATURES = [
  { icon: Zap, label: 'Training Plans', desc: 'Sport-specific, periodised programs' },
  { icon: Brain, label: 'Mental Performance', desc: 'Competition prep & focus techniques' },
  { icon: Target, label: 'Performance Analysis', desc: 'Identify and fix weaknesses' },
  { icon: Trophy, label: 'Scout Readiness', desc: 'Stand out to coaches and scouts' },
];

const CHIPS = [
  'Build me a 4-week training plan',
  'How do I get noticed by scouts?',
  'Pre-game mental routine tips',
  'Review my performance weaknesses',
];

function md(text: string) {
  return text
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mb-2 mt-1">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mb-1 mt-3">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-white mb-1 mt-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(\s*)(<li[\s\S]+?<\/li>)(\s*)/g, '<ul class="space-y-1 my-1.5">$2</ul>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}

async function* streamGroq(messages: { role: Role; content: string }[]): AsyncGenerator<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], max_tokens: 1200, stream: true }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      const d = t.slice(6);
      if (d === '[DONE]') return;
      try {
        const tok = JSON.parse(d).choices[0]?.delta?.content ?? '';
        if (tok) yield tok;
      } catch { /* skip */ }
    }
  }
}

export default function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'w', role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const abort = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setErr('');
    abort.current = false;
    const uid = Date.now().toString();
    const bid = (Date.now() + 1).toString();
    setMsgs(p => [...p, { id: uid, role: 'user', content: t }, { id: bid, role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setStreaming(true);
    const history = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: t });
    try {
      let acc = '';
      for await (const tok of streamGroq(history)) {
        if (abort.current) break;
        acc += tok;
        setMsgs(p => p.map(m => m.id === bid ? { ...m, content: acc } : m));
      }
      setMsgs(p => p.map(m => m.id === bid ? { ...m, streaming: false } : m));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setMsgs(p => p.filter(m => m.id !== bid));
    } finally {
      setStreaming(false);
    }
  }, [streaming, msgs]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const isWelcome = msgs.length === 1;

  return (
    <div className="flex flex-col h-[100dvh] bg-[#080b18] text-white font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0d1023]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight">Scout Bot</span>
              <span className="h-2 w-2 rounded-full bg-green-400 shadow shadow-green-400/60" />
            </div>
            <span className="text-xs text-white/40">AI Sports Performance Coach</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/40 transition-all">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            ScoutRank
          </a>
          <button onClick={() => { abort.current = true; setMsgs([{ id: 'w', role: 'assistant', content: WELCOME }]); setStreaming(false); }}
            className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {msgs.map(m => (
          <div key={m.id} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'assistant' && (
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center flex-shrink-0 shadow shadow-violet-500/20 mt-0.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-gradient-to-br from-violet-600 to-blue-500 text-white rounded-tr-sm shadow-lg shadow-violet-500/20'
                : 'bg-[#111628] border border-white/5 text-white/80 rounded-tl-sm'
            }`}>
              {m.role === 'assistant'
                ? m.streaming && !m.content
                  ? <span className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                  : <div dangerouslySetInnerHTML={{ __html: md(m.content) }} />
                : <p>{m.content}</p>
              }
            </div>
          </div>
        ))}

        {/* Feature grid — welcome state only */}
        {isWelcome && (
          <div className="ml-11 space-y-4">
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              {FEATURES.map(f => (
                <div key={f.label} className="bg-[#111628] border border-white/5 rounded-xl p-3">
                  <f.icon className="h-4 w-4 text-violet-400 mb-1.5" />
                  <div className="text-xs font-semibold text-white">{f.label}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 max-w-sm">
              {CHIPS.map(c => (
                <button key={c} onClick={() => send(c)}
                  className="px-3 py-1.5 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-full hover:bg-violet-500/20 hover:border-violet-500/40 transition-all">
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            {err} — Make sure VITE_GROQ_API_KEY is set.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — respects iOS safe area / home-indicator */}
      <div className="px-4 pt-3 border-t border-white/5 bg-[#0d1023]/80 backdrop-blur-xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}>
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask Scout Bot anything about sports performance..."
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-[#111628] border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-colors max-h-32 overflow-y-auto disabled:opacity-50"
            style={{ minHeight: '48px' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="h-12 w-12 flex-shrink-0 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20">
            {streaming ? <Sparkles className="h-5 w-5 animate-pulse" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-white/20 mt-2">Scout Bot · Groq AI · For training guidance only</p>
      </div>
    </div>
  );
}
