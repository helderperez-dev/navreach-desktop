import navreachLogo from '@assets/navreach-white.png';
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
import { LogOut, Settings, User } from 'lucide-react';

export function TitleBar() {
  const { user, signOut } = useAuthStore();
  const { setActiveView } = useAppStore();

  const userInitials = user?.email
    ? user.email.split('@')[0].substring(0, 2).toUpperCase()
    : 'U';

  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="h-12 min-h-[48px] flex items-center justify-between bg-sidebar border-b border-border drag-region">
      <div className="flex items-center gap-2 pl-6">
        <img
          src={navreachLogo}
          alt="Navreach"
          className="h-4 w-auto select-none ml-14"
          draggable={false}
        />
      </div>

      <div className="flex items-center gap-4 pr-4 no-drag">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center transition-opacity hover:opacity-80 outline-none">
              <Avatar className="h-8 w-8 border border-white/10">
                <AvatarImage src={avatarUrl} alt={user?.email || 'User'} />
                <AvatarFallback className="bg-zinc-800 text-[10px] font-bold text-white/60">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#161617] border-white/10 text-white">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.email}</p>
                <p className="text-xs leading-none text-white/40">Personal Account</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              className="focus:bg-white/5 cursor-pointer"
              onClick={() => setActiveView('settings')}
            >
              <Settings className="mr-2 h-4 w-4 text-white/60" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="focus:bg-white/5 cursor-pointer text-red-400 focus:text-red-400"
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
