import { useEffect, useState } from 'react';
import reavionLogoWhite from '@assets/reavion-white.png';
import reavionLogoBlack from '@assets/reavion-black.png';
import { useAuthStore } from '@/stores/auth.store';
import { useAppStore } from '@/stores/app.store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Settings, User, Zap } from 'lucide-react';
import { WorkspaceSelector } from './WorkspaceSelector';
import { useBillingStore } from '@/stores/billing.store';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function TitleBar() {
  const { user, signOut } = useAuthStore();
  const { setActiveView } = useAppStore();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const { subscription, isLoading } = useBillingStore();
  const isPro = subscription?.status === 'active' || subscription?.status === 'trialing';

  useEffect(() => {
    const unsubscribe = (window as any).api?.window?.onFullScreenChange?.((fs: boolean) => {
      setIsFullScreen(fs);
    });
    return () => unsubscribe?.();
  }, []);

  const userInitials = user?.email
    ? user.email.split('@')[0].substring(0, 2).toUpperCase()
    : 'U';

  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="h-12 min-h-[48px] flex items-center justify-between bg-sidebar border-b border-border/30 drag-region transition-colors duration-200">
      <div className="flex items-center gap-2 pl-6">
        <img
          src={reavionLogoWhite}
          alt="Reavion"
          className={`h-3 w-auto select-none transition-all duration-300 ease-in-out hidden dark:block ${isFullScreen ? 'ml-0' : 'ml-14'}`}
          draggable={false}
        />
        <img
          src={reavionLogoBlack}
          alt="Reavion"
          className={`h-3 w-auto select-none transition-all duration-300 ease-in-out block dark:hidden ${isFullScreen ? 'ml-0' : 'ml-14'}`}
          draggable={false}
        />
      </div>

      <div className="flex items-center gap-4 pr-4 no-drag">
        <TooltipProvider delayDuration={400}>
          {!isLoading && isPro && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">
                  <Badge
                    variant="outline"
                    className="h-[20px] px-2 border-border bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-all duration-300"
                  >
                    <span className="text-[9px] font-bold tracking-[0.1em] uppercase">Pro</span>
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex flex-col gap-1 p-3">
                <p className="font-bold text-[11px] text-primary">Pro Status Active</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  You have unlimited AI actions and all premium features unlocked.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <WorkspaceSelector />
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center transition-opacity hover:opacity-80 outline-none relative group">
              <Avatar className="h-8 w-8 border border-border group-hover:border-primary/50 transition-colors">
                <AvatarImage src={avatarUrl} alt={user?.email || 'User'} className="object-cover" />
                <AvatarFallback className="bg-muted text-[10px] font-bold text-muted-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.email}</p>
                <p className="text-xs leading-none text-muted-foreground">Personal Account</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setActiveView('settings')}
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
