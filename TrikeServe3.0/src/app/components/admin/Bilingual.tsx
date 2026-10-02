
import { useAuth } from "../../contexts/AuthContext";
import { isSuperAdmin } from "./adminNav";

/**
 * Super Admin is English-only by decision; the Rider Admin — the operators who
 * run a terminal day to day — get a short Filipino gloss. English always comes
 * first so neither audience has to read a language they don't use.
 */
export function useBilingual() {
  const { user } = useAuth();
  const enabled = !isSuperAdmin(user);
  return {
    enabled,
    /** Returns the English string, plus the gloss for the Rider Admin. */
    copy: (en: string, fil?: string) => (enabled && fil ? `${en} · ${fil}` : en),
  };
}

type BiProps = {
  en: string;
  fil: string;
  className?: string;
  /** Render the gloss as a second line instead of appending it inline. */
  block?: boolean;
};

/** English label with a Filipino gloss, shown only to the Rider Admin. */
export default function Bi({ en, fil, className, block = false }: BiProps) {
  const { enabled } = useBilingual();
  if (!enabled) return <>{en}</>;

  if (block) {
    return (
      <span className={className}>
        <span className="block">{en}</span>
        <span className="block text-[0.8em] opacity-75 font-normal">{fil}</span>
      </span>
    );
  }

  return (
    <span className={className}>
      {en}
      <span className="opacity-70 font-normal"> · {fil}</span>
    </span>
  );
}

