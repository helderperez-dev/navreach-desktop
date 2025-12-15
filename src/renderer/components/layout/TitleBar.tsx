import navreachLogo from '@assets/navreach-white.png';

export function TitleBar() {
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
     
    </div>
  );
}
