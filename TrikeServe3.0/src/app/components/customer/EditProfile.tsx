import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";
import { ArrowLeft, Camera, Check, User } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import PhotoAdjustModal from "../ui/PhotoAdjustModal";
import ConfirmationModal from "../ui/confirmation-modal";
import ChangePasswordSection from "../ui/ChangePasswordSection";

import BottomNav from "../ui/BottomNav";

/**
 * Edit profile.
 *
 * This was an inline edit mode on the account screen: every field sat
 * `readOnly` until a small pill in the header corner toggled them, then a
 * confirmation dialog stood between the customer and saving. Editing is a
 * deliberate task, not a mode you fall into while reading your own details, so
 * it gets its own screen with its own save.
 */
export default function EditProfile() {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  /** The chosen image, held while the customer frames it. Null = no modal. */
  const [pendingPhoto, setPendingPhoto] = useState<{ url: string; name: string; type: string } | null>(
    null
  );

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

  const hasUnsavedChanges = name !== initialName.current || phone !== initialPhone.current;

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

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    // Hand off to the framing step instead of uploading straight away. The
    // avatar is a small circle everywhere it appears, so what gets centred here
    // is what survives.
    setPendingPhoto({
      url: URL.createObjectURL(file),
      name: file.name,
      type: file.type || "image/jpeg",
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Uploads the cropped square the customer framed. */
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
      // reload restores the stale value.
      const saved = await updateProfile({ avatarUrl: publicUrl });
      if (!saved.success) {
        setError(saved.error ?? "Could not save your new photo.");
        return;
      }

      setAvatarUrl(publicUrl);
      // Its own flag, not `saved` — the photo does not stand in for the fields.
      setPhotoSaved(true);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Release the object URL only once the upload is done, or the modal
      // would lose its bitmap mid-crop.
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

      // Re-baseline to what was just stored, so the guard stops asking about
      // changes that are already saved.
      initialName.current = name.trim();
      initialPhone.current = phone.trim();

      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <header className="sticky top-0 z-[900] border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="flex w-full items-center gap-2">
          <Link
            to="/customer/account"
            aria-label="Back to account"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <ArrowLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Edit profile
          </h1>
        </div>
      </header>

      <div className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Photo — the camera sits with the photo, which is the only reason it
            is ever needed. */}
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
                JPG or PNG, up to 5MB.
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

        {/* Details */}
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

        {/*
          Password sits after the details but ahead of Save changes, and is
          deliberately not part of that form: it saves on its own button, so the
          page's "Save changes" never claims to have stored a password, and the
          leave-without-saving prompt never fires over credentials that leaving
          was never going to store either way. The same reasoning that keeps the
          photo out of `hasUnsavedChanges`.
        */}
        <ChangePasswordSection />

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

      <BottomNav active="account" />

      {/* Framing step. Opens as soon as a photo is picked and only closes once
          the upload finishes or the customer backs out, so nothing is sent
          before they have seen what they are sending. */}
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
