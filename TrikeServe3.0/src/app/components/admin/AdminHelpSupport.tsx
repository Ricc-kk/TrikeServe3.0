import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { Bike, BriefcaseBusiness, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, LoaderCircle, Mail, MapPin, Pencil, Phone, Plus, Save, Trash2, UserRound, type LucideIcon } from "lucide-react";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  createDefaultHelpSupportConfig,
  HELP_SUPPORT_SETTING_KEY,
  normalizeHelpSupportConfig,
  type HelpAudience,
  type HelpFaq,
  type HelpSupportConfig,
} from "../../../lib/helpSupport";
import AdminShell from "./AdminShell";
import AdminPageIntro from "./AdminPageIntro";
import Toast from "../ui/Toast";
import ConfirmationModal from "../ui/confirmation-modal";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

type HelpEditorTab = HelpAudience | "contact";
const FAQ_PAGE_SIZE = 10;

const TABS: { value: HelpEditorTab; label: string; description: string; Icon: LucideIcon }[] = [
  { value: "customer", label: "Customer FAQs", description: "Ride and order help", Icon: UserRound },
  { value: "driver", label: "Driver FAQs", description: "Trips and earnings", Icon: Bike },
  { value: "business", label: "Business FAQs", description: "Store and delivery help", Icon: BriefcaseBusiness },
  { value: "contact", label: "Contact details", description: "Shared support contacts", Icon: CircleHelp },
];

