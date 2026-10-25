type RideMapStatusBannerProps = {
  label: string;
  topClassName?: string;
};

export default function RideMapStatusBanner({
  label,
  topClassName = 'top-3',
}: RideMapStatusBannerProps) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute left-1/2 ${topClassName} z-[1101] -translate-x-1/2`}
    >
      <div className="inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 whitespace-nowrap rounded-full border border-white/70 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--success)]" aria-hidden="true" />
        <span className="truncate text-xs font-bold text-[#122724]">{label}</span>
      </div>
    </div>
  );
}
