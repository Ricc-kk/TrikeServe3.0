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
}

/**
 * The choices on one dish, edited inside the item form.
 *
 * "Choice A" is just the default name -- the field is editable, because a shop
 * calls it "Drinks" or "Choose your side" and a label they cannot change is a
 * label they will not use. New groups are lettered rather than numbered so the
 * list reads the way a menu does.
 */
export default function ItemOptionsEditor({ groups, onChange }: ItemOptionsEditorProps) {
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.price}
                        onChange={(e) =>
                          updateOption(group.id, option.id, {
                            price: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
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