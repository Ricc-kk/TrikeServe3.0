import { useCallback, useEffect, useRef, useState } from "react";
import { Send, User, Users, X } from "lucide-react";
import { supabase, supabaseHelpers } from "@/lib/supabase";

/**
 * The passenger/driver conversation as a popup over the live ride.
 *
 * This was a full-page navigation to the Messages tab. That meant leaving the map
 * behind a different screen, and the ride screen it came from -- which owns the
 * chat head -- was unmounted, so the head disappeared exactly when the chat
 * opened and had to be reconstructed from navigation state. A gap had to be
 * reserved above the thread header for it, and that gap showed the ride screen's
 * own background through as a band across the top of the chat.
 *
 * An overlay removes all three problems: the map stays behind, the head stays
 * mounted because the ride screen never unmounts, and there is no reserved gap
 * to fill. Reading also stops costing the driver their place in the ride.
 *
 * Quick replies are here rather than in the Messages tab for the same reason --
 * one tap while stopped, without navigating away from the map.
 */

const QUICK_REPLIES = [
  "On my way",
  "Where are you exactly?",
  "Please be ready at the pickup point",
  "Running a few minutes late",
  "I'm at your pickup point",
  "You're on the tricycle, let's go",
];

/** Day label for the divider. No year: a thread is read over days, not years. */
function dayLabel(date: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short" });
}

