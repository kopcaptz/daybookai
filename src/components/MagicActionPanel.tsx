import { Sparkles, BookOpen, Settings2, ShieldCheck } from 'lucide-react';

const MagicActionPanel = () => {
  return (
    <div className="fixed top-6 right-6 flex flex-col gap-4 z-50">
      {/* Main panel container */}
      <div className="flex flex-col p-2 bg-background/40 backdrop-blur-md border border-glow-primary/30 rounded-2xl shadow-[0_0_15px_hsl(var(--glow-primary)/0.2)] transition-all hover:border-glow-primary/60 group">
        
        {/* Mode toggle button (Insight / Spell) */}
        <button className="p-3 mb-2 rounded-xl hover:bg-primary/20 text-primary transition-colors group-hover:scale-105" title="Toggle Mode">
          <BookOpen size={24} />
        </button>

        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-primary/50 to-transparent self-center mb-2" />

        {/* Tools */}
        <button className="p-3 rounded-xl hover:bg-accent/20 text-accent transition-colors" title="AI Magic">
          <Sparkles size={24} />
        </button>
        
        <button className="p-3 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors" title="Settings">
          <Settings2 size={24} />
        </button>

        {/* Connection status (Magic node) */}
        <div className="mt-2 p-3 flex items-center justify-center text-green-400/80 animate-pulse" title="Connection Active">
          <ShieldCheck size={20} />
        </div>
      </div>
    </div>
  );
};

export default MagicActionPanel;
