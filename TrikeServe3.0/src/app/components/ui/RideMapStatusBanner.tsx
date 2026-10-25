type RideMapStatusBannerProps = {
  label: string;
  active?: boolean;
  topClassName?: string;
};

export default function RideMapStatusBanner({
  label,
  active = true,
  topClassName = 'top-[calc(env(safe-area-inset-top,0px)+3.75rem)]',
}: RideMapStatusBannerProps) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute left-3 ${topClassName} z-[1101]`}
    >
      <div className="inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 whitespace-nowrap rounded-full border border-white/70 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
        <span className={`size-2 shrink-0 rounded-full ${active ? 'animate-pulse bg-[var(--success)]' : 'bg-[var(--info)]'}`} aria-hidden="true" />
        <span className="truncate text-xs font-bold text-[#122724]">{label}</span>
      </div>
    </div>
  );
}