export default function RideChatOverlay({
  open,
  conversationId,
  peerAvatar,
  peerName,
  peerId,
  peerIsGroup,
  senderRole,
  onClose,
}: {
  open: boolean;
  conversationId: string | null;
  peerAvatar: string | null;
  peerName: string;
  /**
   * The other participant's user id.
   *
   * Passed in rather than read back out of the thread's own messages. An empty
   * thread is exactly the moment this is first needed -- the ride chat is created
   * before anyone has written in it -- and inferring the peer from a message that
   * does not exist yet produced a blank `receiver_id`.
   */
  peerId: string | null;
  /** A shared ride has several passengers and no single face to show. */
  peerIsGroup?: boolean;
  /** 'rider' for the driver, 'customer' for the passenger. */
  senderRole: 'rider' | 'customer';
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  /** Who "mine" means. Resolved once and held, so every bubble agrees. */
  const [meId, setMeId] = useState<string | null>(null);
  const [text, setText] = useState('');
  /**
   * Whether the sheet is animating out.
   *
   * The exit needs a frame to play. Unmounting the moment the parent sets
   * `open: false` removes the node immediately, so the element carrying the
   * closing animation is gone before the browser ever paints it -- the sheet
   * would simply vanish. This holds the node up until the animation ends.
   */
  const [closing, setClosing] = useState(false);
  /** Whether the in-place profile card under the header name is expanded. */
  const [profileOpen, setProfileOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isImage = (v: string | null | undefined) => {
    const s = v?.trim() || '';
    return /^https?:\/\//i.test(s) || s.startsWith('data:image/');
  };

  const load = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabaseHelpers.getChatMessages(conversationId);
    if (data) setMessages(data as any[]);
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [open, load]);

  // Opening the popup is the act of reading, so anything unread is read now.
  useEffect(() => {
    if (!open || !conversationId || !meId) return;
    supabaseHelpers.markChatConversationRead(conversationId, meId);
  }, [open, conversationId, meId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  /**
   * Ask the parent to close, then unmount once the exit animation has run.
   *
   * `requestClose` is what every close path calls -- the header control and
   * Escape alike -- so both animate out instead of one snapping shut.
   */
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 200);
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (!body || !conversationId || sending) return;

    const mine = meId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!mine) return;

    /*
     * Never send without a receiver.
     *
     * `receiver_id` is a UUID column, so a blank one is rejected by Postgres as
     * "invalid input syntax for type uuid" -- an error that says nothing about
     * the actual fault and never reaches the screen. Sending nothing at all is
     * worse than saying so, so this stops here with an explanation.
     */
    if (!peerId) {
      alert(
        "Message failed to send: the other person could not be identified. Close the chat and open it again."
      );
      return;
    }

    setSending(true);
    try {
      const { error } = await supabaseHelpers.sendChatMessage({
        conversationId,
        senderId: mine,
        receiverId: peerId,
        senderName: senderRole === 'rider' ? 'Driver' : 'Customer',
        senderRole,
        receiverRole: senderRole === 'rider' ? 'customer' : 'rider',
        message: body,
      });
      // The composer keeps the text on failure, so a retry costs nothing but a
      // tap. Failing silently looked identical to a dead send button.
      if (error) {
        console.error('[RideChatOverlay] Send message failed:', error);
        alert('Message failed to send. Please try again.');
        return;
      }
      setText('');
      load();
    } finally {
      setSending(false);
    }
  };

  // Held open through the exit animation; `closing` only drives which keyframe
  // is applied, the parent still owns whether the sheet is open.
  if (!open && !closing) return null;

  /*
   * The chat fills the screen, but the head sits outside the chatbox.

   * The panel is full-bleed -- the driver asked for the whole screen, which is
   * right for reading a conversation on a phone. The head does not sit on top of
   * it: it occupies its own strip above the panel, so the panel's edge never
   * crosses or clips the head. Overlapping it looked deliberate until the panel
   * scrolled, and then the head was half-buried under the chat.

   * That strip is deliberately transparent, so the active ride page shows through it.
   * It has been filled twice -- once with `--surface`, once with `--muted` to match
   * the message list -- and both were wrong. A flat fill of any colour reads as a
   * band stuck across the top of the chat. What belongs there is the ride the
   * driver is in the middle of: the map and the ride card, not a slab of colour.
   * The panel below is opaque, so the conversation itself is unaffected.
   *
   * The root is `pointer-events-none`, so the ride screen in that strip is not
   * merely painted, it is still live -- a tap beside the head reaches the map.
   */
  return (
    <div className="pointer-events-none fixed inset-0 z-[1700]">
      <div
        className={`ride-chat-sheet pointer-events-none absolute inset-0 flex flex-col ${
          closing ? 'ride-chat-sheet--closing' : ''
        }`}
        role="dialog"
        aria-label={`Chat with ${peerName}`}
      >
        {/*
            The chat head, outside the chatbox entirely.

            It is a sibling of the panel, above it with a real gap, not overlapping
            its border and not nested inside its header. Sitting on the box meant it
            read as part of the panel and got clipped whenever the panel was
            smaller than the head claimed. As a sibling it stays the same floating
            control the ride screen shows, and the panel below is free to be any
            size without having to reserve room for it.

            `ml-auto` right-aligns it over the panel rather than centring it, which
            would leave it hanging in the middle of nothing.
        */}
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close chat"
          className="pointer-events-auto mb-2 mr-3 ml-auto mt-2 size-14 flex-shrink-0 overflow-hidden rounded-full border-[3px] border-white/30 bg-[var(--primary-soft)] grid place-items-center shadow-xl transition-transform active:scale-95"
        >
          {isImage(peerAvatar) ? (
            <img src={peerAvatar as string} alt="" className="size-full object-cover" />
          ) : peerIsGroup ? (
            <Users className="size-6 text-[var(--primary)]" aria-hidden="true" />
          ) : (
            <User className="size-6 text-[var(--primary)]" aria-hidden="true" />
          )}
        </button>

        {/*
            The panel. `flex-1 min-h-0` rather than a set height: it takes exactly
            the space left under the head, so the chat reaches the bottom of the
            screen while the head's strip stays its own. `min-h-0` is what lets the
            message list scroll instead of pushing the composer off the screen --
            without it a flex child refuses to shrink below its content.

            No rounded top and no side borders. Against a strip of the same colour
            they only ever cut notches out of the corners, drawing attention to the
            seam this panel is supposed to stop having.
        */}
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* No avatar here: the head directly above already shows it. Repeating
              the same photo twice, 8px apart, was just noise. */}
          {/*
            The app's primary orange, not a hardcoded blue.

            Blue was tried here as the complement of the orange, which did separate
            this bar from the ride page's orange header directly above it. Reverted:
            the header now follows `--primary` like every other bar in the app, so it
            tracks the brand token and any future theme change instead of drifting
            away from it.
          */}
          <header className="relative flex items-center bg-[var(--primary)] px-4 py-3 text-white">
            {/*
                The name is also the profile.

                There is no peer-profile route to navigate to -- `/rider/profile`
                and its siblings render the *signed-in* user's own page, so linking
                there would show the driver their own profile in the middle of a
                conversation with a passenger. So the photo and name are one
                control that expands a profile card in place instead.

                Rendered in place rather than as a page on purpose: this panel is an
                overlay on a live ride, and navigating would unmount the ride screen
                behind it along with the head that opened the chat.
            */}
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-expanded={profileOpen}
              aria-label={`${peerName}'s profile`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left transition-opacity active:opacity-70"
            >
              <span className="size-9 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] grid place-items-center">
                {isImage(peerAvatar) ? (
                  <img src={peerAvatar as string} alt="" className="size-full object-cover" />
                ) : peerIsGroup ? (
                  <Users className="size-4 text-[var(--primary)]" aria-hidden="true" />
                ) : (
                  <User className="size-4 text-[var(--primary)]" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-bold truncate leading-tight">{peerName}</span>
                <span className="block text-xs text-white/80">
                  {profileOpen ? 'Hide profile' : 'Live chat · view profile'}
                </span>
              </span>
            </button>

            {profileOpen && (
              <div className="absolute left-3 right-3 top-full z-20 mt-1 flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3 text-[var(--ink)] shadow-2xl ring-1 ring-[var(--border)]">
                <span className="size-14 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] grid place-items-center">
                  {isImage(peerAvatar) ? (
                    <img src={peerAvatar as string} alt="" className="size-full object-cover" />
                  ) : peerIsGroup ? (
                    <Users className="size-6 text-[var(--primary)]" aria-hidden="true" />
                  ) : (
                    <User className="size-6 text-[var(--primary)]" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold truncate">{peerName}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {senderRole === 'rider' ? 'Passenger on this ride' : 'Your driver'}
                    {peerIsGroup ? ' · shared ride' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  aria-label="Close profile"
                  className="grid size-8 flex-shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </header>

      <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 bg-[var(--muted)] p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m, i) => {
            const isMine = !!meId && m.sender_id === meId;
            const when = new Date(m.created_at);
            const prev = i > 0 ? new Date(messages[i - 1].created_at) : null;
            const newDay = !prev || prev.toDateString() !== when.toDateString();
            const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            /*
             * The peer's avatar sits beside their messages so a run of them reads as
             * one person talking rather than a column of unrelated bubbles.
             *
             * Only on the last bubble of a run. Repeating the same photo down a
             * five-message run adds five copies of a face saying nothing new, and
             * on a narrow panel the 28px gutter is a real cost. The empty spacer on
             * the earlier bubbles is what keeps the run left-aligned with the one
             * that carries the avatar.
             */
            const next = i + 1 < messages.length ? messages[i + 1] : null;
            const nextIsSameSender =
              !!next && next.sender_id === m.sender_id && new Date(next.created_at).toDateString() === when.toDateString();
            const showAvatar = !isMine && !nextIsSameSender;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[11px] font-bold text-[var(--muted-foreground)]">
                      {dayLabel(when)}
                    </span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <span className="size-7 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] grid place-items-center">
                      {showAvatar ? (
                        isImage(peerAvatar) ? (
                          <img src={peerAvatar as string} alt="" className="size-full object-cover" draggable={false} />
                        ) : peerIsGroup ? (
                          <Users className="size-3.5 text-[var(--primary)]" aria-hidden="true" />
                        ) : (
                          <User className="size-3.5 text-[var(--primary)]" aria-hidden="true" />
                        )
                      ) : null}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRevealedId((c) => (c === m.id ? null : m.id))}
                    aria-expanded={revealedId === m.id}
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-left ${
                      isMine
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)]'
                    }`}
                  >
                    <span className="block text-sm break-words">{m.message}</span>
                  </button>
                </div>
                <div className={`mt-0.5 px-1 text-[10px] font-semibold text-[var(--muted-foreground)] ${isMine ? 'text-right' : ''}`}>
                  {isMine && <span>{m.read ? 'Read' : 'Sent'}</span>}
                  {isMine && revealedId === m.id && <span className="mx-1">·</span>}
                  {revealedId === m.id && <span>{time}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
        {senderRole === 'rider' && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => send(q)}
                className="rounded-full border border-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] active:scale-95 transition-transform"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message..."
            aria-label="Type a message"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!text.trim() || sending}
            aria-label="Send message"
            className="grid size-12 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
          >
            <Send className="size-5" />
          </button>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
