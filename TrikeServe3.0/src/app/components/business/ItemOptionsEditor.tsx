import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";

import {
  defaultGroupName,
  newChoiceGroup,
  type ItemChoiceGroup,
  type ItemOption,
} from "@/lib/itemChoices";

export type { ItemChoiceGroup, ItemOption };

interface ItemOptionsEditorProps {
  groups: ItemChoiceGroup[];
  onChange: (groups: ItemChoiceGroup[]) => void;
  /**
   * True when the database has nowhere to keep these.
   *
   * Shown before the shop types anything, because otherwise they fill the whole
   * thing in, press Save, and are told it worked.
   */
  savingBlocked?: boolean;
}

/**
 * The choices on one dish, edited inside the item form.
 *
 * "Choice A" is just the default name -- the field is editable, because a shop
 * calls it "Drinks" or "Choose your side" and a label they cannot change is a
 * label they will not use. New groups are lettered rather than numbered so the
 * list reads the way a menu does.
 */
export default function ItemOptionsEditor({
  groups,
  onChange,
  savingBlocked = false,
}: ItemOptionsEditorProps) {
  /*
   * What the price boxes are showing right now, for the option being typed in.
   *
   * The stored price is a number and an option with no surcharge is `0`, so a
   * field driven straight off it shows a `0` in every empty box and cannot be
   * emptied: delete the digits and it puts `0` straight back, which reads as the
   * shop having set a price of zero rather than left it blank. Half-typed values
   * are worse -- typing "10." or clearing it to type a new number both fight a
   * controlled numeric input.
   *
   * So the raw text is held here while an option is being edited, and the model
   * keeps the number. The draft is dropped on blur, which is also what normalises
   * "10." into "10" and clears a box the owner emptied and walked away from.
   */
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const draftKey = (groupId: number, optionId: number) => `${groupId}:${optionId}`;

  const priceText = (groupId: number, option: ItemOption) => {
    const key = draftKey(groupId, option.id);
    if (key in priceDrafts) return priceDrafts[key];
    return option.price > 0 ? String(option.price) : "";
  };

  const setPriceDraft = (
    groupId: number,
    optionId: number,
    text: string,
    commit: (price: number) => void,
  ) => {
    setPriceDrafts((prev) => ({ ...prev, [draftKey(groupId, optionId)]: text }));
    // Kept in step with every keystroke so the value is never lost if the owner
    // hits Save without leaving the field. Anything unparseable is no surcharge.
    const parsed = parseFloat(text);
    commit(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  };

  const clearPriceDraft = (groupId: number, optionId: number) =>
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey(groupId, optionId)];
      return next;
    });

  const updateGroup = (groupId: number, updates: Partial<ItemChoiceGroup>) =>
    onChange(groups.map((g) => (g.id === groupId ? { ...g, ...updates } : g)));

  const removeGroup = (groupId: number) => onChange(groups.filter((g) => g.id !== groupId));

  const addOption = (groupId: number) =>
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, options: [...g.options, { id: Date.now(), name: "", price: 0 }] }
          : g,
      ),
    );

  const updateOption = (groupId: number, optionId: number, updates: Partial<ItemOption>) =>
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              options: g.options.map((o) => (o.id === optionId ? { ...o, ...updates } : o)),
            }
          : g,
      ),
    );

  const removeOption = (groupId: number, optionId: number) =>
    onChange(
      groups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g,
      ),
    );

  const addGroup = () => onChange([...groups, newChoiceGroup(groups.length)]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-bold text-[var(--ink)]">Options</label>
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] active:scale-[0.97]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add choice
        </button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        Let the customer pick from a list before they add it &mdash; a drink to go
        with, a size, a flavour. Rename a choice to whatever your shop calls it.
      </p>

      {savingBlocked && (
        <div className="mb-3 rounded-xl border border-[var(--amber)] bg-[var(--amber-soft)] p-3">
          <p className="text-xs font-bold text-[var(--amber-ink)]">
            Choices can&rsquo;t be saved yet
          </p>
          <p className="mt-1 text-xs text-[var(--amber-ink)]">
            The database needs updating before choices can be kept. Run
            ADD_MENU_ITEM_OPTIONS.sql in Supabase. Anything you type here now will
            be lost when you close this page.
          </p>
        </div>
      )}

      {groups.length === 0 ? (
        <button
          type="button"
          onClick={addGroup}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line p-4 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-[0.98]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a choice
        </button>
      ) : (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => (
            <div
              key={group.id}
              className={`rounded-xl border p-3 ${
                group.enabled ? "border-line bg-surface" : "border-line bg-[var(--muted)]"
              }`}
            >
              <div className="flex items-center gap-2">
                {/*
                  The circle check.

                  A real switch, not decoration: it is how a shop switches one
                  choice off without deleting the list. `aria-checked` with
                  `role="switch"` so it announces as on/off rather than as a button
                  that is simply highlighted.
                */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={group.enabled}
                  aria-label={`${group.enabled ? "Hide" : "Show"} ${group.name || "this choice"}`}
                  onClick={() => updateGroup(group.id, { enabled: !group.enabled })}
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90 ${
                    group.enabled
                      ? "border-[var(--success)] bg-[var(--success)] text-white"
                      : "border-[var(--border)] bg-surface text-transparent"
                  }`}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </button>

                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                  placeholder={defaultGroupName(groupIndex)}
                  aria-label="Choice name"
                  className={`min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold focus:border-[var(--primary)] focus:outline-none ${
                    group.enabled ? "text-[var(--ink)]" : "text-[var(--muted-foreground)]"
                  }`}
                />

                <button
                  type="button"
                  onClick={() => removeGroup(group.id)}
                  aria-label={`Remove ${group.name || "choice"}`}
                  title="Remove choice"
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-[var(--error)] transition-colors hover:bg-[var(--error-soft)] active:scale-95"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>

              {/* The options, indented under the choice they belong to. */}
              <div className="mt-2.5 space-y-1.5 pl-8">
                {group.options.map((option, optionIndex) => (
                  <div key={option.id} className="flex items-center gap-2">
                    {/* Hollow circle, matching the radio the customer taps. */}
                    <span
                      aria-hidden="true"
                      className="size-3.5 shrink-0 rounded-full border-2 border-[var(--muted-foreground)]"
                    />
                    <input
                      type="text"
                      value={option.name}
                      onChange={(e) =>
                        updateOption(group.id, option.id, { name: e.target.value })
                      }
                      placeholder="Option name"
                      aria-label={`${group.name || "Option"} option ${optionIndex + 1}`}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-[var(--muted-foreground)]">+&#8369;</span>
                      {/*
                         `type="text"`, not `type="number"`.

                         A number input sanitises anything that is not a complete
                         number as you type: clearing it is fine, but "10." and
                         "-1" are thrown away mid-edit and the box empties itself
                         while the caret is still in it. That is the same "cannot
                         be blank" problem wearing a different hat, and it cannot
                         be fixed from the state layer because the DOM never holds
                         the half-typed value to hand back.

                         `inputMode="decimal"` keeps the numeric keypad on a phone,
                         which is the part that actually mattered here.
                       */}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={priceText(group.id, option)}
                        placeholder="0"
                        onChange={(e) =>
                          setPriceDraft(group.id, option.id, e.target.value, (price) =>
                            updateOption(group.id, option.id, { price }),
                          )
                        }
                        onBlur={() => clearPriceDraft(group.id, option.id)}
                        aria-label={`${option.name || "Option"} extra price`}
                        className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(group.id, option.id)}
                      aria-label={`Remove ${option.name || "option"}`}
                      title="Remove option"
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--error-soft)] hover:text-[var(--error)] active:scale-95"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addOption(group.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-xs font-bold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] active:scale-[0.97]"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add option
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}