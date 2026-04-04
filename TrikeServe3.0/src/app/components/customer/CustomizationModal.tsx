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
  onAddToCart: (item: MenuItem, quantity: number, customizations: any[]) => void;
}

export default function CustomizationModal({
  item,
  isOpen,
  onClose,
  onAddToCart,
}: CustomizationModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<number, number[]>>({});
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
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

    onAddToCart(item, quantity, customizations);
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0" 
        onClick={onClose}
      />
      
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-3xl max-h-[90vh] flex flex-col rounded-t-3xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-[#E2E8F0] px-5 py-4 z-10 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#121212]">Customize Your Order</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#F1F5F9] rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-[#121212]" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">
            {/* Item Info */}
            <Card className="p-5 border-2 border-[#E2E8F0]">
              <div className="flex gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithFallback
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#121212] text-lg mb-1">{item.name}</h3>
                  <p className="text-sm text-[#64748B] mb-2">{item.description}</p>
                  <p className="text-lg font-bold text-[#E11D48]">
                    <span className="text-base">₱</span>{item.price.toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>

            {/* Customization Groups */}
            {item.customizationGroups && item.customizationGroups.length > 0 ? (
              <div className="space-y-6">
                {item.customizationGroups.map((group) => (
                  <Card key={group.id} className="p-5 border-2 border-[#E2E8F0]">
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[#121212] text-base">
                          {group.name}
                          {group.required && <span className="text-[#E11D48] ml-1">*</span>}
                        </h3>
                        <span className="text-xs font-semibold text-[#64748B] bg-[#F1F5F9] px-2 py-1 rounded-full">
                          {group.maxSelections === 1 ? "Pick 1" : `Pick up to ${group.maxSelections}`}
                        </span>
                      </div>
                      {group.minSelections > 0 && (
                        <p className="text-xs text-[#64748B]">
                          {group.required ? "Required" : `Select at least ${group.minSelections}`}
                        </p>
                      )}
                      {validationErrors[group.id] && (
                        <p className="text-xs text-[#E11D48] mt-1 font-semibold">
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
                                ? "border-[#E11D48] bg-[#FFF1F2]"
                                : "border-[#E2E8F0] hover:border-[#CBD5E1]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Radio/Checkbox Indicator */}
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? "border-[#E11D48] bg-[#E11D48]"
                                    : "border-[#CBD5E1]"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-2 h-2 bg-white rounded-full" />
                                )}
                              </div>
                              <span className="font-semibold text-[#121212] text-left">
                                {option.name}
                              </span>
                            </div>
                            {option.price > 0 && (
                              <span className="text-sm font-bold text-[#E11D48]">
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
              <Card className="p-8 border-2 border-[#E2E8F0] text-center">
                <p className="text-[#64748B]">No customization options available for this item.</p>
              </Card>
            )}

            {/* Quantity Selector */}
            <Card className="p-5 border-2 border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#121212]">Quantity</span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      quantity <= 1
                        ? "bg-[#F1F5F9] text-[#CBD5E1]"
                        : "bg-[#E11D48] text-white hover:bg-[#BE123C]"
                    }`}
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-xl font-bold text-[#121212] w-8 text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 rounded-full bg-[#E11D48] text-white hover:bg-[#BE123C] flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Footer - Add to Cart Button */}
        <div className="sticky bottom-0 bg-white border-t-2 border-[#E2E8F0] p-5">
          <Button
            onClick={handleAddToCart}
            className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold py-4 rounded-2xl uppercase text-base flex items-center justify-between"
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