function newFaqId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `faq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminHelpSupport() {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminType === "business_customer";
  const [activeTab, setActiveTab] = useState<HelpEditorTab>("customer");
  const [faqPage, setFaqPage] = useState(1);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [confirmingDeleteFaqId, setConfirmingDeleteFaqId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HelpSupportConfig>(createDefaultHelpSupportConfig);
  const savedSnapshot = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("setting_value")
        .eq("setting_key", HELP_SUPPORT_SETTING_KEY)
        .maybeSingle();

      if (error) throw error;
      const nextDraft = normalizeHelpSupportConfig(data?.setting_value);
      savedSnapshot.current = JSON.stringify(nextDraft);
      setDraft(nextDraft);
    } catch (error) {
      console.error("[Help & Support] Could not load support settings:", error);
      setLoadError("Saved support content could not be loaded. Retry before editing to avoid replacing existing content.");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasIncompleteFaq = Object.values(draft.faqs).some((faqs) =>
    faqs.some((faq) => !faq.question.trim() || !faq.answer.trim()),
  );
  const draftSnapshot = JSON.stringify(draft);
  const hasUnsavedChanges = savedSnapshot.current !== null && draftSnapshot !== savedSnapshot.current;
  const emailIsValid = !draft.contact.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contact.email.trim());
  const canSave = isSuperAdmin && !loading && !loadError && !saving;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const updateFaq = (id: string, patch: Partial<HelpFaq>) => {
    if (activeTab === "contact") return;
    const audience = activeTab;
    setDraft((current) => ({
      ...current,
      faqs: {
        ...current.faqs,
        [audience]: current.faqs[audience].map((faq) => faq.id === id ? { ...faq, ...patch } : faq),
      },
    }));
  };

  const addFaq = () => {
    if (activeTab === "contact") return;
    const audience = activeTab;
    const faq = { id: newFaqId(), question: "", answer: "" };
    setFaqPage(Math.floor(draft.faqs[audience].length / FAQ_PAGE_SIZE) + 1);
    setEditingFaqId(faq.id);
    setConfirmingDeleteFaqId(null);
    setDraft((current) => ({
      ...current,
      faqs: {
        ...current.faqs,
        [audience]: [...current.faqs[audience], faq],
      },
    }));
  };

  const removeFaq = (id: string) => {
    if (activeTab === "contact") return;
    const audience = activeTab;
    setEditingFaqId((current) => current === id ? null : current);
    setConfirmingDeleteFaqId(null);
    setDraft((current) => ({
      ...current,
      faqs: {
        ...current.faqs,
        [audience]: current.faqs[audience].filter((faq) => faq.id !== id),
      },
    }));
  };

  const updateContact = (key: keyof HelpSupportConfig["contact"], value: string) => {
    setDraft((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  };

  const switchTab = (tab: HelpEditorTab) => {
    setActiveTab(tab);
    setFaqPage(1);
    setEditingFaqId(null);
    setConfirmingDeleteFaqId(null);
  };

  const save = async () => {
    if (!isSuperAdmin || !canSave) return;
    if (!emailIsValid) {
      setToast({ message: "Enter a valid support email or leave it blank.", variant: "error" });
      return;
    }
    if (hasIncompleteFaq) {
      setToast({ message: "Complete or remove each FAQ with a blank question or answer.", variant: "error" });
      return;
    }

    setSaving(true);
    const snapshot = JSON.stringify(draft);
    try {
      const { error } = await supabase.from("admin_settings").upsert({
        setting_key: HELP_SUPPORT_SETTING_KEY,
        setting_value: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: "setting_key" });

      if (error) throw error;
      savedSnapshot.current = snapshot;
      setToast({ message: "Help & Support content saved.", variant: "success" });
    } catch (error) {
      console.error("[Help & Support] Could not save support settings:", error);
      setToast({ message: "Could not save Help & Support content. Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <AdminShell title="Help & Support" subtitle="Platform support content">
        <div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-[var(--error)]/20 bg-[var(--error-soft)] p-5 text-sm font-semibold text-[var(--error)]">
          Only the Super Admin can edit Help & Support content.
        </div>
      </AdminShell>
    );
  }

  const activeAudience = activeTab === "contact" ? null : activeTab;
  const activeFaqs = activeAudience ? draft.faqs[activeAudience] : [];
  const faqPendingDelete = activeFaqs.find((faq) => faq.id === confirmingDeleteFaqId) ?? null;
  const pageCount = Math.max(1, Math.ceil(activeFaqs.length / FAQ_PAGE_SIZE));
  const currentPage = Math.min(faqPage, pageCount);
  const firstVisibleFaq = (currentPage - 1) * FAQ_PAGE_SIZE;
  const visibleFaqs = activeFaqs.slice(firstVisibleFaq, firstVisibleFaq + FAQ_PAGE_SIZE);

  return (
    <AdminShell
      title="Help & Support"
      subtitle="Manage FAQs and contact details shown across TrikeServe"
      actions={(
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--success-ink)] px-4 py-2 text-sm font-bold text-[var(--background)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {saving ? "Saving..." : "Save changes"}
        </button>
      )}
    >
      <div className="@container mx-auto w-full max-w-6xl space-y-6">
        <AdminPageIntro
          eyebrow="Platform support"
          title="Help that stays useful."
          description="Edit the answers customers, drivers, and business owners see in their Help & Support screens. Contact details are shared by all three groups."
          onRefresh={() => void load()}
          loading={loading}
          note="Changes appear in the apps after the next screen load."
        />

        <div className="space-y-4">
          <aside>
            <div className="rounded-3xl border border-line bg-card p-3 sm:p-4">
              <div className="px-1 pb-3 sm:px-2">
                <h2 className="mt-1 text-lg font-extrabold text-[var(--ink)]">Help sections</h2>
              </div>
              <label className="block @min-[44rem]:hidden">
                <span className="sr-only">Choose a Help & Support section</span>
                <span className="relative block">
                  <select
                    value={activeTab}
                    onChange={(event) => switchTab(event.target.value as HelpEditorTab)}
                    className="min-h-12 w-full appearance-none rounded-xl border border-line bg-[var(--muted)] px-4 pr-12 text-sm font-bold text-[var(--ink)] outline-none transition-colors focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--teal)]/20"
                  >
                    {TABS.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
                </span>
              </label>
              <div role="tablist" aria-label="Help & Support sections" className="hidden gap-2 @min-[44rem]:grid @min-[44rem]:grid-cols-4">
                {TABS.map((tab) => {
                  const selected = activeTab === tab.value;
                  const count = tab.value === "contact" ? "4" : draft.faqs[tab.value].length;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => switchTab(tab.value)}
                      className={`flex min-h-[4.5rem] min-w-0 items-center gap-2 rounded-2xl border p-2 text-left transition-colors sm:gap-3 sm:p-3 @min-[44rem]:min-h-16 ${
                        selected
                          ? "border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)] shadow-sm"
                          : "border-line bg-card text-[var(--ink)] hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                      }`}
                    >
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-card" : "bg-[var(--muted)]"}`}>
                        <tab.Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold leading-snug sm:text-sm">{tab.label}</span>
                        <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[var(--muted-foreground)] sm:text-[11px]">{tab.description}</span>
                      </span>
                      <span className={`hidden shrink-0 rounded-full px-2 py-1 text-[10px] font-bold sm:inline-flex ${selected ? "bg-card text-[var(--teal)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">

        {loadError && (
          <div role="alert" className="rounded-2xl border border-[var(--error)]/20 bg-[var(--error-soft)] p-4 text-sm text-[var(--error)]">
            {loadError}
          </div>
        )}

        {loading ? (
          <section aria-busy="true" className="rounded-3xl border border-line bg-card p-8 text-center text-sm text-[var(--muted-foreground)]">
            Loading saved support content...
          </section>
        ) : loadError ? null : activeTab === "contact" ? (
          <section aria-labelledby="contact-details-heading" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--teal)]">Shared with every role</p>
                <h2 id="contact-details-heading" className="mt-1 text-xl font-extrabold text-[var(--ink)]">Contact details</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">Shown beneath the FAQs in customer, driver, and business Help & Support.</p>
              </div>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-bold text-[var(--muted-foreground)]">4 shared fields</span>
            </div>

            <div className="grid gap-3 @min-[48rem]:grid-cols-2">
              <label className="block space-y-3 rounded-2xl border border-line bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--ink)]">
                <span className="flex items-center gap-2"><Phone className="size-4 text-[var(--teal)]" aria-hidden="true" />Support phone</span>
                <Input type="tel" value={draft.contact.phone} onChange={(event) => updateContact("phone", event.target.value)} placeholder="e.g. 0917 123 4567" />
              </label>
              <label className="block space-y-3 rounded-2xl border border-line bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--ink)]">
                <span className="flex items-center gap-2"><Mail className="size-4 text-[var(--teal)]" aria-hidden="true" />Support email</span>
                <Input type="email" value={draft.contact.email} onChange={(event) => updateContact("email", event.target.value)} aria-invalid={!emailIsValid} placeholder="e.g. help@trikeserve.app" />
                {!emailIsValid && <span className="block text-xs font-medium text-[var(--error)]">Enter a valid email address or leave the field blank.</span>}
              </label>
              <label className="block space-y-3 rounded-2xl border border-line bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--ink)]">
                <span className="flex items-center gap-2"><MapPin className="size-4 text-[var(--teal)]" aria-hidden="true" />Service area</span>
                <Input value={draft.contact.serviceArea} onChange={(event) => updateContact("serviceArea", event.target.value)} placeholder="e.g. Valenzuela City" />
              </label>
              <label className="block space-y-3 rounded-2xl border border-line bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--ink)]">
                <span className="flex items-center gap-2"><Clock3 className="size-4 text-[var(--teal)]" aria-hidden="true" />Support hours</span>
                <Input value={draft.contact.hours} onChange={(event) => updateContact("hours", event.target.value)} placeholder="e.g. 7:00 AM-10:00 PM, daily" />
              </label>
            </div>
          </section>
        ) : (
          <section aria-labelledby="faq-editor-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-card p-5 sm:p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--teal)]">{activeAudience === "customer" ? "Customer" : activeAudience === "driver" ? "Driver" : "Business"} help</p>
                <h2 id="faq-editor-heading" className="mt-1 text-xl font-extrabold text-[var(--ink)]">Frequently asked questions</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{activeFaqs.length} FAQ{activeFaqs.length === 1 ? "" : "s"} · Shown in this audience's Help & Support screen</p>
              </div>
              <button type="button" onClick={addFaq} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-bold text-[var(--ink)] transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]">
                <Plus className="size-4" aria-hidden="true" />Add FAQ
              </button>
            </div>

            {activeFaqs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-center">
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[var(--teal-soft)] text-[var(--teal)]"><CircleHelp className="size-6" aria-hidden="true" /></span>
                <p className="font-semibold text-[var(--ink)]">No FAQs for this audience yet</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Add a question and answer to show help content here.</p>
              </div>
            ) : (
              <div className="grid gap-3 @min-[64rem]:grid-cols-2">
                {visibleFaqs.map((faq, index) => {
                  const faqNumber = firstVisibleFaq + index + 1;
                  const isEditing = editingFaqId === faq.id;
                  const detailsId = `faq-details-${faq.id}`;

                  return (
                    <article key={faq.id} className={`min-w-0 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-[var(--teal)]/50 sm:p-5 ${isEditing ? "@min-[64rem]:col-span-2" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--teal)]">FAQ {faqNumber}</p>
                        <button
                          type="button"
                          aria-expanded={isEditing}
                          aria-controls={detailsId}
                          onClick={() => {
                            setEditingFaqId(isEditing ? null : faq.id);
                            setConfirmingDeleteFaqId(null);
                          }}
                          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--teal)]/30 bg-[var(--teal-soft)] px-3 text-xs font-bold text-[var(--teal)] transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)] sm:text-sm"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          {isEditing ? "Close details" : "Edit FAQ"}
                        </button>
                      </div>

                      <h3 className="mt-3 break-words text-base font-bold leading-snug text-[var(--ink)]">{faq.question.trim() || "Untitled question"}</h3>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted-foreground)]">
                        {faq.answer.trim() || "No answer yet. Edit this FAQ to add one."}
                      </p>

                      <div id={detailsId} hidden={!isEditing} className="mt-5 border-t border-line pt-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--teal)]">Full details</p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Edit the complete question and answer shown to users.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteFaqId(faq.id)}
                            aria-label={`Remove FAQ ${faqNumber}`}
                            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--error)] hover:bg-[var(--error-soft)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />Remove
                          </button>
                        </div>
                        <div className="grid gap-4 @min-[48rem]:grid-cols-2">
                          <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
                            Question
                            <Input value={faq.question} onChange={(event) => updateFaq(faq.id, { question: event.target.value })} placeholder="Write the question users ask" />
                          </label>
                          <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
                            Answer
                            <Textarea value={faq.answer} onChange={(event) => updateFaq(faq.id, { answer: event.target.value })} rows={4} placeholder="Give a clear, helpful answer" />
                          </label>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {activeFaqs.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Showing {firstVisibleFaq + 1}–{Math.min(firstVisibleFaq + FAQ_PAGE_SIZE, activeFaqs.length)} of {activeFaqs.length} FAQs
                </p>
                {pageCount > 1 && (
                  <nav aria-label="FAQ pagination" className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setFaqPage(currentPage - 1); setEditingFaqId(null); setConfirmingDeleteFaqId(null); }}
                      disabled={currentPage === 1}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />Previous
                    </button>
                    {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => { setFaqPage(page); setEditingFaqId(null); setConfirmingDeleteFaqId(null); }}
                        aria-label={`Page ${page}`}
                        aria-current={currentPage === page ? "page" : undefined}
                        className={`grid size-10 place-items-center rounded-lg border text-sm font-bold transition-colors ${
                          currentPage === page
                            ? "border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)]"
                            : "border-line bg-card text-[var(--ink)] hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setFaqPage(currentPage + 1); setEditingFaqId(null); setConfirmingDeleteFaqId(null); }}
                      disabled={currentPage === pageCount}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next<ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </div>
            )}
          </section>
        )}

        {!loading && !loadError && hasIncompleteFaq && (
          <p role="status" className="text-sm text-[var(--amber-ink)]">Complete or remove FAQ entries with a blank question or answer before saving.</p>
        )}
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={Boolean(faqPendingDelete)}
        onCancel={() => setConfirmingDeleteFaqId(null)}
        onConfirm={() => {
          if (confirmingDeleteFaqId) removeFaq(confirmingDeleteFaqId);
        }}
        title="Delete this FAQ?"
        message={faqPendingDelete?.question.trim()
          ? `“${faqPendingDelete.question.trim()}” will be removed from this draft. Save changes to apply the deletion.`
          : "This FAQ will be removed from the draft. Save changes to apply the deletion."}
        variant="danger"
        confirmLabel="Delete FAQ"
        zIndexClassName="z-[2000]"
      />
      <ConfirmationModal
        isOpen={blocker.state === "blocked"}
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?"
        message="You have unsaved Help & Support changes. Leaving now will discard them."
        variant="warning"
        confirmLabel="Leave without saving"
        zIndexClassName="z-[2000]"
      />
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </AdminShell>
  );
}
