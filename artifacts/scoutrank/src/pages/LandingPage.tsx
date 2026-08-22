import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { supabase } from '@/lib/supabase';
import { ArrowRight, BarChart3, Shield, Trophy, Video, Sparkles, Search, TrendingUp, Medal, Users, Activity, Bot, Zap, Brain, Target } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';

const features = [
  { icon: Trophy, title: 'Build Your Athlete Profile', desc: 'Create a premium sporting identity. Showcase your sports, stats, positions, achievements and journey.' },
  { icon: BarChart3, title: 'Climb the Rankings', desc: 'Compete on the global ScoutRank leaderboard. Track your rank movement across local, state, national and global levels.' },
  { icon: Video, title: 'Share Highlights', desc: 'Upload game footage, training clips and media. Let your performance speak for itself with a rich media gallery.' },
  { icon: Shield, title: 'Get Verified', desc: 'Submit achievements, stats and milestones for verification. Build a trusted reputation that coaches and scouts rely on.' },
  { icon: Sparkles, title: 'AI-Powered Insights', desc: 'Get AI-generated overviews of your sporting profile. Generate professional athlete resumes with one click.' },
  { icon: Search, title: 'Get Discovered', desc: 'Be found by coaches, scouts and clubs. Your verified profile and rankings make you impossible to miss.' },
];

