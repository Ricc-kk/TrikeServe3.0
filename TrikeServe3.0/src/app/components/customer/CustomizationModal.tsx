import { useState, useEffect } from "react";
import { X, Plus, Minus } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { ImageWithFallback } from "../figma/ImageWithFallback";

export interface CustomizationOption {
  id: number;
  name: string;
  price: number;
}

export interface CustomizationGroup {
  id: number;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CustomizationOption[];
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  badge?: "most-ordered" | "most-liked" | "signature";
  customizationGroups?: CustomizationGroup[];
}

interface CustomizationModalProps {
  item: MenuItem;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    customizations: any[],
    /** The customer's own words for the kitchen, if they left any. */
    note?: string,
  ) => void;
}

export default function CustomizationModal({
  item,
  isOpen,
  onClose,
  onAddToCart,
}: CustomizationModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [selections, setSelections] = useState<Record<number, number[]>>({});
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      // Cleared with everything else: a note left over from the last dish would
      // be silently attached to this one.
      setNote("");
      setSelections({});
      setValidationErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOptionToggle = (groupId: number, optionId: number, maxSelections: number) => {
    setSelections((prev) => {
      const groupSelections = prev[groupId] || [];
      const isSelected = groupSelections.includes(optionId);

      if (isSelected) {
        // Remove selection
        return {
          ...prev,
          [groupId]: groupSelections.filter((id) => id !== optionId),
        };
      } else {
        // Add selection (respect max selections)
        if (maxSelections === 1) {
          // Radio behavior - replace existing selection
          return { ...prev, [groupId]: [optionId] };
        } else {
          // Checkbox behavior - add if under max
          if (groupSelections.length < maxSelections) {
            return { ...prev, [groupId]: [...groupSelections, optionId] };
          }
        }
      }
      return prev;
    });

    // Clear validation error for this group
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[groupId];
      return newErrors;
    });
  };

  const validateSelections = (): boolean => {
    if (!item.customizationGroups) return true;

    const errors: Record<number, string> = {};
    let isValid = true;

    item.customizationGroups.forEach((group) => {
      const groupSelections = selections[group.id] || [];
      const count = groupSelections.length;

      if (group.required && count < group.minSelections) {
        errors[group.id] = `Please select at least ${group.minSelections} option${group.minSelections > 1 ? 's' : ''}`;
        isValid = false;
      } else if (count < group.minSelections) {
        errors[group.id] = `Please select at least ${group.minSelections} option${group.minSelections > 1 ? 's' : ''}`;
        isValid = false;
      }
    });

    setValidationErrors(errors);
    return isValid;
  };

  const handleAddToCart = () => {
    if (!validateSelections()) {
      return;
    }

    // Build customizations array
    const customizations: any[] = [];
    if (item.customizationGroups) {
      item.customizationGroups.forEach((group) => {
        const groupSelections = selections[group.id] || [];
        groupSelections.forEach((optionId) => {
          const option = group.options.find((opt) => opt.id === optionId);
          if (option) {
            customizations.push({
              groupId: group.id,
              groupName: group.name,
              optionId: option.id,
              optionName: option.name,
              price: option.price,
            });
          }
        });
      });
    }

    onAddToCart(item, quantity, customizations, note.trim() || undefined);
    onClose();
  };

  const calculateTotalPrice = () => {
    let total = item.price;
    if (item.customizationGroups) {
      item.customizationGroups.forEach((group) => {
        const groupSelections = selections[group.id] || [];
        groupSelections.forEach((optionId) => {
          const option = group.options.find((opt) => opt.id === optionId);
          if (option) {
            total += option.price;
          }
        });
      });
    }
    return total * quantity;
  };

  /*
   * A whole page, not a dialog.
   *
   * This was a sheet over a dimmed menu: the backdrop was still there, tapping it
   * closed the sheet, and everything outside was one stray tap from throwing the
   * choices away. It also ran out of room -- the choices, the note and the
   * quantity are three separate things to read and decide on, and cramming them
   * into half a screen with the kitchen menu showing through underneath made it
   * feel like a popup rather than the decision it actually is.
   *
   * So it fills the screen, owns the whole viewport, and leaves only an explicit
   * back button to leave. Nothing behind it to tap by accident.
   */
  return (
    <div className="fixed inset-0 z-[1500] bg-[var(--surface)] flex flex-col">
      {/* Header */}
      <div className="shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to menu"
            title="Back to menu"
            className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--muted)] active:scale-90"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
          <h2 className="min-w-0 truncate text-lg font-extrabold text-[var(--ink)]">
            Customize Your Order
          </h2>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-4 pb-6 space-y-6">
            {/* Item Info */}
            <Card className="p-5 border border-line">
              <div className="flex gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithFallback
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[var(--ink)] text-lg mb-1">{item.name}</h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-2">{item.description}</p>
                  <p className="text-lg font-bold text-[var(--primary)]">
                    <span className="text-base">₱</span>{item.price.toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>

            {/* Customization Groups */}
            {item.customizationGroups && item.customizationGroups.length > 0 ? (
              <div className="space-y-6">
                {item.customizationGroups
                  /*
                   * Groups the shop has switched off are not offered.
                   *
                   * The storefront filters these out already; filtering again here
                   * means a group cannot be forced onto a customer by a stale item
                   * still in cart memory from before it was switched off. `=== false`
                   * rather than a truthiness check, because options saved before the
                   * flag existed have no `enabled` key at all and must still show.
                   */
                  .filter((group) => group.enabled !== false)
                  .map((group) => (
                  <Card key={group.id} className="p-5 border border-line">
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[var(--ink)] text-base">
                          {group.name}
                          {group.required && <span className="text-[var(--primary)] ml-1">*</span>}
                        </h3>
                        <span className="text-xs font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded-full">
                          {group.maxSelections === 1 ? "Pick 1" : `Pick up to ${group.maxSelections}`}
                        </span>
                      </div>
                      {group.minSelections > 0 && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {group.required ? "Required" : `Select at least ${group.minSelections}`}
                        </p>
                      )}
                      {validationErrors[group.id] && (
                        <p className="text-xs text-[var(--primary)] mt-1 font-semibold">
                          {validationErrors[group.id]}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      {group.options.map((option) => {
                        const isSelected = (selections[group.id] || []).includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleOptionToggle(group.id, option.id, group.maxSelections)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                              isSelected
                                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                                : "border-[var(--border)] hover:border-[var(--border)]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Radio/Checkbox Indicator */}
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? "border-[var(--primary)] bg-[var(--primary)]"
                                    : "border-[var(--border)]"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-2 h-2 bg-surface rounded-full" />
                                )}
                              </div>
                              <span className="font-semibold text-[var(--ink)] text-left">
                                {option.name}
                              </span>
                            </div>
                            {option.price > 0 && (
                              <span className="text-sm font-bold text-[var(--primary)]">
                                +<span className="text-xs">₱</span>{option.price.toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 border border-line text-center">
                <p className="text-[var(--muted-foreground)]">No customization options available for this item.</p>
              </Card>
            )}

            {/* Note for the kitchen.

                Sits with the choices rather than at checkout because most of what
                people need to say is about the food itself -- "well done", "no
                onions", "less sweet" -- and asking for it a screen later, once the
                dish is already in the cart, means the customer has to go back and
                find it again.

                Optional, and blank by default: most orders need nothing said, and a
                required box on every dish is friction the shop would rather not
                collect. */}
            <Card className="p-5 border border-line">
              <label
                htmlFor="dish-note"
                className="mb-1 flex items-baseline gap-2 font-bold text-[var(--ink)]"
              >
                Note for the restaurant
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  Optional
                </span>
              </label>
              <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                Anything the kitchen should know about this dish.
              </p>
              <textarea
                id="dish-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                maxLength={200}
                placeholder="e.g. Less sweet, please"
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
              />
            </Card>

            {/* Quantity Selector */}
            <Card className="p-5 border border-line">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--ink)]">Quantity</span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                      quantity <= 1
                        ? "bg-[var(--muted)] text-[var(--border)]"
                        : "bg-[var(--primary)] text-white hover:bg-[var(--primary)]"
                    }`}
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-xl font-bold text-[var(--ink)] w-8 text-center">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    aria-label="Increase quantity"
                    className="w-11 h-11 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary)] flex items-center justify-center transition-all active:scale-90"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </Card>
          </div>
      </div>

      {/*
        Footer, always reachable.

        Pinned to the bottom of the page rather than stuck inside the scrolling
        area, so "Add to Cart" and the running total stay in the same place however
        long the choices are. As a page this is a real footer, not a floating bar
        over a sheet.
      */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <Button
            onClick={handleAddToCart}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold py-4 rounded-2xl text-base flex items-center justify-between"
          >
            <span>Add to Cart</span>
            <span>
              <span className="text-sm">₱</span>{calculateTotalPrice().toFixed(2)}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
