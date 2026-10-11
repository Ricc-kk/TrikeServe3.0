import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { PASSWORD_RULES, passwordRuleFailures } from "@/lib/passwordRules";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Change-password fields, as a self-contained section.
 *
 * Self-contained on purpose. The screen it sits on (customer Edit profile, and
 * the rider/business equivalent) is a form with its own Save and its own
 * unsaved-changes guard -- and a password is not part of that form. Making it a
 * row there would mean the page's "Save changes" claimed to have stored a
 * password it never sent, and the leave-without-saving prompt would fire over
 * half-typed credentials that were never going to be saved by leaving or not.
 * So it saves itself, on its own button, like the profile photo does.
 *
 * The current password is required. `updateUser` needs only a valid session, so
 * without it anyone who picked up an unlocked phone -- or walked up to a logged-
 * in tablet -- could lock the owner out permanently.
 */
export default function ChangePasswordSection() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [reveal, setReveal] = useState({ current: false, next: false, confirm: false });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * Whether the new-password field has focus.
   *
   * Gates the live feedback -- the rule checklist and the "that's your current
   * password" note. Judged on a screen where someone is changing their name and
   * has not touched their password at all, four unmet rules sitting permanently
   * under an untouched field reads as "this form is failing", not as information
   * they asked for. It appears when they go to the field and goes when they
   * leave, so the section looks settled rather than mid-edit at rest.
   */
  const [atNewPassword, setAtNewPassword] = useState(false);

  const unmet = passwordRuleFailures(newPassword);
  const rulesMet = unmet.length === 0;
  const mismatched = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const unchanged = newPassword.length > 0 && newPassword === currentPassword;

  const clear = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const submit = async () => {
    setError(null);
    setDone(false);

    if (!currentPassword) return setError("Enter your current password.");
    if (!newPassword) return setError("Enter a new password.");
    if (!rulesMet) return setError(`Password needs: ${unmet.map((r) => r.toLowerCase()).join(", ")}.`);
    if (newPassword !== confirmPassword) return setError("The two new passwords don't match.");
    if (unchanged) return setError("Your new password must be different from your current one.");

    const email = user?.email;
    if (!email) return setError("Could not read your account email. Please sign in again.");

    setSaving(true);
    try {
      // 1. Prove the current password belongs to the account holder, before
      //    anything is written.
      //
      //    `signInWithPassword` is the only check available without server-side
      //    configuration: `reauthenticate()` exists on the client but is a no-op
      //    unless "Secure password change" is enabled on the Supabase project,
      //    which would leave this looking like it checked something it didn't.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: currentPassword,
      });

      if (verifyError) {
        // Deliberately does not say whether the password or the account was
        // wrong -- that distinction tells a stranger if an address is registered.
        setError("Your current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        console.error("[ChangePasswordSection] update failed:", updateError);
        setError(updateError.message || "Could not change your password. Please try again.");
        return;
      }

      // Wipe the credentials out of component state. There is no reason to keep
      // a new password in memory after it has been stored, and someone backing
      // out of the page should not find it sitting in the fields.
      clear();
      setDone(true);
    } catch (err) {
      console.error("[ChangePasswordSection] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-[var(--surface)] p-5">
      <h2 className="text-sm font-bold tracking-wider text-[var(--muted-foreground)]">Password</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Changing your password does not sign you out of this device.
      </p>

      <div className="space-y-4">
        <Field
          id="current-password"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          shown={reveal.current}
          onToggle={() => setReveal({ ...reveal, current: !reveal.current })}
          onChange={(v) => {
            setCurrentPassword(v);
            setError(null);
            setDone(false);
          }}
        />

        <Field
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          shown={reveal.next}
          onToggle={() => setReveal({ ...reveal, next: !reveal.next })}
          onChange={(v) => {
            setNewPassword(v);
            setError(null);
            setDone(false);
          }}
          onFocus={() => setAtNewPassword(true)}
          onBlur={() => setAtNewPassword(false)}
        />

        <Field
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          shown={reveal.confirm}
          onToggle={() => setReveal({ ...reveal, confirm: !reveal.confirm })}
          onChange={(v) => {
            setConfirmPassword(v);
            setError(null);
            setDone(false);
          }}
          hint={
            mismatched ? (
              <span className="text-[var(--error)]">The two passwords don't match.</span>
            ) : confirmPassword.length > 0 ? (
              <span className="text-[var(--success-ink)]">Passwords match.</span>
            ) : undefined
          }
        />
      </div>

      {/*
        Driven by the same rules the submit guard uses, so the checklist can
        never promise a password that is then rejected -- or accept one it just
        marked as failing.

        The submit error below is deliberately NOT gated this way. It is the
        answer to pressing "Change password", and focus has moved to that button
        by then -- tying its visibility to the field would hide the result of
        the very act that produced it.
      */}
      {atNewPassword && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(newPassword);
            return (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-xs ${
                  met ? "text-[var(--success-ink)]" : "text-[var(--muted-foreground)]"
                }`}
              >
                <span
                  className={`grid size-4 flex-shrink-0 place-items-center rounded-full ${
                    met ? "bg-[var(--success-soft)]" : "bg-[var(--muted)]"
                  }`}
                >
                  <Check
                    className={`size-2.5 ${met ? "text-[var(--success-ink)]" : "text-transparent"}`}
                    aria-hidden="true"
                  />
                </span>
                {rule.label}
              </li>
            );
          })}
        </ul>
      )}

      {atNewPassword && unchanged && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          That's your current password — choose a different one.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-[var(--error)]">
          {error}
        </p>
      )}

      {done && (
        <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--success-ink)]">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Password changed — use it next time you sign in.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 font-bold text-[var(--primary-foreground)] disabled:opacity-50"
      >
        {saving ? (
          <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <>
            <KeyRound className="size-5" aria-hidden="true" />
            Change password
          </>
        )}
      </button>
    </section>
  );
}

/** A password field with a reveal toggle, matching the section's inputs. */
function Field({
  id,
  label,
  autoComplete,
  value,
  shown,
  onToggle,
  onChange,
  onFocus,
  onBlur,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  shown: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-medium tracking-wider text-[var(--muted-foreground)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="min-h-12 w-full rounded-xl border border-line bg-[var(--surface)] px-4 pr-12 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs">{hint}</p>}
    </div>
  );
}