const scoringPreview = [
  { icon: Trophy, label: 'Verified achievements', points: '+5 to +15' },
  { icon: BarChart3, label: 'Verified stats & PBs', points: '+3 to +8' },
  { icon: Medal, label: 'Competition results', points: '+2 to +10' },
  { icon: Users, label: 'Scout/coach endorsements', points: '+3 to +8' },
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

const AnimatedCounter = ({ value }: { value: number | undefined }) => {
  if (value === undefined) {
    return <span className="inline-block w-8 h-8 bg-sr-surface-light rounded animate-pulse" />;
  }
  return <span>{value.toLocaleString()}</span>;
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [liveStats, setLiveStats] = useState<{ athletes: number; clubs: number; posts: number } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'athlete'),
      supabase.from('athlete_details').select('club').not('club', 'is', null).neq('club', ''),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
    ]).then(([athletesRes, clubsRes, postsRes]) => {
      if (!active) return;
      const distinctClubs = new Set(
        (clubsRes.data ?? []).map((row: { club: string }) => row.club.trim().toLowerCase())
      ).size;

      setLiveStats({
        athletes: athletesRes.count ?? 0,
        clubs: distinctClubs,
        posts: postsRes.count ?? 0,
      });
    });

    return () => { active = false; };
  }, []);

  const { scrollYProgress } = useScroll();
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <div className="min-h-[100dvh] bg-sr-bg overflow-x-hidden selection:bg-sr-purple/30 selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-sr-bg/70 backdrop-blur-xl border-b border-sr-border/50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <Logo size="md" withText={true} />
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/login')} className="hidden sm:inline-flex">Log In</Button>
            <Button variant="brand" onClick={() => navigate('/signup')}>Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[100dvh] flex items-center justify-center pt-20 pb-32 px-4 overflow-hidden">
        {/* Background glow orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[10%] left-[20%] w-[600px] h-[600px] rounded-full bg-sr-purple/20 blur-[120px] mix-blend-screen" 
          />
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute top-[30%] right-[10%] w-[500px] h-[500px] rounded-full bg-sr-blue/20 blur-[120px] mix-blend-screen" 
          />
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sr-surface/50 border border-sr-border backdrop-blur-sm text-sr-text text-sm font-medium mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sr-purple opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sr-purple-light"></span>
            </span>
            The Future of Athlete Identity
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-display font-black tracking-tighter mb-6 uppercase leading-none"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-sr-silver to-sr-text-muted drop-shadow-sm">Rank.</span><br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-sr-silver to-sr-text-muted drop-shadow-sm">Rise.</span><br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sr-purple via-sr-violet to-sr-blue drop-shadow-[0_0_30px_rgba(138,63,252,0.4)]">Repeat.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg sm:text-xl md:text-2xl text-sr-text-muted max-w-2xl mx-auto mb-12 leading-relaxed font-light"
          >
            The premium sports social platform where serious athletes build their identity, 
            climb the rankings, and get discovered by scouts worldwide.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <Button variant="brand" size="lg" onClick={() => navigate('/signup')} className="w-full sm:w-auto h-14 px-8 text-lg shadow-[0_0_40px_rgba(138,63,252,0.4)]">
              Build Your Profile <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/rankings')} className="w-full sm:w-auto h-14 px-8 text-lg bg-sr-surface/30 backdrop-blur-sm hover:bg-sr-surface">
              Explore Rankings
            </Button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
          >
            {[
              { value: liveStats?.athletes, label: pluralize(liveStats?.athletes ?? 0, 'Athlete', 'Athletes'), icon: Activity },
              { value: liveStats?.clubs, label: pluralize(liveStats?.clubs ?? 0, 'Club', 'Clubs'), icon: Shield },
              { value: liveStats?.posts, label: pluralize(liveStats?.posts ?? 0, 'Highlight', 'Highlights'), icon: Video },
            ].map((stat, i) => (
              <div key={i} className="card-glass p-6 border-sr-border/50 bg-sr-surface/30 flex flex-col items-center justify-center">
                <stat.icon className="h-6 w-6 text-sr-text-muted mb-3" />
                <div className="text-3xl md:text-4xl font-display font-bold text-white mb-1">
                  <AnimatedCounter value={stat.value} />
                </div>
                <div className="text-sm text-sr-text-muted uppercase tracking-widest font-medium">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-4 relative z-10 bg-sr-bg">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-white mb-6 tracking-tight">Elite Tools for<br/>Elite Athletes</h2>
            <p className="text-xl text-sr-text-muted max-w-2xl mx-auto font-light">Built with the precision and performance you expect on the field.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div 
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative p-[1px] rounded-2xl bg-gradient-to-b from-sr-border/80 to-transparent hover:from-sr-purple/50 hover:to-sr-blue/30 transition-all duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-sr-purple/0 to-sr-blue/0 group-hover:from-sr-purple/10 group-hover:to-sr-blue/10 transition-colors duration-500" />
                <div className="relative h-full bg-sr-surface/80 backdrop-blur-xl rounded-[15px] p-8 flex flex-col items-start z-10">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-sr-surface-light to-sr-surface border border-sr-border flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-sr-purple/30 group-hover:shadow-[0_0_20px_rgba(138,63,252,0.2)] transition-all duration-300">
                    <f.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 tracking-tight">{f.title}</h3>
                  <p className="text-sr-text-muted leading-relaxed font-light">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How Rankings Work */}
      <section className="py-32 px-4 relative z-10 border-t border-sr-border/30 bg-gradient-to-b from-sr-bg to-sr-surface/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <h2 className="text-4xl sm:text-5xl font-display font-bold text-white mb-6 tracking-tight">The Science of<br/>ScoutRank</h2>
              <p className="text-lg text-sr-text-muted leading-relaxed mb-8 font-light">
                Your ScoutRank score isn't based on followers or likes. It's a precise, verified reflection of your sporting performance. 
                We use verified data to generate a dynamic rating that coaches trust.
              </p>
              
              <div className="space-y-4">
                {scoringPreview.map((entry, i) => (
                  <div key={entry.label} className="flex items-center p-4 rounded-xl bg-sr-surface border border-sr-border hover:border-sr-purple/30 transition-colors group">
                    <div className="h-12 w-12 rounded-lg bg-sr-bg flex items-center justify-center flex-shrink-0 mr-4 border border-sr-border group-hover:border-sr-purple/30 transition-colors">
                      <entry.icon className="h-5 w-5 text-sr-silver group-hover:text-sr-purple-light transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-white">{entry.label}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-display font-bold text-sr-purple-light bg-sr-purple/10 px-3 py-1 rounded-full">{entry.points}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 blur-[100px] rounded-full pointer-events-none" />
              <div className="relative card-glass p-8 sm:p-12 border-sr-purple/20 shadow-2xl text-center flex flex-col items-center">
                <div className="text-sm font-medium text-sr-text-muted uppercase tracking-widest mb-6">Open Division Score</div>
                <div className="text-8xl sm:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-sr-silver drop-shadow-lg mb-8">
                  87.4
                </div>
                <div className="w-full max-w-sm mx-auto space-y-4">
                  <div className="h-2 w-full bg-sr-bg rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sr-purple to-sr-blue w-[87.4%]" />
                  </div>
                  <div className="flex justify-between text-xs text-sr-text-muted font-mono">
                    <span>TOP 15%</span>
                    <span className="text-green-400 flex items-center"><TrendingUp className="h-3 w-3 mr-1" /> +2.1</span>
                  </div>
                </div>
                
                <div className="mt-12 p-6 rounded-xl bg-sr-bg border border-sr-border text-left w-full">
                  <div className="flex items-center gap-3 mb-2">
                    <Medal className="h-5 w-5 text-white" />
                    <h3 className="font-semibold text-white">Rankings start with you</h3>
                  </div>
                  <p className="text-sm text-sr-text-muted mb-4">Be one of the first verified athletes and claim the #1 spot on the global leaderboard.</p>
                  <Button variant="brand" className="w-full" onClick={() => navigate('/signup')}>Claim Your Profile</Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Scout Bot Section */}
      <section className="py-32 px-4 relative z-10 border-t border-sr-border/30 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(138,63,252,0.12),transparent_70%)] pointer-events-none" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sr-purple/10 border border-sr-purple/20 text-sr-purple-light text-sm font-medium mb-6">
              <Bot className="h-4 w-4" /> Introducing Scout Bot
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-white mb-6 tracking-tight">
              Your Personal<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sr-purple to-sr-blue">AI Sports Coach</span>
            </h2>
            <p className="text-xl text-sr-text-muted max-w-2xl mx-auto font-light">
              Get elite-level coaching advice, personalised training plans, and performance insights — free, instant, available 24/7.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Feature list */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="space-y-4"
            >
              {[
                { icon: Zap, title: 'Custom Training Plans', desc: 'Sport-specific, periodised programs built around your schedule and goals.' },
                { icon: Brain, title: 'Mental Performance', desc: 'Pre-competition routines, focus techniques, and pressure management strategies.' },
                { icon: Target, title: 'Performance Analysis', desc: 'Identify weaknesses, track improvement, and optimise your training load.' },
                { icon: Search, title: 'Scout Readiness', desc: 'Learn exactly what coaches and scouts look for — and how to stand out.' },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex items-start gap-4 p-4 rounded-xl bg-sr-surface/50 border border-sr-border hover:border-sr-purple/30 transition-all"
                >
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                    <f.icon className="h-5 w-5 text-sr-purple-light" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                    <p className="text-sm text-sr-text-muted">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Chat preview + CTA */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-sr-purple/15 to-sr-blue/15 blur-[80px] rounded-full pointer-events-none" />
              <div className="relative card-glass border-sr-purple/20 overflow-hidden">
                {/* Fake chat header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-sr-border/50 bg-sr-surface/60">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Scout Bot</p>
                    <p className="text-xs text-sr-text-muted flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />Online
                    </p>
                  </div>
                </div>
                {/* Fake messages */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-sr-surface border border-sr-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-sr-silver max-w-[80%]">
                      Hi! I'm Scout Bot. What sport do you compete in?
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-gradient-to-br from-sr-purple to-sr-blue rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white max-w-[80%]">
                      Football — I want to improve my speed and get scouted
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-sr-surface border border-sr-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-sr-silver max-w-[80%]">
                      Great. Let's build you a speed-focused 4-week programme with scout visibility tips...
                    </div>
                  </div>
                </div>
                {/* CTA */}
                <div className="px-5 pb-5">
                  <a href="/scout-bot/" className="block w-full text-center py-3 rounded-xl bg-gradient-to-r from-sr-purple to-sr-blue text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-sr-purple/25">
                    Try Scout Bot Free →
                  </a>
                  <p className="text-center text-xs text-sr-text-muted mt-2">No account needed · Powered by Groq AI</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-4 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sr-surface to-sr-bg" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(138,63,252,0.15),transparent_60%)] pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative max-w-4xl mx-auto text-center"
        >
          <Logo size="lg" className="justify-center mb-8" />
          <h2 className="text-5xl sm:text-6xl md:text-7xl font-display font-black text-white mb-6 uppercase tracking-tighter">
            Your Legacy <span className="text-transparent bg-clip-text bg-gradient-to-r from-sr-purple to-sr-blue">Starts Here</span>
          </h2>
          <p className="text-xl text-sr-text-muted mb-12 font-light max-w-2xl mx-auto">
            Join the definitive platform for athletic achievement. Build your profile, verify your stats, and take your place on the leaderboard.
          </p>
          <Button variant="brand" size="lg" onClick={() => navigate('/signup')} className="h-16 px-12 text-lg shadow-[0_0_40px_rgba(138,63,252,0.5)] hover:scale-105 transition-transform duration-300">
            Create Free Account
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sr-border/50 bg-sr-bg py-12 px-4 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" withText={true} />
          <div className="flex items-center gap-8 text-sm font-medium text-sr-text-muted">
            <a href="#" className="hover:text-white transition-colors">About</a>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/community-guidelines" className="hover:text-white transition-colors">Community Guidelines</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
          <p className="text-sm text-sr-text-muted">© 2026 ScoutRank. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
