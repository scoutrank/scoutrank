import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, ArrowLeft, Sparkles, X } from 'lucide-react';
import { groqStream, SCOUT_BOT_SYSTEM_PROMPT } from '@/lib/groq';
import type { ChatMessage } from '@/lib/groq';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { AthleteGoal } from '@/lib/supabase';

const WELCOME = `Hi! I'm **Scout Bot** — your personal AI sports performance coach. 🏆

I can help you with:
- Training plans and performance improvement
- Sport-specific drills and technique tips
- Understanding and improving your ScoutRank score
- Injury prevention and recovery
- Mental performance and competition prep

What would you like to work on today?`;

const SUGGESTIONS = [
  'How do I improve my ScoutRank score?',
  'Create a weekly training plan for me',
  'Tips for pre-competition preparation',
  'How do scouts evaluate athletes?',
];

type Message = { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean };

// Turns the athlete's private Goals (see AthleteProfilePage's GoalsTab)
// into a short block appended to the system prompt, so Scout Bot's
// advice can actually reference what this athlete says they're working
// toward instead of staying generic. Only ever built from the CURRENT
// logged-in athlete's own goals (fetched below scoped to their own
// profile_id, same as the RLS policy enforces) — never any other
// athlete's, and never shown to coach/scout/parent accounts using
// Scout Bot, since those roles don't have goals at all.
function buildGoalsContext(goals: AthleteGoal[]): string {
  const active = goals.filter(g => g.status === 'active');
  if (active.length === 0) return '';
  const lines = active.map(g => {
    const due = g.target_date ? ` (target: ${g.target_date})` : '';
    const notes = g.notes ? ` — ${g.notes}` : '';
    return `- ${g.title}${due}${notes}`;
  });
  return `\n\nThis athlete has shared the following personal goals with you (private — only they can see these, and only you have this context). Reference them naturally when relevant, don't just recite the list back:\n${lines.join('\n')}`;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-3 mb-1">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Wrap each run of consecutive bullet lines in a single <ul> — matching
    // greedily line-by-line here (rather than the old non-greedy pattern,
    // which stopped at the first </li> and wrapped every bullet in its own
    // <ul>, stacking extra margin between every line of a list) so a
    // multi-item list renders as one compact block like it's meant to.
    .replace(/(?:<li[\s\S]*?<\/li>\s*)+/g, m => `<ul class="space-y-0.5 my-1.5">${m}</ul>`)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export default function ScoutBotPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [goals, setGoals] = useState<AthleteGoal[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Only athletes have goals — coaches/scouts/parents chatting with
  // Scout Bot get the plain system prompt. Scoped to the logged-in
  // user's own profile id, which is also all RLS on athlete_goals
  // would ever allow regardless.
  useEffect(() => {
    if (!profile || profile.role !== 'athlete') return;
    supabase.from('athlete_goals').select('*').eq('profile_id', profile.id)
      .then(({ data, error: err }) => {
        if (err) { console.error('[ScoutBot] Failed to load goals:', err.message); return; }
        setGoals((data as AthleteGoal[] | null) ?? []);
      });
  }, [profile?.id, profile?.role]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    const botId = (Date.now() + 1).toString();

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: botId, role: 'assistant', content: '', streaming: true },
    ]);
    setInput('');
    setIsStreaming(true);
    abortRef.current = false;

    // Build history for Groq (exclude the placeholder streaming message)
    const history: ChatMessage[] = [
      { role: 'system', content: SCOUT_BOT_SYSTEM_PROMPT + buildGoalsContext(goals) },
      ...messages
        .filter(m => m.id !== 'welcome' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmed },
    ];

    try {
      let accumulated = '';
      for await (const token of groqStream(history, 1024)) {
        if (abortRef.current) break;
        accumulated += token;
        setMessages(prev =>
          prev.map(m => m.id === botId ? { ...m, content: accumulated } : m)
        );
      }
      setMessages(prev =>
        prev.map(m => m.id === botId ? { ...m, streaming: false } : m)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setMessages(prev => prev.filter(m => m.id !== botId));
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, goals]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clearChat = () => {
    abortRef.current = true;
    setMessages([{ id: 'welcome', role: 'assistant', content: WELCOME }]);
    setIsStreaming(false);
    setError('');
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] bg-sr-bg">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sr-border bg-sr-surface/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="p-1.5 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center shadow-lg">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-white">Scout Bot</h1>
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            <p className="text-xs text-sr-text-muted">AI Sports Performance Coach</p>
          </div>
        </div>
        <button onClick={clearChat}
          className="p-1.5 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors"
          title="Clear chat">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0 shadow">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-sr-purple to-sr-blue text-white rounded-tr-sm'
                : 'bg-sr-surface border border-sr-border text-sr-silver rounded-tl-sm'
            }`}>
              {msg.role === 'assistant' ? (
                msg.streaming && !msg.content ? (
                  <span className="flex items-center gap-1 text-sr-text-muted">
                    <span className="h-1.5 w-1.5 bg-sr-purple rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 bg-sr-purple rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 bg-sr-purple rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                )
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Suggestion chips — only show when only the welcome message is present */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)}
                className="px-3 py-1.5 text-xs text-sr-purple-light bg-sr-purple/10 border border-sr-purple/20 rounded-full hover:bg-sr-purple/20 hover:border-sr-purple/40 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar — padded above mobile bottom nav */}
      <div className="px-4 pt-3 pb-3 md:pb-3 border-t border-sr-border bg-sr-surface/60 backdrop-blur-xl"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Scout Bot anything about sports performance..."
              rows={1}
              className="w-full resize-none input-dark py-3 pr-3 text-sm leading-relaxed max-h-32 overflow-y-auto"
              style={{ minHeight: '44px' }}
              disabled={isStreaming}
            />
          </div>
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg">
            {isStreaming ? (
              <Sparkles className="h-5 w-5 animate-pulse" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-sr-text-muted mt-2">
          Scout Bot · Powered by Groq · For training & performance guidance only
        </p>
      </div>
    </div>
  );
}
