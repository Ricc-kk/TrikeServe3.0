import { useState, useEffect, useMemo, useRef } from "react";
import { Store, Package, Clock, User, Plus, Edit2, Image as ImageIcon, X, Search, ChevronRight, Eye, EyeOff, Trash2, Check, BarChart3, Camera, Upload, TrendingUp, Star, Award, Menu, Settings } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BusinessSidebar from "./BusinessSidebar";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import AddCustomizationModal, { CustomizationGroup } from "./AddCustomizationModal";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";

interface Category {
  id: string;
  name: string;
}

/**
 * A named folder on the menu ("For you", "Rice Meals").
 *
 * Sections are a layer above categories: the category still says what a dish
 * is and still drives the customer filter rail, while the section decides where
 * it sits in the order the storefront is read in. Renaming a category used to
 * be the only way to reorder the menu, which meant a shop could not say "these
 * are my recommendations" without losing the people who filtered on that name.
 */
interface MenuSection {
  id: string;
  name: string;
  sortOrder: number;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  sectionId: string | null;
  badge?: string;
  available: boolean;
  customizationGroups?: CustomizationGroup[];
}

export default function BusinessMenu() {
  const { user } = useAuth();
  const profile = useRestaurantProfile();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sections, setSections] = useState<MenuSection[]>([]);
  // Whether menu_items.section_id can be written at all.
  //
  // A ref, not state: the menu is persisted from a useEffect keyed on the items
  // themselves, so depending on this would re-run every save whenever a section
  // load resolved. Before ADD_MENU_SECTIONS.sql has run the column does not
  // exist and PostgREST rejects the whole write with a 400 -- so the column is
  // left out of the payload until the table answers, rather than breaking menu
  // editing for every shop on the day this code ships.
  const sectionsTableExists = useRef(false);
  const [selectedSection, setSelectedSection] = useState("all");
  const [showAddSection, setShowAddSection] = useState(false);
  // When set, the section modal is renaming this one rather than creating a new one.
  const [renamingSection, setRenamingSection] = useState<MenuSection | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [sectionError, setSectionError] = useState("");
  const [showDeleteSectionModal, setShowDeleteSectionModal] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<MenuSection | null>(null);
  // One editor per section, reached from a single button on the section chip.
  // Replaces the inline pencil + X pair, which put two destructive-looking
  // controls a finger-width apart on every chip in a horizontal scroller.
  /*
   * The one place menu maintenance happens.
   *
   * This replaces a per-category editor that hung off a gear on every chip.
   * There were then two places to look for the same jobs — a gear on the chip
   * for renaming and regrouping, a bar that only appeared once items were
   * ticked for availability and deletion — and the second was invisible until
   * you had already selected things. One sheet, always in the same place,
   * holding every job.
   */
  const [showMenuEditor, setShowMenuEditor] = useState(false);
  const [menuEditorNote, setMenuEditorNote] = useState<string | null>(null);

  const [isSavingSection, setIsSavingSection] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<'new' | 'edit'>('new');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState("");
  const [showToggleAvailabilityModal, setShowToggleAvailabilityModal] = useState(false);
  const [itemToToggle, setItemToToggle] = useState<number | null>(null);
  const [showBulkToggleModal, setShowBulkToggleModal] = useState(false);

  // Use media query hook to detect mobile
  const isMobile = useMediaQuery('(max-width: 1023px)');

  const [categories, setCategories] = useState<Category[]>([
    { id: "Silog", name: "Silog Meals" },
    { id: "Chicken", name: "Chicken" },
    { id: "Pork", name: "Pork" },
    { id: "Seafood", name: "Seafood" },
    { id: "Desserts", name: "Desserts" },
    { id: "Drinks", name: "Drinks" }
  ]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Create the shop row through the shared writer.
  //
  // This used to insert a half-built copy carrying only the columns this screen
  // knew about, so a business who opened their menu before their shop settings
  // ended up with a row that had no cuisine and no coordinates -- and because
  // the row then existed, the settings screen's own seeding never ran.
  //
  // The function identity changes every render, so it is read through a ref
  // rather than depended on; depending on it would recreate this effect and
  // re-run the lookup on every render.
  const ensureRestaurantRef = useRef(profile.ensureRestaurant);
  ensureRestaurantRef.current = profile.ensureRestaurant;

  useEffect(() => {
    if (!user?.id || user?.role !== 'business') return;
    let cancelled = false;
    (async () => {
      const created = await ensureRestaurantRef.current();
      if (!cancelled && created) setRestaurantId(created.id);
    })();
    return () => {
      cancelled = true;
    };  }, [user?.id, user?.role]);

  // Load menu items from Supabase
  useEffect(() => {
    const loadMenuItems = async () => {
      if (!restaurantId) {
        // Fallback to localStorage if no restaurant ID yet
        console.log('[Menu Load] No restaurant ID, loading from localStorage');
        if (user?.email) {
          const storageKey = `menuItems_${user.email}`;
          const savedItems = localStorage.getItem(storageKey);
          if (savedItems) {
            try {
              const parsed = JSON.parse(savedItems);
              console.log('[Menu Load] Loaded from localStorage:', parsed.length, 'items');
              setMenuItems(parsed);
            } catch (error) {
              console.error('Error loading menu items from localStorage:', error);
            }
          }
        }
        return;
      }

      try {
        console.log('[Menu Load] Loading from Supabase, restaurantId:', restaurantId);
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantId);

        if (error) {
          console.error('[Menu Load] Data API error:', error);
          console.log('[Menu Load] Falling back to localStorage');
          // Fallback to localStorage
          if (user?.email) {
            const storageKey = `menuItems_${user.email}`;
            const savedItems = localStorage.getItem(storageKey);
            if (savedItems) {
              const parsed = JSON.parse(savedItems);
              console.log('[Menu Load] Loaded from localStorage (fallback):', parsed.length, 'items');
              setMenuItems(parsed);
            }
          }
        } else if (data) {
          console.log('[Menu Load] Loaded from Supabase:', data.length, 'items');
          // Map Supabase data to MenuItem format
          const items = data.map((item: any) => ({
            id: item.id || Math.random(),
            name: item.name,
            description: item.description || '',
            price: item.price,
            image: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            category: item.category,
            sectionId: item.section_id ?? null,
            badge: item.badge || undefined,
            available: item.is_available,
            customizationGroups: item.customization_groups || [],
          }));
          setMenuItems(items);
        }
      } catch (error) {
        console.error('[Menu Load] Critical error fetching menu items:', error);
        console.log('[Menu Load] Falling back to localStorage');
      }
    };

    loadMenuItems();
  }, [restaurantId, user?.email]);

  // Save menu items to both Supabase and localStorage
  useEffect(() => {
    const saveMenuItems = async () => {
      if (!user?.email) return;

      // Always save to localStorage as backup
      const storageKey = `menuItems_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify(menuItems));
      console.log('[Menu Sync] Saved to localStorage:', menuItems.length, 'items');

      // Save to Supabase if restaurant ID exists
      if (!restaurantId) {
        console.log('[Menu Sync] No restaurant ID yet, skipping Supabase save');
        return;
      }

      try {
        // For now, we'll sync items - in production you might want more sophisticated logic
        for (const item of menuItems) {
          if (typeof item.id === 'number') {
            // Local item (not yet in Supabase), insert it
            console.log('[Menu Sync] Inserting new item to Supabase:', item.name);
            const { data: insertedItem, error: insertError } = await supabase
              .from('menu_items')
              .insert([{
                restaurant_id: restaurantId,
                name: item.name,
                description: item.description,
                price: item.price,
                category: item.category,
                ...sectionColumn(item),
                image_url: item.image,
                is_available: item.available,
                badge: item.badge || null,
                created_at: new Date().toISOString(),
              }])
              .select()
              .single();

            if (insertError) {
              console.error('[Menu Sync] Insert error:', insertError);
            } else if (insertedItem) {
              console.log('[Menu Sync] Item inserted successfully with UUID:', insertedItem.id);
              // Update local state with UUID from Supabase
              setMenuItems(prevItems =>
                prevItems.map(i =>
                  i.id === item.id ? { ...i, id: insertedItem.id } : i
                )
              );
            }
          } else if (typeof item.id === 'string') {
            // Already in Supabase, update it
            console.log('[Menu Sync] Updating item in Supabase:', item.name, 'ID:', item.id);
            const { error: updateError } = await supabase
              .from('menu_items')
              .update({
                name: item.name,
                description: item.description,
                price: item.price,
                category: item.category,
                ...sectionColumn(item),
                image_url: item.image,
                is_available: item.available,
                badge: item.badge || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            if (updateError) {
              console.error('[Menu Sync] Update error:', updateError);
            } else {
              console.log('[Menu Sync] Item updated successfully');
            }
          }
        }
        console.log('[Menu Sync] Supabase sync completed successfully');
      } catch (error) {
        console.error('[Menu Sync] Critical error during save:', error);
        console.warn('[Menu Sync] Items still saved to localStorage, no data lost');
        // Items are still saved to localStorage, so user won't lose data
      }
    };

    // Reduced debounce from 1000ms to 300ms for faster saves
    const debounceTimer = setTimeout(saveMenuItems, 300);
    return () => clearTimeout(debounceTimer);
  }, [menuItems, restaurantId, user?.email]);

  // Sync when page visibility changes (tab switch, before unload, etc)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Page is hidden - save immediately before tab switch
        if (user?.email && menuItems.length > 0 && restaurantId) {
          const storageKey = `menuItems_${user.email}`;
          localStorage.setItem(storageKey, JSON.stringify(menuItems));

          // Attempt immediate save to Supabase
          try {
            for (const item of menuItems) {
              if (typeof item.id === 'number') {
                await supabase
                  .from('menu_items')
                  .insert([{
                    restaurant_id: restaurantId,
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    category: item.category,
                    ...sectionColumn(item),
                    image_url: item.image,
                    is_available: item.available,
                    badge: item.badge || null,
                    created_at: new Date().toISOString(),
                  }]);
              } else if (typeof item.id === 'string') {
                await supabase
                  .from('menu_items')
                  .update({
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    category: item.category,
                    ...sectionColumn(item),
                    image_url: item.image,
                    is_available: item.available,
                    badge: item.badge || null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', item.id);
              }
            }
          } catch (error) {
            console.error('Error syncing on tab hide:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also sync before page unload
    const handleBeforeUnload = async () => {
      if (user?.email && menuItems.length > 0) {
        const storageKey = `menuItems_${user.email}`;
        localStorage.setItem(storageKey, JSON.stringify(menuItems));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [menuItems, restaurantId, user?.email]);

  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: "",
    description: "",
    price: 0,
    category: categories.length > 0 ? categories[0].id : "Silog", // Default to first category
    available: true,
    image: ""
  });

  const [priceError, setPriceError] = useState("");
  const [editPriceError, setEditPriceError] = useState("");

  const handleUploadClick = (target: 'new' | 'edit') => {
    setUploadTarget(target);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Enforce the max size advertised in the UI (5MB) and validate it's actually an image
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Maximum size is 5MB.');
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const id = uploadTarget === 'edit' ? String(editingItem?.id ?? Date.now()) : `new-${Date.now()}`;
      const result = await supabaseHelpers.uploadMenuItemImage(id, file);
      if (result?.data?.publicUrl) {
        if (uploadTarget === 'edit') {
          setEditingItem((prev: any) => (prev ? { ...prev, image: result.data.publicUrl } : prev));
        } else {
          setNewItem((prev) => ({ ...prev, image: result.data.publicUrl }));
        }
        console.log('[Menu Image] Uploaded successfully:', result.data.publicUrl);
      } else {
        console.error('[Menu Image] Upload failed:', result?.error);
        alert('Failed to upload image. Please try again.');
      }
    } catch (error) {
      console.error('[Menu Image] Upload error:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    // "all" means every section, including items not filed in one -- hiding
    // them would let food disappear just because nobody got round to filing it.
    const matchesSection = selectedSection === "all" || item.sectionId === selectedSection;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && matchesSection;
  });

  /**
   * The editor list is grouped the way the storefront reads: a heading per
   * section, its dishes underneath. Dishes filed nowhere collect under "More"
   * rather than vanishing, and a shop with no sections still sees one flat list.
   */
  const sectionGroups = useMemo(() => {
    const groups = sections
      .map((section) => ({
        key: section.id,
        title: section.name,
        items: filteredItems.filter((item) => item.sectionId === section.id),
      }))
      .filter((group) => group.items.length > 0);

    const unfiled = filteredItems.filter(
      (item) => !item.sectionId || !sections.some((section) => section.id === item.sectionId),
    );
    if (unfiled.length > 0) {
      groups.push({
        key: "__unfiled",
        title: sections.length > 0 ? "More" : "All items",
        items: unfiled,
      });
    }
    return groups;
  }, [sections, filteredItems]);

  /** The section a dish is filed under, for the card label. */
  const sectionNameFor = (sectionId?: string | null) =>
    sections.find((section) => section.id === sectionId)?.name ||
    (sections.length > 0 ? "Unfiled" : "");

  const toggleAvailability = (id: number) => {
    setItemToToggle(id);
    setShowToggleAvailabilityModal(true);
  };

  const confirmToggleAvailability = () => {
    if (itemToToggle === null) return;

    const item = menuItems.find(i => i.id === itemToToggle);
    const newStatus = item ? !item.available : true;

    setMenuItems(menuItems.map(i =>
      i.id === itemToToggle ? { ...i, available: !i.available } : i
    ));
    setShowToggleAvailabilityModal(false);
    setItemToToggle(null);

    setDeleteSuccessMessage(`"${item?.name || 'Item'}" is now ${newStatus ? 'available' : 'hidden'}.`);
    setShowDeleteSuccess(true);
    setTimeout(() => setShowDeleteSuccess(false), 2500);
  };

  const deleteItem = (id: number | string) => {
    setItemToDelete(id);
    setShowDeleteItemModal(true);
  };

  const confirmDeleteItem = async () => {
    if (itemToDelete === null) return;

    // Delete from Supabase if it's a UUID
    if (typeof itemToDelete === 'string' && restaurantId) {
      try {
        await supabase
          .from('menu_items')
          .delete()
          .eq('id', itemToDelete)
          .eq('restaurant_id', restaurantId);
      } catch (error) {
        console.error('Error deleting from Supabase:', error);
      }
    }

    const deletedItem = menuItems.find(i => i.id === itemToDelete);
    setMenuItems(menuItems.filter(item => item.id !== itemToDelete));
    setShowDeleteItemModal(false);
    setItemToDelete(null);

    setDeleteSuccessMessage(`"${deletedItem?.name || 'Item'}" has been deleted.`);
    setShowDeleteSuccess(true);
    setTimeout(() => setShowDeleteSuccess(false), 2500);
  };

  const duplicateItem = (item: MenuItem) => {
    const newItem = {
      ...item,
      id: Date.now(),
      name: `${item.name} (Copy)`
    };
    setMenuItems([...menuItems, newItem]);
  };

  const handleEditItem = (item: MenuItem) => {
    setEditingItem({ ...item });
    setShowEditItem(true);
  };

  const handleManageCustomizations = (item: MenuItem, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setCustomizingItem(item);
    setShowCustomizationModal(true);
  };

  const handleSaveCustomizations = (groups: CustomizationGroup[]) => {
    if (customizingItem) {
      const updatedItems = menuItems.map((item) =>
        item.id === customizingItem.id
          ? { ...item, customizationGroups: groups }
          : item
      );
      setMenuItems(updatedItems);
    }
  };

  const saveEditedItem = () => {
    if (!editingItem) return;
    if (!editingItem.price || editingItem.price <= 0) {
      setEditPriceError("Price must be greater than zero.");
      return;
    }
    setEditPriceError("");
    setMenuItems(menuItems.map(item =>
      item.id === editingItem.id ? editingItem : item
    ));
    setShowEditItem(false);
    setEditingItem(null);
  };

  const addNewItem = () => {
    if (!newItem.price || newItem.price <= 0) {
      setPriceError("Price must be greater than zero.");
      return;
    }
    setPriceError("");

    const item: MenuItem = {
      id: Date.now(),
      sectionId: newItem.sectionId ?? sections[0]?.id ?? null,
      name: newItem.name || "",
      description: newItem.description || "",
      price: newItem.price || 0,
      category: newItem.category || categories.find(c => c.id !== "All")?.id || "Menu",
      available: newItem.available ?? true,
      image: newItem.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
    };
    setMenuItems([...menuItems, item]);
    setShowAddItem(false);
    setNewItem({
      name: "",
      description: "",
      price: 0,
      category: "Silog",
      available: true,
      image: ""
    });
  };

  const toggleBulkSelection = (id: number) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  /*
   * Per-item jobs for the Edit Menu sheet.
   *
   * These only move local state. The debounced sync effect above watches
   * `menuItems` and writes it to Supabase, so going through state is what
   * keeps one code path for persistence rather than a second, differently-
   * shaped writer next to the first.
   */
  const changeItemCategory = (itemId: number | string, sectionId: string | null) => {
    setMenuItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, sectionId } : item)),
    );
  };

  const toggleItemAvailability = (itemId: number | string) => {
    setMenuItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, available: !item.available } : item)),
    );
  };

  /** Move every item in one category into another, or out of all of them. */
  const moveCategoryItems = (fromId: string, toId: string | null) => {
    setMenuItems((prev) =>
      prev.map((item) => (item.sectionId === fromId ? { ...item, sectionId: toId } : item)),
    );
  };

  /** Delete one item, from the row itself rather than through a modal. */
  const deleteItemDirect = async (itemId: number | string, name: string) => {
    if (typeof itemId === 'string' && restaurantId) {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemId)
        .eq('restaurant_id', restaurantId);
      if (error) {
        setMenuEditorNote(`Could not delete ${name}: ${error.message}`);
        return;
      }
    }
    setMenuItems((prev) => prev.filter((item) => item.id !== itemId));
    setSelectedItems((prev) => prev.filter((id) => id !== itemId));
    setMenuEditorNote(`${name} deleted.`);
  };

  const toggleAllAvailability = () => {
    const allAvailable = menuItems.length > 0 && menuItems.every((i) => i.available);
    setMenuItems((prev) => prev.map((i) => ({ ...i, available: !allAvailable })));
    setMenuEditorNote(allAvailable ? 'All items hidden.' : 'All items available.');
  };

  const bulkToggleAvailability = () => {
    setShowBulkActions(false);
    setShowBulkToggleModal(true);
  };

  const confirmBulkToggleAvailability = () => {
    const count = selectedItems.length;
    // Determine new status based on first selected item
    const firstItem = menuItems.find(i => selectedItems.includes(i.id));
    const newStatus = firstItem ? !firstItem.available : true;

    setMenuItems(menuItems.map(item =>
      selectedItems.includes(item.id) ? { ...item, available: newStatus } : item
    ));
    setSelectedItems([]);
    setShowBulkToggleModal(false);

    setDeleteSuccessMessage(`${count} item${count !== 1 ? 's' : ''} ${newStatus ? 'made available' : 'hidden'}.`);
    setShowDeleteSuccess(true);
    setTimeout(() => setShowDeleteSuccess(false), 2500);
  };

  const bulkDelete = () => {
    setShowBulkActions(false);
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    const count = selectedItems.length;

    // Delete from Supabase
    if (restaurantId) {
      for (const id of selectedItems) {
        if (typeof id === 'string') {
          try {
            await supabase
              .from('menu_items')
              .delete()
              .eq('id', id)
              .eq('restaurant_id', restaurantId);
          } catch (error) {
            console.error('Error deleting item from Supabase:', error);
          }
        }
      }
    }

    setMenuItems(menuItems.filter(item => !selectedItems.includes(item.id)));
    setSelectedItems([]);
    setShowBulkDeleteModal(false);

    setDeleteSuccessMessage(`${count} item${count !== 1 ? 's' : ''} deleted successfully.`);
    setShowDeleteSuccess(true);
    setTimeout(() => setShowDeleteSuccess(false), 2500);
  };

  const pendingOrders = 5;

  const getBadgeColor = (badge?: string) => {
    switch (badge) {
      case "most-ordered": return "bg-[var(--primary)] text-white";
      case "most-liked": return "bg-[var(--info)] text-white";
      case "signature": return "bg-[var(--amber)] text-white";
      default: return "";
    }
  };

  const getBadgeLabel = (badge?: string) => {
    switch (badge) {
      case "most-ordered": return "Most Ordered";
      case "most-liked": return "Most Liked";
      case "signature": return "Signature";
      default: return "";
    }
  };

  const getBadgeIcon = (badge?: string) => {
    switch (badge) {
      case "most-ordered": return <TrendingUp className="w-3 h-3" />;
      case "most-liked": return <Star className="w-3 h-3" />;
      case "signature": return <Award className="w-3 h-3" />;
      default: return null;
    }
  };

  // Load sections from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!restaurantId) {
        sectionsTableExists.current = true;
      setSections([]);
        return;
      }
      const { data, error } = await supabase
        .from('menu_sections')
        .select('id, name, sort_order')
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (error) {
        // A shop that has not run ADD_MENU_SECTIONS.sql yet simply has no
        // sections; the whole screen still works on categories alone.
        console.error('[Sections Load] error:', error);
        sectionsTableExists.current = false;
        setSections([]);
        return;
      }
      setSections(
        (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          sortOrder: row.sort_order ?? 0,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  /**
   * The section column, but only once the table behind it exists.
   *
   * Spreading an empty object is a no-op, so every write path stays a single
   * call and does not have to know whether the migration has been run.
   */
  const sectionColumn = (item: { sectionId?: string | null }) =>
    sectionsTableExists.current ? { section_id: item.sectionId ?? null } : {};

  // Writing through Supabase where possible, local state as the source of
  // truth either way: this screen already has no single backend, and a
  // section that vanishes on a failed write is worse than one that lags.
  const persistSectionOrder = async (next: MenuSection[]) => {
    setSections(next);
    if (!restaurantId) return;
    for (let i = 0; i < next.length; i++) {
      await supabase
        .from('menu_sections')
        .update({ sort_order: i })
        .eq('id', next[i].id);
    }
  };

  /**
 * Opens the one editor a section gets. Seeding the product selection from the
 * items already pointing at this section is what makes the grouping list open
 * showing the truth rather than an empty set the owner has to rebuild.
 */
const openSectionEditor = (section: MenuSection) => {
  setSectionEditor(section);
  setSectionEditorName(section.name);
  setSectionEditorItemIds(
    menuItems.filter((item) => item.sectionId === section.id).map((item) => item.id)
  );
  setSectionEditorError("");
};

const closeSectionEditor = () => {
  setSectionEditor(null);
  setSectionEditorError("");
};

const toggleSectionEditorItem = (id: number) => {
  setSectionEditorItemIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
};

/**
 * Saves the section name and its product grouping together.
 *
 * Grouping is the whole point of the editor: ticking a product here sets its
 * `section_id`, and unticking a product that is in *another* section moves it
 * back out to unassigned rather than silently leaving it where it was.
 */
const saveSectionEditor = async () => {
  const section = sectionEditor;
  if (!section) return;

  const name = sectionEditorName.trim();
  if (!name) {
    setSectionEditorError("Category name is required.");
    return;
  }
  if (sections.some((sec) => sec.id !== section.id && sec.name.toLowerCase() === name.toLowerCase())) {
    setSectionEditorError(`Category "${name}" already exists.`);
    return;
  }

  setIsSavingSection(true);
  setSectionEditorError("");

  try {
    const { error: renameError } = await supabase
      .from('menu_sections')
      .update({ name })
      .eq('id', section.id);
    if (renameError) {
      setSectionEditorError(renameError.message || "Could not rename the category.");
      return;
    }
    setSections((prev) => prev.map((sec) => (sec.id === section.id ? { ...sec, name } : sec)));

    // Only touch the write path when the section column actually exists —
    // menu editing must keep working on a shop that has not run
    // ADD_MENU_SECTIONS.sql yet.
    if (sectionsTableExists.current) {
      const selected = new Set(sectionEditorItemIds);
      const moved = menuItems.filter(
        (item) => (item.sectionId === section.id) !== selected.has(item.id)
      );

      for (const item of moved) {
        const nextSectionId = selected.has(item.id) ? section.id : null;
        const { error: itemError } = await supabase
          .from('menu_items')
          .update({ section_id: nextSectionId })
          .eq('id', item.id as any);
        if (itemError) {
          setSectionEditorError(itemError.message || "Could not update the products in this category.");
          return;
        }
      }

      if (moved.length > 0) {
        setMenuItems((prev) =>
          prev.map((item) => {
            const wasChanged = moved.some((m) => m.id === item.id);
            if (!wasChanged) return item;
            return { ...item, sectionId: selected.has(item.id) ? section.id : null };
          })
        );
      }
    }

    closeSectionEditor();
  } finally {
    setIsSavingSection(false);
  }
};

const addSection = async () => {
  // Renaming goes through the same dialog: the create case is just the one
  // with nothing pre-filled, and two near-identical modals is two places for
  // the validation to drift apart.
    const name = newSectionName.trim();
    if (!name || !restaurantId) return;
    if (renamingSection) {
      if (sections.some((sec) => sec.id !== renamingSection.id && sec.name.toLowerCase() === name.toLowerCase())) {
        setSectionError(`Category "${name}" already exists.`);
        return;
      }
      const { error } = await supabase
        .from('menu_sections')
        .update({ name })
        .eq('id', renamingSection.id);
      if (error) {
        setSectionError(error.message || "Could not rename the category.");
        return;
      }
      setSections(sections.map((sec) => (sec.id === renamingSection.id ? { ...sec, name } : sec)));
      setRenamingSection(null);
      setNewSectionName("");
      setSectionError("");
      setShowAddSection(false);
      return;
    }
    const clash = sections.some((sec) => sec.name.toLowerCase() === name.toLowerCase());
    if (clash) {
      setSectionError(`Category "${name}" already exists.`);
      return;
    }
    const { data, error } = await supabase
      .from('menu_sections')
      .insert([{
        restaurant_id: restaurantId,
        name,
        sort_order: sections.length,
        created_at: new Date().toISOString(),
      }])
      .select('id, name, sort_order')
      .single();
    if (error || !data) {
      setSectionError(error?.message || "Could not create the category.");
      return;
    }
    setSections([...sections, { id: data.id, name: data.name, sortOrder: data.sort_order ?? sections.length }]);
    setNewSectionName("");
    setSectionError("");
    setShowAddSection(false);
  };

  const moveSection = (id: string, delta: number) => {
    const index = sections.findIndex((sec) => sec.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    void persistSectionOrder(next);
  };

  const confirmDeleteSection = async () => {
    const target = sectionToDelete;
    if (!target) return;
    // ON DELETE SET NULL unlinks the dishes rather than taking them with it:
    // deleting a heading must never delete food.
    const { error } = await supabase
      .from('menu_sections')
      .delete()
      .eq('id', target.id);
    if (error) {
      setSectionError(error.message || "Could not delete the category.");
      return;
    }
    const remaining = sections.filter((sec) => sec.id !== target.id);
    setSections(remaining);
    setMenuItems(menuItems.map((item) => (item.sectionId === target.id ? { ...item, sectionId: null } : item)));
    if (selectedSection === target.id) setSelectedSection("all");
    setSectionToDelete(null);
    setShowDeleteSectionModal(false);
  };

  // Load categories from Supabase
  useEffect(() => {
    const loadCategories = async () => {
      try {
        if (restaurantId) {
          // Try to load from Supabase
          const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('restaurant_id', restaurantId);

          if (error) {
            console.error('[Categories Load] Error loading from Supabase:', error);
            // Fall back to localStorage
            if (user?.email) {
              const storageKey = `categories_${user.email}`;
              const saved = localStorage.getItem(storageKey);
              if (saved) {
                try {
                  const parsed = JSON.parse(saved);
                  setCategories(parsed);
                } catch (e) {
                  console.error('Error parsing stored categories:', e);
                }
              }
            }
          } else if (data && data.length > 0) {
            // Map Supabase data to Category format
            const loadedCategories = data.map((cat: any) => ({
              id: cat.id,
              name: cat.name,
            }));
            setCategories(loadedCategories);

            // Also save to localStorage as backup
            if (user?.email) {
              const storageKey = `categories_${user.email}`;
              localStorage.setItem(storageKey, JSON.stringify(loadedCategories));
            }
          }
        } else if (user?.email) {
          // No restaurant ID yet, try localStorage
          const storageKey = `categories_${user.email}`;
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setCategories(parsed);
            } catch (e) {
              console.error('Error parsing stored categories:', e);
            }
          }
        }
      } catch (error) {
        console.error('[Categories Load] Error loading categories:', error);
      }
    };

    loadCategories();
  }, [restaurantId, user?.email]);

  return (
    <div className="min-h-screen bg-[var(--muted)] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 bg-[var(--muted)] w-full min-w-0">
        {/* Header */}
        <div className="bg-surface px-3 lg:px-4 py-3 lg:py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 lg:gap-3 mb-0.5 lg:mb-1">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden flex-shrink-0"
            >
              <Menu className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--ink)]" />
            </button>
            <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[var(--ink)]">Menu</h1>
          </div>
          <p className="text-xs lg:text-sm text-[var(--muted-foreground)] lg:ml-0 ml-7">
            {menuItems.length} items • {menuItems.filter(i => i.available).length} available
          </p>
        </div>

            {/* Search Bar */}
            <div className="bg-surface px-4 pb-3 sticky top-0 z-40 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl text-sm bg-[var(--muted)]"
                />
              </div>
            </div>

            {/* Sections. These replaced the category pills as the organising
                control, so the rail is always rendered — a shop with none yet
                needs the button to create its first one. */}
            <div className="px-3 lg:px-4 py-3 bg-surface border-b border-[var(--border)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Categories
                </p>
                <button
                  type="button"
                  onClick={() => setShowMenuEditor(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--ink-solid)] text-white hover:opacity-90 transition-opacity"
                >
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit Menu
                </button>
                <button
                  onClick={() => { setRenamingSection(null); setNewSectionName(""); setSectionError(""); setShowAddSection(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--primary-soft)] text-[var(--primary)] hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Add Category
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                <button
                  onClick={() => setSelectedSection("all")}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    selectedSection === "all"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
                  }`}
                >
                  All ({menuItems.length})
                </button>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                      selectedSection === section.id
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Item Button */}
            <div className="px-4 py-3">
              <Button
                onClick={() => setShowAddItem(true)}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] py-5 text-sm font-bold rounded-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add New Menu Item
              </Button>
            </div>

            {/* Menu Items - Card Layout */}
            <div className="px-4 pb-6 space-y-6">
              {filteredItems.length > 0 ? (
                sectionGroups.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        {group.title}
                      </h2>
                      <span className="text-[11px] text-[var(--muted-foreground)]">
                        {group.items.length} {group.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    {group.items.map((item) => (
                  <Card 
                    key={item.id} 
                    className={`p-0 overflow-hidden bg-surface border border-[var(--border)] ${selectedItems.includes(item.id) ? 'ring-2 ring-[var(--info)]' : ''}`}
                    onClick={() => handleEditItem(item)}
                  >
                    <div className="p-3 lg:p-4">
                      {/* Top Row: Name, Badge, Price, Time */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5 lg:gap-2 flex-1">
                          {/* Checkbox */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBulkSelection(item.id);
                            }}
                            className={`w-4 h-4 lg:w-5 lg:h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              selectedItems.includes(item.id)
                                ? 'bg-[var(--info)] border-[var(--info)]'
                                : 'border-[var(--border)]'
                            }`}
                          >
                            {selectedItems.includes(item.id) && <Check className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-white" />}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                              <h3 className="font-bold text-[var(--ink)] text-sm lg:text-base">{item.name}</h3>
                              {item.badge && (
                                <Badge className={`${getBadgeColor(item.badge)} text-[9px] lg:text-[10px] px-1.5 lg:px-2 py-0.5`}>
                                  {getBadgeLabel(item.badge)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right ml-2 lg:ml-3">
                          <p className="text-base lg:text-lg font-bold text-[var(--primary)]">₱{item.price}</p>
                        </div>
                      </div>

                      {/* Product Image and Description */}
                      <div className="flex gap-2 lg:gap-3">
                        <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg overflow-hidden flex-shrink-0 ml-5 lg:ml-7">
                          <ImageWithFallback
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs lg:text-sm text-[var(--muted-foreground)] line-clamp-3 mb-2 lg:mb-3">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Status Badge and Customizations */}
                      <div className="flex items-center justify-between mt-2 lg:mt-3 ml-5 lg:ml-7">
                        <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                          {item.available ? (
                            <Badge className="bg-[var(--success)] text-white text-[10px] lg:text-xs px-2 lg:px-3 py-0.5 lg:py-1">
                              Available
                            </Badge>
                          ) : (
                            <Badge className="bg-[var(--muted-foreground)] text-white text-[10px] lg:text-xs px-2 lg:px-3 py-0.5 lg:py-1">
                              Hidden
                            </Badge>
                          )}
                          {sectionNameFor(item.sectionId) && (
                            <span className="text-[10px] lg:text-xs text-[var(--muted-foreground)]">
                              {sectionNameFor(item.sectionId)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-[var(--border)] mx-auto mb-3" />
                  <p className="text-[var(--muted-foreground)] mb-4">No items found</p>
                  <Button
                    onClick={() => setShowAddItem(true)}
                    className="bg-[var(--primary)] hover:bg-[var(--primary)]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </Button>
                </div>
              )}
            </div>

            {/* Bulk Actions FAB */}
            {selectedItems.length > 0 && (
              <div className="fixed bottom-6 right-6 z-50">
                <button
                  onClick={() => setShowBulkActions(true)}
                  className="bg-[var(--info)] text-white rounded-full shadow-2xl px-6 py-4 font-bold text-sm flex items-center gap-2"
                >
                  {selectedItems.length} Selected
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-surface w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-surface border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--ink)]">Add New Item</h2>
                <button onClick={() => { setShowAddItem(false); setPriceError(""); }}>
                  <X className="w-6 h-6 text-[var(--muted-foreground)]" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Item Photo</label>
                  <div className="h-48 rounded-2xl overflow-hidden mb-3 border-2 border-dashed border-[var(--border)] bg-[var(--muted)] flex items-center justify-center">
                    {newItem.image ? (
                      <ImageWithFallback
                        src={newItem.image}
                        alt="Item photo preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="w-12 h-12 text-[var(--border)] mx-auto mb-2" />
                        <p className="text-sm text-[var(--muted-foreground)]">No image selected</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleUploadClick('new')}
                      disabled={uploadingImage}
                      className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                    </Button>
                    {newItem.image && (
                      <Button
                        onClick={() => setNewItem({ ...newItem, image: "" })}
                        variant="outline"
                        className="border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2 text-center">Recommended: 800x800px, max 5MB</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Item Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl font-semibold"
                    placeholder="e.g., Chicken Adobo"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Description</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl min-h-[100px]"
                    placeholder="Describe your dish, ingredients, or what makes it special"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Help customers understand what they're ordering</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Price (₱) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[var(--muted-foreground)]">₱</span>
                    <input
                      type="number"
                      value={newItem.price}
                      onChange={(e) => { setNewItem({ ...newItem, price: parseFloat(e.target.value) }); setPriceError(""); }}
                      className={`w-full p-3 pl-10 border-2 rounded-xl text-xl font-bold ${priceError ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}
                      placeholder="0.00"
                    />
                  </div>
                  {priceError && <p className="text-sm text-[var(--primary)] font-semibold mt-1">{priceError}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-[var(--ink)]">Category</label>
                    <button
                      type="button"
                      onClick={() => { setRenamingSection(null); setNewSectionName(""); setSectionError(""); setShowAddSection(true); }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      New category
                    </button>
                  </div>
                  {/* Sections are the grouping control now. The old category dropdown
                      is gone; dishes keep a stored category behind the scenes so the
                      customer cuisine filter rail is unaffected. */}
                  {sections.length === 0 ? (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      No categories yet. Use "New category" above to group your menu — items stay unfiled until you do.
                    </p>
                  ) : (
                    <select
                      value={newItem.sectionId ?? ""}
                      onChange={(e) => setNewItem({ ...newItem, sectionId: e.target.value || null })}
                      className="w-full p-3 border border-line rounded-xl font-semibold"
                    >
                      <option value="">Unfiled</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center justify-between p-4 bg-[var(--muted)] rounded-xl">
                  <div>
                    <p className="font-bold text-[var(--ink)]">Make available immediately</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Customers can order this item right away</p>
                  </div>
                  <button
                    onClick={() => setNewItem({ ...newItem, available: !newItem.available })}
                    className={`w-14 h-8 rounded-full transition-all ${
                      newItem.available ? "bg-[var(--success)]" : "bg-[var(--border)]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-surface rounded-full shadow-md transition-transform ${
                        newItem.available ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <Button
                  onClick={addNewItem}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] py-6 text-base"
                  disabled={!newItem.name || !newItem.price}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add to Menu
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Item Modal - Similar structure with pre-filled values */}
        {showEditItem && editingItem && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-surface w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-surface border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--ink)]">Edit Item</h2>                <button onClick={() => { setShowEditItem(false); setEditPriceError(""); }}>
                  <X className="w-6 h-6 text-[var(--muted-foreground)]" />
                </button>

              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Item Photo</label>
                  <div className="h-48 rounded-2xl overflow-hidden mb-3 border border-line">
                    <ImageWithFallback
                      src={editingItem.image}
                      alt={editingItem.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleUploadClick('edit')}
                      disabled={uploadingImage}
                      className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingImage ? 'Uploading...' : 'Change Photo'}
                    </Button>
                    <Button
                      onClick={() => setEditingItem({ ...editingItem, image: "" })}
                      variant="outline"
                      className="border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2 text-center">Recommended: 800x800px, max 5MB</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Item Name *</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Description</label>
                  <textarea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl min-h-[100px]"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Price (₱) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[var(--muted-foreground)]">₱</span>
                    <input
                      type="number"
                      value={editingItem.price}
                      onChange={(e) => { setEditingItem({ ...editingItem, price: parseFloat(e.target.value) }); setEditPriceError(""); }}
                      className={`w-full p-3 pl-10 border-2 rounded-xl text-xl font-bold ${editPriceError ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}
                    />
                  </div>
                  {editPriceError && <p className="text-sm text-[var(--primary)] font-semibold mt-1">{editPriceError}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-[var(--ink)]">Category</label>
                    <button
                      type="button"
                      onClick={() => { setRenamingSection(null); setNewSectionName(""); setSectionError(""); setShowAddSection(true); }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      New category
                    </button>
                  </div>
                  {/* Sections are the grouping control now. The old category dropdown
                      is gone; dishes keep a stored category behind the scenes so the
                      customer cuisine filter rail is unaffected. */}
                  {sections.length === 0 ? (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      No categories yet. Use "New category" above to group your menu — items stay unfiled until you do.
                    </p>
                  ) : (
                    <select
                      value={editingItem.sectionId ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, sectionId: e.target.value || null })}
                      className="w-full p-3 border border-line rounded-xl font-semibold"
                    >
                      <option value="">Unfiled</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Badge (Optional)</label>
                  <p className="text-xs text-[var(--muted-foreground)] mb-3">Highlight special items to attract customers</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: undefined })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all ${
                        !editingItem.badge
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "border-[var(--border)] bg-surface text-[var(--muted-foreground)]"
                      }`}
                    >
                      No Badge
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "most-ordered" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "most-ordered"
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "border-[var(--border)] bg-surface text-[var(--muted-foreground)]"
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      Most Ordered
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "most-liked" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "most-liked"
                          ? "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]"
                          : "border-[var(--border)] bg-surface text-[var(--muted-foreground)]"
                      }`}
                    >
                      <Star className="w-4 h-4" />
                      Most Liked
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "signature" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "signature"
                          ? "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]"
                          : "border-[var(--border)] bg-surface text-[var(--muted-foreground)]"
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      Signature
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-[var(--muted)] rounded-xl">
                  <div>
                    <p className="font-bold text-[var(--ink)]">Available to customers</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Toggle visibility on the customer menu</p>
                  </div>
                  <button
                    onClick={() => setEditingItem({ ...editingItem, available: !editingItem.available })}
                    className={`w-14 h-8 rounded-full transition-all ${
                      editingItem.available ? "bg-[var(--success)]" : "bg-[var(--border)]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-surface rounded-full shadow-md transition-transform ${
                        editingItem.available ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <Button
                  onClick={saveEditedItem}
                  className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-6 text-base"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Save Changes
                </Button>

                <Button
                  onClick={() => {
                    setShowEditItem(false);
                    setEditingItem(null);
                    if (editingItem) deleteItem(editingItem.id);
                  }}
                  variant="outline"
                  className="w-full border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-soft)] py-6 text-base"
                >
                  <Trash2 className="w-5 h-5 mr-2" />
                  Delete Item
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input for menu item image uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* Add Category Modal */}
        {showAddSection && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-6 border border-line bg-surface">
              <h3 className="text-lg font-bold text-[var(--ink)] mb-1">
                {renamingSection ? "Rename category" : "New category"}
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Categories are the headings customers see down the menu, in the order you set here.
              </p>
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => { setNewSectionName(e.target.value); setSectionError(""); }}
                placeholder="e.g. For you"
                aria-label="Category name"
                className="w-full px-4 py-3 border border-line rounded-xl text-sm outline-none focus:border-[var(--primary)]"
              />
              {sectionError && <p className="text-sm text-[var(--error)] mt-2">{sectionError}</p>}
              <div className="flex gap-3 mt-5">
                <button onClick={() => { setShowAddSection(false); setRenamingSection(null); setSectionError(""); }} className="flex-1 py-3 text-sm font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl hover:bg-[var(--border)]">
                  Cancel
                </button>
                <button onClick={addSection} className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--primary)] rounded-xl hover:opacity-90">
                  {renamingSection ? "Save" : "Create"}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/*
         * The one menu editor.
         *
         * Everything that used to be scattered across a gear on every category
         * chip, a selection bar that only appeared once you had ticked things,
         * and the add-item form:
         *
         *   - add an item
         *   - delete one item, or every item ticked
         *   - move an item (or a whole category) to a different category
         *   - toggle availability, one item, the ticked ones, or the whole menu
         *   - rename, reorder and delete categories
         *
         * A full-height sheet rather than a dialog: the item list is the thing
         * being worked through, and a dialog sized to a phone screen showed a
         * handful of rows with the rest behind a scroll of their own.
         */}
        {showMenuEditor && (
          <div className="fixed inset-0 z-[2100] flex flex-col bg-surface">
            <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-[var(--border)]">
              <div>
                <h3 className="text-xl font-bold text-[var(--ink)]">Edit Menu</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {menuItems.length} item{menuItems.length !== 1 ? 's' : ''} in {sections.length}
                  {' '}
                  categor{sections.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowMenuEditor(false); setMenuEditorNote(null); }}
                aria-label="Close"
                className="p-1.5 -mr-1.5 rounded-lg hover:bg-[var(--muted)]"
              >
                <X className="w-5 h-5 text-[var(--muted-foreground)]" aria-hidden="true" />
              </button>
            </div>

            {/* Category management */}
            <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Categories
              </p>
              <div className="space-y-2">
                {sections.map((section, at) => (
                  <div key={section.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={section.name}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s) => (s.id === section.id ? { ...s, name: e.target.value } : s)),
                        )
                      }
                      aria-label={`Category name: ${section.name}`}
                      className="flex-1 min-w-0 h-10 rounded-lg border border-line bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]"
                    />
                    <span className="text-xs text-[var(--muted-foreground)] tabular-nums w-10 text-right flex-shrink-0">
                      {menuItems.filter((i) => i.sectionId === section.id).length}
                    </span>
                    {/* Reordering survived the removal of the chip arrows, so a
                        shop can still choose the order its categories appear in. */}
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={at === 0}
                      aria-label={`Move ${section.name} up`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-[var(--muted-foreground)] disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={at === sections.length - 1}
                      aria-label={`Move ${section.name} down`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-[var(--muted-foreground)] disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRenamingSection(section); setNewSectionName(section.name); setSectionError(""); }}
                      aria-label={`Rename ${section.name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-[var(--muted-foreground)]"
                    >
                      <Settings className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSectionToDelete(section); setShowDeleteSectionModal(true); }}
                      aria-label={`Delete ${section.name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-[var(--error)]"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setRenamingSection(null); setNewSectionName(""); setSectionError(""); setShowAddSection(true); }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--primary-soft)] text-[var(--primary)]"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Category
              </button>
            </div>

            {/* Bulk bar. Always visible now, not only once something is ticked:
                the whole-menu actions are here too. */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() =>
                  setSelectedItems(selectedItems.length === menuItems.length ? [] : menuItems.map((i) => i.id))
                }
                className="px-3 py-2 rounded-lg border border-line text-xs font-bold text-[var(--ink)]"
              >
                {selectedItems.length === menuItems.length && menuItems.length > 0 ? 'Clear selection' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedItems.length > 0 ? bulkToggleAvailability() : toggleAllAvailability()
                }
                className="px-3 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-bold"
              >
                {selectedItems.length > 0
                  ? `Toggle ${selectedItems.length} selected`
                  : 'Toggle whole menu'}
              </button>
              <button
                type="button"
                onClick={() => (selectedItems.length > 0 ? bulkDelete() : setShowAddItem(true))}
                className="px-3 py-2 rounded-lg border border-[var(--error)] text-[var(--error)] text-xs font-bold"
              >
                {selectedItems.length > 0 ? `Delete ${selectedItems.length} selected` : 'Add item'}
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {menuItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
                  No items yet. Add one to get started.
                </p>
              ) : (
                menuItems.map((item) => {
                  const selected = selectedItems.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 ${selected ? 'border-[var(--info)] ring-2 ring-[var(--info)]' : 'border-line'}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleBulkSelection(item.id)}
                          aria-label={`Select ${item.name}`}
                          aria-pressed={selected}
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            selected ? 'bg-[var(--info)] border-[var(--info)]' : 'border-[var(--border)]'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-bold text-[var(--ink)] text-sm truncate">{item.name}</p>
                            <p className="text-sm font-bold text-[var(--primary)] flex-shrink-0">₱{item.price}</p>
                          </div>

                          {/* Category as a select, so moving an item is one tap
                              here rather than a trip through a category editor. */}
                          <select
                            value={item.sectionId ?? ''}
                            onChange={(e) => changeItemCategory(item.id, e.target.value || null)}
                            aria-label={`Category for ${item.name}`}
                            className="mt-2 w-full h-9 rounded-lg border border-line bg-[var(--surface)] px-2 text-xs font-semibold outline-none focus:border-[var(--primary)]"
                          >
                            <option value="">Unfiled</option>
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleItemAvailability(item.id)}
                            aria-label={`${item.available ? 'Hide' : 'Show'} ${item.name}`}
                            className={`grid size-9 place-items-center rounded-lg border ${
                              item.available
                                ? 'border-[var(--success)] text-[var(--success)]'
                                : 'border-[var(--border)] text-[var(--muted-foreground)]'
                            }`}
                          >
                            {item.available ? (
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <EyeOff className="w-4 h-4" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditItem(item)}
                            aria-label={`Edit ${item.name}`}
                            className="grid size-9 place-items-center rounded-lg border border-line text-[var(--muted-foreground)]"
                          >
                            <Edit2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItemDirect(item.id, item.name)}
                            aria-label={`Delete ${item.name}`}
                            className="grid size-9 place-items-center rounded-lg border border-line text-[var(--error)]"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {menuEditorNote && (
              <p role="status" className="px-4 py-2 border-t border-[var(--border)] bg-[var(--muted)] text-xs font-semibold text-[var(--ink)]">
                {menuEditorNote}
              </p>
            )}

            <div className="px-4 py-3 border-t border-[var(--border)]">
              <Button
                onClick={() => setShowAddItem(true)}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] py-4 text-sm font-bold rounded-xl"
              >
                <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
                Add New Menu Item
              </Button>
            </div>
          </div>
        )}
        {showDeleteSectionModal && sectionToDelete && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-6 border border-line bg-surface text-center">
              <Trash2 className="w-10 h-10 text-[var(--error)] mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-lg font-bold text-[var(--ink)]">Delete &quot;{sectionToDelete.name}&quot;? — its products will become unfiled</h3>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                The dishes inside stay on your menu and move to the unfiled group. Only the heading is removed.
              </p>
              <div className="flex gap-3 mt-5">
                <button onClick={() => { setSectionToDelete(null); setShowDeleteSectionModal(false); }} className="flex-1 py-3 text-sm font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl hover:bg-[var(--border)]">
                  Cancel
                </button>
                <button onClick={confirmDeleteSection} className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--error)] rounded-xl hover:opacity-90">
                  Delete
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Actions Modal */}
        {showBulkActions && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-surface w-full rounded-t-3xl p-5">
              <h3 className="text-xl font-bold text-[var(--ink)] mb-4">
                Bulk Actions ({selectedItems.length} items)
              </h3>
              <div className="space-y-2">
                <Button
                  onClick={bulkToggleAvailability}
                  className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-4"
                >
                  Toggle Availability
                </Button>
                <Button
                  onClick={bulkDelete}
                  variant="outline"
                  className="w-full border-[var(--primary)] text-[var(--primary)] py-4"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
                <Button
                  onClick={() => {
                    setSelectedItems([]);
                    setShowBulkActions(false);
                  }}
                  variant="outline"
                  className="w-full py-4"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Customization Modal */}
        {customizingItem && (
          <AddCustomizationModal
            isOpen={showCustomizationModal}
            onClose={() => {
              setShowCustomizationModal(false);
              setCustomizingItem(null);
            }}
            onSave={handleSaveCustomizations}
            existingGroups={customizingItem.customizationGroups}
          />
        )}

        {/* Delete Item Confirmation Modal */}
        {showDeleteItemModal && itemToDelete !== null && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-surface p-6 max-w-md w-full rounded-2xl shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-[var(--error-soft)] rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-[var(--primary)]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
                Delete Item?
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] text-center mb-6">
                {`"${menuItems.find(i => i.id === itemToDelete)?.name || 'This item'}" will be permanently removed. This action cannot be undone.`}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowDeleteItemModal(false);
                    setItemToDelete(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeleteItem}
                  className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold"
                >
                  Delete
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteModal && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-surface p-6 max-w-md w-full rounded-2xl shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-[var(--error-soft)] rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-[var(--primary)]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
                Delete {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''}?
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] text-center mb-6">
                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} will be permanently removed. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowBulkDeleteModal(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmBulkDelete}
                  className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold"
                >
                  Delete All
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Toggle Availability Confirmation Modal */}
        {showToggleAvailabilityModal && itemToToggle !== null && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-surface p-6 max-w-md w-full rounded-2xl shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-[var(--amber-soft)] rounded-full flex items-center justify-center">
                  <Eye className="w-6 h-6 text-[var(--amber)]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
                {menuItems.find(i => i.id === itemToToggle)?.available ? 'Hide Item?' : 'Make Item Available?'}
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] text-center mb-6">
                {menuItems.find(i => i.id === itemToToggle)?.available
                  ? `"${menuItems.find(i => i.id === itemToToggle)?.name}" will be hidden from customers.`
                  : `"${menuItems.find(i => i.id === itemToToggle)?.name}" will be visible to customers.`
                }
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowToggleAvailabilityModal(false);
                    setItemToToggle(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmToggleAvailability}
                  className="flex-1 bg-[var(--amber)] hover:bg-[var(--amber)] text-white font-bold"
                >
                  {menuItems.find(i => i.id === itemToToggle)?.available ? 'Hide' : 'Make Available'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Toggle Availability Confirmation Modal */}
        {showBulkToggleModal && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-surface p-6 max-w-md w-full rounded-2xl shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-[var(--amber-soft)] rounded-full flex items-center justify-center">
                  <Eye className="w-6 h-6 text-[var(--amber)]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
                Toggle Availability?
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] text-center mb-6">
                {(() => {
                  const firstItem = menuItems.find(i => selectedItems.includes(i.id));
                  const newStatus = firstItem ? !firstItem.available : true;
                  return `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} will be ${newStatus ? 'made available' : 'hidden'} from customers.`;
                })()}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowBulkToggleModal(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmBulkToggleAvailability}
                  className="flex-1 bg-[var(--amber)] hover:bg-[var(--amber)] text-white font-bold"
                >
                  Confirm
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Delete Success Toast */}
        {showDeleteSuccess && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[3000] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-[var(--success)] text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold">{deleteSuccessMessage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}