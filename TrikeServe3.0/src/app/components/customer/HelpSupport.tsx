import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";

import BottomNav from "../ui/BottomNav";
import { usePreviousPage } from "../../hooks/usePreviousPage";

type Faq = {
  id: string;
  question: string;
  answer: string;
};

const FAQS: Faq[] = [
  {
    id: "delivery-areas",
    question: "Which areas do you deliver to?",
    answer:
      "We deliver across Gen. T. de Leon and the wider Valenzuela area. Riders cover nearby barangays too — if your address is far enough out that no rider accepts, the order will not be confirmed.",
  },
  {
    id: "how-long",
    question: "How long does delivery take?",
    answer:
      "Most orders arrive in 25–35 minutes. During peak hours, or when a restaurant is preparing something made to order, it can take a little longer. You can follow the rider's progress from Activity.",
  },
  {
    id: "payment",
    question: "How do I pay?",
    answer:
      "You can pay cash on delivery. The exact total, including the delivery fee, is shown before you confirm the order.",
  },
  {
    id: "cancel",
    question: "Can I cancel my order?",
    answer:
      "Yes — as long as the restaurant has not started preparing it. Open the order from Activity and use Cancel. Once it is marked as preparing, it can no longer be cancelled.",
  },
  {
    id: "wrong-order",
    question: "My order is wrong or missing an item",
    answer:
      "Open the order from Activity and use Report a problem, or call us below. Include the order number so we can check it with the restaurant straight away. Missing items are refunded.",
  },
  {
    id: "account",
    question: "How do I change my account details?",
    answer:
      "Open Account, then Edit profile. You can change your name and phone number there, and set a profile photo from the camera button on your picture.",
  },
];

/**
 * Help & Support.
 *
 * Everything a customer most often needs answered, in one place reachable from
 * Account. The questions are the ones support actually gets — delivery area,
 * timing, payment, cancelling, a wrong order, account changes — rather than a
 * generic knowledge base.
 */
interface HelpSupportProps {
  /** Where the back arrow goes. Business Settings reuses this screen. */
  backPath?: string;
  /** The bottom tab bar is the customer's; hide it for other roles. */
  showBottomNav?: boolean;
}

export default function HelpSupport({
  backPath = "/customer/account",
  showBottomNav = true,
}: HelpSupportProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const goBack = usePreviousPage(backPath);

  return (
    <div className={`min-h-screen bg-[var(--background)] ${showBottomNav ? "pb-24" : "pb-8"}`}>
      <header className="sticky top-0 z-[900] border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {/*
             A button that pops, not a Link that pushes.

             This was `<Link to={backPath}>`, which *adds* a history entry on the way
             back. That is why Help could not be reversed: pressing back left Help in
             the stack, so pressing back again re-entered it instead of continuing to
             unwind the flow the customer actually took to get here. `backPath` is
             still the fallback, for a cold deep link with no history to pop.
           */}
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to account"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <ArrowLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Help &amp; Support
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-5">
        {/* FAQs */}
        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="mb-3 flex items-center gap-2 text-base font-bold text-[var(--ink)]"
          >
            <CircleHelp className="size-5 text-[var(--success)]" aria-hidden="true" />
            Frequently asked questions
          </h2>

          <ul className="overflow-hidden rounded-2xl border border-line">
            {FAQS.map((faq) => {
              const open = openId === faq.id;
              return (
                <li key={faq.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : faq.id)}
                    aria-expanded={open}
                    aria-controls={`faq-answer-${faq.id}`}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--muted)]"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`size-5 flex-shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${
                        open ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {open && (
                    <p
                      id={`faq-answer-${faq.id}`}
                      className="px-4 pb-4 text-sm leading-relaxed text-[var(--muted-foreground)]"
                    >
                      {faq.answer}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Contact us */}
        <section aria-labelledby="contact-heading">
          <h2
            id="contact-heading"
            className="mb-3 flex items-center gap-2 text-base font-bold text-[var(--ink)]"
          >
            <MessageCircle className="size-5 text-[var(--success)]" aria-hidden="true" />
            Contact us
          </h2>

          <p className="mb-3 text-sm text-[var(--muted-foreground)]">
            Still stuck? Reach a person between 7am and 10pm, every day.
          </p>

          <div className="space-y-2">
            <a
              href="tel:+639171234567"
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3 hover:bg-[var(--muted)]"
            >
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <Phone className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Call us</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  0917 123 4567
                </span>
              </span>
            </a>

            <a
              href="mailto:help@trikeserve.app?subject=Help%20and%20support%20request"
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3 hover:bg-[var(--muted)]"
            >
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <Mail className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Email us</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  help@trikeserve.app
                </span>
              </span>
            </a>

            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3">
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <MapPin className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Service area</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  Gen. T. de Leon, Valenzuela City
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>

      {showBottomNav && <BottomNav active="home" />}
    </div>
  );
}