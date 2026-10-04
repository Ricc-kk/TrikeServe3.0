import { useEffect, useState } from "react";

const TYPE_MS = 90;
const HOLD_MS = 1500;

type Phase = "typing" | "holding" | "deleting";

/**
 * A word that types itself into being, holds, deletes, then the next one.
 *
 * Returns only the animated word so the caller can pin a static prefix in
 * front of it, which is the point here: "Search" stays put while what follows
 * it swaps between a restaurant and a terminal.
 *
 * Two rules this hook holds to:
 *
 * - `words` must be a stable reference. It is read inside the effect on every
 *   tick, so an array literal built in the component body would restart the
 *   loop on every render and the word would never finish typing.
 * - Reduced motion is honoured. A placeholder rewriting itself forever is
 *   motion, and the app already respects `prefers-reduced-motion` elsewhere,
 *   so the finished word is simply shown and left alone.
 */
export function useTypingPlaceholder(words: readonly string[]): string {
  const [wordIndex, setWordIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const word = words[wordIndex] ?? "";

  useEffect(() => {
    if (reduced) {
      setLength(word.length);
      return;
    }

    // The pauses are the long ones; each character step is the type interval.
    const delay = phase === "holding" ? HOLD_MS : TYPE_MS;

    const id = setTimeout(() => {
      if (phase === "typing") {
        if (length + 1 >= word.length) setPhase("holding");
        setLength(length + 1);
        return;
      }

      if (phase === "holding") {
        setPhase("deleting");
        return;
      }

      // deleting
      if (length - 1 <= 0) {
        setLength(0);
        setWordIndex((i) => (i + 1) % words.length);
        setPhase("typing");
        return;
      }
      setLength(length - 1);
    }, delay);

    return () => clearTimeout(id);
  }, [length, phase, reduced, word, words]);

  if (reduced) return word;
  return word.slice(0, length);
}
