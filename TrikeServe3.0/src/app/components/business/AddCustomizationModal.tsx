import { useState } from "react";
import { X, Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

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

interface AddCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (groups: CustomizationGroup[]) => void;
  existingGroups?: CustomizationGroup[];
}

export default function AddCustomizationModal({
  isOpen,
  onClose,
  onSave,
  existingGroups = [],
}: AddCustomizationModalProps) {
  const [groups, setGroups] = useState<CustomizationGroup[]>(
    existingGroups.length > 0 ? JSON.parse(JSON.stringify(existingGroups)) : []
  );

  if (!isOpen) return null;

  const addGroup = () => {
    const newGroup: CustomizationGroup = {
      id: Date.now(),
      name: "",
      required: false,
      minSelections: 1,
      maxSelections: 1,
      options: [],
    };
    setGroups([...groups, newGroup]);
  };

  const updateGroup = (groupId: number, updates: Partial<CustomizationGroup>) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, ...updates } : group
      )
    );
  };

  const removeGroup = (groupId: number) => {
    setGroups((prev) => prev.filter((group) => group.id !== groupId));
  };

  const addOption = (groupId: number) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            options: [
              ...group.options,
              { id: Date.now(), name: "", price: 0 },
            ],
          };
        }
        return group;
      })
    );
  };

  const updateOption = (
    groupId: number,
    optionId: number,
    updates: Partial<CustomizationOption>
  ) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            options: group.options.map((option) =>
              option.id === optionId ? { ...option, ...updates } : option
            ),
          };
        }
        return group;
      })
    );
  };

  const removeOption = (groupId: number, optionId: number) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            options: group.options.filter((option) => option.id !== optionId),
          };
        }
        return group;
      })
    );
  };

  const handleSave = () => {
    // Validate groups
    const validGroups = groups.filter(
      (group) => group.name.trim() !== "" && group.options.length > 0
    );
    onSave(validGroups);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-3xl sm:rounded-3xl max-h-[90vh] flex flex-col rounded-t-3xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-[#E2E8F0] px-5 py-4 z-10 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#121212]">
              Manage Customizations
            </h2>
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
            {groups.length === 0 ? (
              <Card className="p-8 border-2 border-[#E2E8F0] text-center">
                <p className="text-[#64748B] mb-4">
                  No customization groups added yet. Click "Add Group" to get started.
                </p>
                <Button
                  onClick={addGroup}
                  className="bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold uppercase"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Group
                </Button>
              </Card>
            ) : (
              <>
                {groups.map((group, groupIndex) => (
                  <Card key={group.id} className="p-5 border-2 border-[#E2E8F0]">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-bold text-[#121212]">
                        Group {groupIndex + 1}
                      </h3>
                      <button
                        onClick={() => removeGroup(group.id)}
                        className="p-2 hover:bg-[#FEE2E2] rounded-full transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-[#E11D48]" />
                      </button>
                    </div>

                    {/* Group Name */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-[#121212] mb-2">
                        Group Name
                      </label>
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) =>
                          updateGroup(group.id, { name: e.target.value })
                        }
                        placeholder="e.g. Choose your Drink - Pick 1"
                        className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-xl focus:border-[#E11D48] focus:outline-none"
                      />
                    </div>

                    {/* Group Settings */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#121212] mb-2">
                          Min Selections
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={group.minSelections}
                          onChange={(e) =>
                            updateGroup(group.id, {
                              minSelections: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-xl focus:border-[#E11D48] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#121212] mb-2">
                          Max Selections
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={group.maxSelections}
                          onChange={(e) =>
                            updateGroup(group.id, {
                              maxSelections: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-xl focus:border-[#E11D48] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Required Toggle */}
                    <label className="flex items-center gap-3 mb-4 cursor-pointer">
                      <div
                        onClick={() =>
                          updateGroup(group.id, { required: !group.required })
                        }
                        className={`w-12 h-6 rounded-full transition-colors ${
                          group.required ? "bg-[#E11D48]" : "bg-[#CBD5E1]"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                            group.required
                              ? "translate-x-6 mt-0.5"
                              : "translate-x-0.5 mt-0.5"
                          }`}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#121212]">
                        Required
                      </span>
                    </label>

                    {/* Options */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-[#121212]">
                          Options
                        </label>
                        <button
                          onClick={() => addOption(group.id)}
                          className="text-sm font-bold text-[#E11D48] hover:text-[#BE123C] flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add Option
                        </button>
                      </div>

                      {group.options.length === 0 ? (
                        <p className="text-sm text-[#64748B] text-center py-4">
                          No options added yet
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {group.options.map((option) => (
                            <div
                              key={option.id}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="text"
                                value={option.name}
                                onChange={(e) =>
                                  updateOption(group.id, option.id, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Option name"
                                className="flex-1 px-3 py-2 border-2 border-[#E2E8F0] rounded-xl focus:border-[#E11D48] focus:outline-none text-sm"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-[#64748B]">+₱</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={option.price}
                                  onChange={(e) =>
                                    updateOption(group.id, option.id, {
                                      price: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  placeholder="0"
                                  className="w-20 px-3 py-2 border-2 border-[#E2E8F0] rounded-xl focus:border-[#E11D48] focus:outline-none text-sm"
                                />
                              </div>
                              <button
                                onClick={() => removeOption(group.id, option.id)}
                                className="p-2 hover:bg-[#FEE2E2] rounded-full transition-colors"
                              >
                                <X className="w-4 h-4 text-[#E11D48]" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}

                <Button
                  onClick={addGroup}
                  className="w-full bg-[#F8F9FA] hover:bg-[#E2E8F0] text-[#121212] font-bold uppercase border-2 border-[#E2E8F0]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Group
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t-2 border-[#E2E8F0] px-5 py-4">
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              className="flex-1 bg-white hover:bg-[#F1F5F9] text-[#121212] border-2 border-[#E2E8F0] font-bold uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold uppercase"
            >
              Save Customizations
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
