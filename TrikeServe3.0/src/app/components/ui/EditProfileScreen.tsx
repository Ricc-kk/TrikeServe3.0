import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { ArrowLeft, Camera, Check, User } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, supabase } from "@/lib/supabase";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import PhotoAdjustModal from "./PhotoAdjustModal";
import BottomNav from "./BottomNav";
import ConfirmationModal from "./confirmation-modal";

type ExtraField = {
  key: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  type?: string;
};

type Props = {
  /** Where the back arrow goes — the role's own account screen. */
  backTo: string;
  /** Section heading above the role's own fields, when it has any. */
  extraHeading?: string;
  extraNote?: string;
  extraFields?: ExtraField[];
  /** Called after the shared fields save, for anything role-specific. */
  onSaveExtra?: () => Promise<string | null>;
  /** BottomNav flavour, so each role keeps its own tab bar. */
  navVariant?: "customer" | "rider" | "business";
};

/**
 * The edit-profile screen every role now uses.
 *
 * Editing is a deliberate task, not a mode you fall into while reading your
 * own details, so it gets its own screen with its own save rather than a
 * toggle hidden in a header corner. Customer had this; driver and business
 * owner edit in place, which meant three different behaviours for the same job.
 *
 * The photo flows through the framing step rather than uploading straight from
 * the file picker — the avatar is a small circle everywhere it appears, so what
 * gets centred here is what survives.
 */
