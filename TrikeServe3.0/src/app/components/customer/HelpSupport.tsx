import { useEffect, useState } from "react";
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
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import {
  createDefaultHelpSupportConfig,
  HELP_SUPPORT_SETTING_KEY,
  normalizeHelpSupportConfig,
  type HelpAudience,
} from "../../../lib/helpSupport";

/**
 * Role-specific Help & Support shared by customers, drivers, and businesses.
 * FAQs and public support contacts come from the platform settings, with local
 * defaults available when those settings cannot be read.
 */
interface HelpSupportProps {
  /** Where the back arrow goes. Business Settings reuses this screen. */
  backPath?: string;
  /** The bottom tab bar is the customer's; hide it for other roles. */
  showBottomNav?: boolean;
  /** Override the signed-in role when this screen is shared by a route. */
  audience?: HelpAudience;
}

export default function HelpSupport({
  backPath,
  showBottomNav,
  audience: audienceOverride,
}: HelpSupportProps) {
  const { user } = useAuth();
  const audience = audienceOverride ?? (user?.role === "rider" ? "driver" : user?.role === "business" ? "business" : "customer");
  const resolvedBackPath = backPath ?? (audience === "customer" ? "/customer/account" : audience === "business" ? "/business/account" : "/rider/more-options");
  const shouldShowBottomNav = showBottomNav ?? audience === "customer";
  const [openId, setOpenId] = useState<string | null>(null);
  const [config, setConfig] = useState(createDefaultHelpSupportConfig);
  const goBack = usePreviousPage(resolvedBackPath);

  useEffect(() => {
    let active = true;
    const loadSupportContent = async () => {
      try {
        const { data, error } = await supabase
          .from("admin_settings")
          .select("setting_value")
          .eq("setting_key", HELP_SUPPORT_SETTING_KEY)
          .maybeSingle();
        if (error) throw error;
        if (active) setConfig(normalizeHelpSupportConfig(data?.setting_value));
      } catch (error) {
        // Keep the built-in answers available if saved support content cannot load.
        console.warn("[Help & Support] Using default support content:", error);
      }
    };
    void loadSupportContent();
    return () => { active = false; };
  }, []);

  const faqs = config.faqs[audience];
  const contact = config.contact;
  const phoneHref = contact.phone.trim().replace(/[^\d+]/g, "");

  return (
    <div className={`min-h-screen bg-[var(--background)] ${shouldShowBottomNav ? "pb-24" : "pb-8"}`}>
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
            aria-label="Go back"
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
            {faqs.length > 0 ? faqs.map((faq) => {
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
            }) : (
              <li className="px-4 py-5 text-sm text-[var(--muted-foreground)]">No FAQs are available right now. Contact support below for help.</li>
            )}
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
            {contact.hours ? `Support hours: ${contact.hours}.` : "Still stuck? Reach the support team using the details below."}
          </p>

          <div className="space-y-2">
            {contact.phone.trim() && phoneHref && <a
              href={`tel:${phoneHref}`}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3 hover:bg-[var(--muted)]"
            >
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <Phone className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Call us</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {contact.phone}
                </span>
              </span>
            </a>}

            {contact.email.trim() && <a
              href={`mailto:${contact.email.trim()}?subject=Help%20and%20support%20request`}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3 hover:bg-[var(--muted)]"
            >
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <Mail className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Email us</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  {contact.email}
                </span>
              </span>
            </a>}

            {contact.serviceArea.trim() && <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] px-4 py-3">
              <span className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--success-soft)]">
                <MapPin className="size-5 text-[var(--success-ink)]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--ink)]">Service area</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  {contact.serviceArea}
                </span>
              </span>
            </div>}

            {!contact.phone.trim() && !contact.email.trim() && !contact.serviceArea.trim() && (
              <p className="rounded-2xl border border-line bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">Support contact details are not available right now.</p>
            )}
          </div>
        </section>
      </div>

      {shouldShowBottomNav && <BottomNav active="home" />}
    </div>
  );
}
