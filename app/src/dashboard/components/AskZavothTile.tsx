import aiOrb from "../../client/static/ai-orb.svg";
import { toast } from "../../client/hooks/use-toast";

export function AskZavothTile() {
  return (
    <aside className="bg-console-surface border-console-border fixed bottom-8 right-8 z-30 hidden w-[300px] flex-col items-center gap-5 rounded-2xl border px-6 pb-5 pt-7 shadow-[0px_12px_32px_0px_rgba(0,0,0,0.4)] lg:flex">
      <img src={aiOrb} alt="" className="size-20" />
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-console-fg text-base font-semibold">Ask Zavoth</p>
        <p className="text-console-muted text-xs">
          Voice-powered analytics assistant
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          toast({
            title: "Voice chat is on the way",
            description: "Ask Zavoth isn't wired up yet.",
          })
        }
        className="bg-console-mint text-console-mint-foreground hover:bg-console-mint/90 flex h-6 w-full cursor-pointer items-center justify-center rounded-[10px] text-[13px] font-semibold transition-colors"
      >
        Start Voice Chat
      </button>
      <p className="text-console-subtle font-mono text-[9px] font-medium tracking-[0.72px]">
        READY • LOW LATENCY
      </p>
    </aside>
  );
}