export default function EditProfileScreen({
  backTo,
  extraHeading,
  extraNote,
  extraFields = [],
  onSaveExtra,
  navVariant = "customer",
}: Props) {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const goBack = usePreviousPage(backTo);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  /**
   * The photo has its own saved flag.
   *
   * The photo and the text fields are two separate saves: the photo is framed,
   * uploaded and committed on its own, while the fields wait for the Save
   * button. Sharing one `saved` flag made saving a photo light up "Saved" on the
   * details button — claiming the fields were stored when they had not been
   * touched — and editing a name cleared the photo's confirmation.
   */
  const [photoSaved, setPhotoSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The chosen image, held while it is framed. Null = no modal. */
  const [pendingPhoto, setPendingPhoto] = useState<{ url: string; name: string } | null>(null);

  const canSave = name.trim().length > 0 && !saving;

  /**
   * Unsaved-changes guard.
   *
   * Compares each field against the value it was loaded with, rather than
   * tracking an "edited" flag: typing a character and undoing it returns the
   * field to its original value, and the form is no longer dirty, so leaving is
   * allowed again. A flag set on every keystroke would stay true forever and
   * trap people on a page they had in fact finished with.
   *
   * The photo is excluded on purpose — it saves the moment it is confirmed, so
   * a pending photo is already stored and losing it is not a risk.
   */
  const initialName = useRef(user?.name ?? "");
  const initialPhone = useRef(user?.phone ?? "");
  const initialExtras = useRef(extraFields.map((f) => f.value));

  const hasUnsavedChanges =
    name !== initialName.current ||
    phone !== initialPhone.current ||
    extraFields.some((f, i) => f.value !== initialExtras.current[i]);

  // Blocks in-app navigation only. A reload or tab close is the browser's own
  // prompt, registered below — the two cover different exits.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  // Covers refresh, closing the tab, and back/forward out of the app, which
  // never reach the router's blocker.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is larger than 5MB. Please choose a smaller one.");
      return;
    }

    setPendingPhoto({ url: URL.createObjectURL(file), name: file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Uploads the cropped square the person framed. */
  const uploadCroppedPhoto = async (blob: Blob) => {
    if (!user?.id) return;

    setUploadingPhoto(true);
    setError(null);
    try {
      // JPEG, so the extension the storage path is built from stays valid.
      const file = new File([blob], pendingPhoto?.name || "avatar.jpg", {
        type: "image/jpeg",
      });
      const result = await supabaseHelpers.uploadProfilePhoto(user.id, file);
      const rawUrl = result?.data?.publicUrl;

      if (!rawUrl) {
        setError(uploadErrorMessage(result?.error));
        return;
      }

      // The storage path is always `<uid>/avatar.jpg`, so replacing a photo
      // leaves the URL byte-identical. Storage serves it with
      // `cache-control: public, max-age=3600`, so the browser keeps showing the
      // previous photo for up to an hour — the upload succeeded but nothing on
      // screen changed. A version stamp makes each save a distinct URL, which
      // forces a refetch. The file itself is unchanged; this only busts caches.
      const publicUrl = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

      // Go through updateProfile, not a direct row write. A bare
      // `supabase.from("users").update(...)` persists the URL but leaves
      // AuthContext.user.avatarUrl and the localStorage cache holding the old
      // one, so the header and account screen keep the previous photo and a
      // reload restores the stale value — the edit screen showed the new photo
      // while nothing else did.
      const saved = await updateProfile({ avatarUrl: publicUrl });
      if (!saved.success) {
        setError(saved.error ?? "Could not save your new photo.");
        return;
      }

      setAvatarUrl(publicUrl);

      /*
       * Keep the store logo in step.
       *
       * A business owner's profile photo and their store logo are meant to be the
       * same image, so changing the photo here has to change the logo the shop shows
       * to customers. Without this the two drifted apart permanently: the logo lives
       * in `restaurants.logo_image` and the photo in `users.avatar_url`, with nothing
       * connecting them, and whichever one was set last won for good.

       * Business only -- this screen is shared with customer and rider, who have no
       * restaurant row. Best effort: the photo is already saved and visible, so a
       * failure here must not fail the save or roll the photo back.
       */
      if (navVariant === "business" && user?.id) {
        try {
          await supabase
            .from("restaurants")
            .update({ logo_image: publicUrl, updated_at: new Date().toISOString() })
            .eq("business_user_id", user.id);
        } catch {
          /* Photo is saved. A stale logo is recoverable; losing the photo is not. */
        }
      }

      // Its own flag, not `saved` — the photo does not stand in for the fields.
      setPhotoSaved(true);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Release the object URL only once the upload is done, or the modal would
      // lose its bitmap mid-crop.
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
      setPendingPhoto(null);
    }
  };

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    setError(null);
    try {
      const result = await updateProfile({ name: name.trim(), phone: phone.trim() });
      if (!result.success) {
        setError(result.error ?? "Could not save your details. Please try again.");
        return;
      }
      if (onSaveExtra) {
        const extraError = await onSaveExtra();
        if (extraError) {
          setError(extraError);
          return;
        }
      }

      // Re-baseline to what was just stored, so the guard stops asking about
      // changes that are already saved. Without this the person would be
      // warned about exactly the edits they just confirmed.
      initialName.current = name.trim();
      initialPhone.current = phone.trim();
      initialExtras.current = extraFields.map((f) => f.value);

      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <header className="sticky top-0 z-[900] border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {/*
             A button that pops, not a Link that pushes.

             This screen is shared by customer, rider and business, so the same bug
             was on all three: pressing back *added* `backTo` to the history instead
             of removing the entry behind it. The account screen stayed in the stack,
             so pressing back again walked straight back into the editor rather than
             unwinding the flow the customer took to reach it.

             `backTo` remains the fallback for a cold deep link with no history.
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
            Edit profile
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-5">
        <section className="rounded-2xl border border-line bg-[var(--surface)] p-5">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-[var(--muted-foreground)]">
            Profile photo
          </h2>

          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="size-20 overflow-hidden rounded-full bg-[var(--muted)] border-2 border-line">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center">
                    <User className="size-9 text-[var(--muted-foreground)]" aria-hidden="true" />
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md transition-transform active:scale-95"
              >
                {uploadingPhoto ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ink)]">Choose a photo</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                Drag to reposition before saving. JPG or PNG, up to 5MB.
              </p>
              {/* Confirms the photo itself, so it never reads as the fields
                  being saved. */}
              {photoSaved && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--success-ink)]">
                  <Check className="size-3.5" aria-hidden="true" />
                  Photo saved
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-[var(--surface)] p-5">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-[var(--muted-foreground)]">
            Personal information
          </h2>

          <div className="mb-4">
            <label
              htmlFor="edit-name"
              className="mb-2 block text-xs font-medium tracking-wider text-[var(--muted-foreground)]"
            >
              Name
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              placeholder="Your full name"
              className="min-h-12 w-full rounded-xl border border-line bg-[var(--surface)] px-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="edit-phone"
              className="mb-2 block text-xs font-medium tracking-wider text-[var(--muted-foreground)]"
            >
              Mobile number
            </label>
            <input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setSaved(false);
              }}
              placeholder="09XX XXX XXXX"
              className="min-h-12 w-full rounded-xl border border-line bg-[var(--surface)] px-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Your email cannot be changed here — it is how you sign in and how we
            reach you about your account.
          </p>
        </section>

        {extraFields.length > 0 && (
          <section className="rounded-2xl border border-line bg-[var(--surface)] p-5">
            <h2 className="mb-4 text-sm font-bold tracking-wider text-[var(--muted-foreground)]">
              {extraHeading}
            </h2>
            {extraFields.map((f) => (
              <div key={f.key} className="mb-4 last:mb-0">
                <label
                  htmlFor={`edit-${f.key}`}
                  className="mb-2 block text-xs font-medium tracking-wider text-[var(--muted-foreground)]"
                >
                  {f.label}
                </label>
                <input
                  id={`edit-${f.key}`}
                  type={f.type ?? "text"}
                  value={f.value}
                  onChange={(e) => {
                    f.onChange(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={f.placeholder}
                  className="min-h-12 w-full rounded-xl border border-line bg-[var(--surface)] px-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            ))}
            {extraNote && (
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
                {extraNote}
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--error)]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 font-bold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {saving ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : saved ? (
            <>
              <Check className="size-5" aria-hidden="true" />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>

      <BottomNav active="account" variant={navVariant} />

      {pendingPhoto && (
        <PhotoAdjustModal
          src={pendingPhoto.url}
          busy={uploadingPhoto}
          onCancel={() => {
            URL.revokeObjectURL(pendingPhoto.url);
            setPendingPhoto(null);
          }}
          onConfirm={uploadCroppedPhoto}
        />
      )}

      {/* Above the sticky header (z-900) and the bottom nav, so neither shows
          through behind it. */}
      <ConfirmationModal
        isOpen={blocker.state === "blocked"}
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?"
        message="You have unsaved changes to your profile. If you leave now, they will be lost."
        variant="warning"
        confirmLabel="Discard changes"
        zIndexClassName="z-[1100]"
      />
    </div>
  );
}