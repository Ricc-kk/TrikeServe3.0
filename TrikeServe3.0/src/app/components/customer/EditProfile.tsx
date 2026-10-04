import { useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Camera, Check, User } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import { supabase } from "../../../utils/supabase";

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
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !saving && !uploadingPhoto;

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

    setUploadingPhoto(true);
    setError(null);
    try {
      const result = await supabaseHelpers.uploadProfilePhoto(user.id, file);
      const publicUrl = result?.data?.publicUrl;

      if (!publicUrl) {
        setError(uploadErrorMessage(result?.error));
        return;
      }

      // Write the URL straight to the row as well, so a failed profile save
      // later cannot leave the photo half-applied.
      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setSaved(true);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <header className="sticky top-0 z-[900] border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
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

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-5">
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
    </div>
  );
}