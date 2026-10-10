import { useState, useEffect, useMemo, useRef } from "react";
import { Store, Package, Clock, User, Plus, Edit2, Image as ImageIcon, X, Search, ChevronRight, Eye, EyeOff, Trash2, Check, BarChart3, Camera, Upload, TrendingUp, Star, Award, Menu, Settings, Save, AlertTriangle } from "lucide-react";
import { Link, useBlocker } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BusinessSidebar from "./BusinessSidebar";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import ItemOptionsEditor from "./ItemOptionsEditor";
import {
  parseChoiceGroups,
  usableChoiceGroups,
  type ItemChoiceGroup,
} from "@/lib/itemChoices";
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
  /** Position in the menu. Written by dragging; read on every load. */
  sortOrder: number;
  /** Choice options ("Choice A: Iced Tea / Coke"). See `ItemOptionsEditor`. */
  customizationGroups?: ItemChoiceGroup[];
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
  // Whether menu_items.customization_groups can be written at all.
  //
  // Same reason as the sections probe: before ADD_MENU_ITEM_OPTIONS.sql has run the
  // column does not exist and PostgREST rejects the whole insert with a 400, which
  // would take menu editing down for every shop on the day this ships. Probed once
  // on the first menu load, which already selects the column.
  const optionsColumnExists = useRef(true);
  /*
   * Set when the menu holds options that cannot be written.
   *
   * Without ADD_MENU_ITEM_OPTIONS.sql the column does not exist, so options are
   * left out of the write rather than failing the whole menu. That trade is right
   * for the rest of the menu and terrible for the options: the shop fills in the
   * choices, presses Save, sees "Saved", and the choices are gone -- they were only
   * ever in the page. It then reads as though signing out threw them away, because
   * they survive until the page is reloaded and not one moment longer.
   *
   * So this says so plainly, and names the file to run.
   */
  const [optionsNotSaved, setOptionsNotSaved] = useState(false);
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
  /**
   * Which of the sheet's two entry points is open.
   *
   * `null` is the resting state — both entry buttons visible, nothing expanded.
   * The sheet opens straight into the flow rather than dropping the owner into a
   * wall of controls, so "what do I do here" is the first question the layout
   * answers.
   */

  const [isSavingSection, setIsSavingSection] = useState(false);
  /** Category rename/reorder/delete dialog. Kept beside the filter, not in it. */

  /** Which category name is currently being typed into, if any. */
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);

  /**
   * The name being typed, held separately from the category itself.
   *
   * Writing straight into `sections` on every keystroke made Escape a lie: the
   * field closed and looked abandoned, but the name had already changed — and a
   * rename is saved, so a "cancelled" edit would come back as a silent
   * miscategorisation of every dish in it. Now the field holds a draft and the
   * category is only touched on Enter or blur.
   */
  const [sectionNameDraft, setSectionNameDraft] = useState("");

  const startRenamingSection = (sectionId: string, name: string) => {
    setRenamingSectionId(sectionId);
    setSectionNameDraft(name);
  };

  /**
   * Commit a rename, to the database as well as to state.
   *
   * `setSections` on its own is local-only — the dialog's rename writes a row,
   * and this one did not, so the name changed on screen and reverted on the next
   * load. The same three guards apply: empty is refused, a duplicate is refused,
   * and a failed write leaves the old name rather than pretending.
   */
  const commitSectionName = async () => {
    if (renamingSectionId == null) return;
    const id = renamingSectionId;
    const name = sectionNameDraft.trim();

    setRenamingSectionId(null);

    const current = sections.find((s) => s.id === id);
    if (!name || !current || name === current.name) return;

    if (
      sections.some(
        (s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setSectionError(`A category called "${name}" already exists.`);
      return;
    }

    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));

    if (!restaurantId) return;

    const { error } = await supabase
      .from('menu_sections')
      .update({ name })
      .eq('id', id);

    if (error) {
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name: current.name } : s)),
      );
      setSectionError(error.message || "Could not rename the category.");
    }
  };

  const cancelRenamingSection = () => setRenamingSectionId(null);

  /*
   * The item form, and the card it is open on.
   *
   * One form, two jobs. There used to be three separate editing surfaces — an
   * Edit Menu sheet, an "Add New Item" modal and an "Edit Item" modal — each
   * with its own copy of the same fields, its own save path and its own idea of
   * which item it was working on. Two of those copies were reachable from the
   * same card, which is how "my change did not save" happens.
   *
   * Now the card *is* the form: `expandedId` says which one is open and
   * `editingItem` is whatever that card is holding. Adding preps a blank card
   * at the top of the list and opens it the same way.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<'edit' | 'add'>('edit');
  const [editingItem, setEditingItem] = useState<any>(null);
  /*
   * The open dish as it was when the form opened.
   *
   * `editingItem` is the working copy, so "has this been changed" cannot be read
   * off it -- there is nothing in it that says what it started as. Closing used to
   * throw the working copy away unconditionally, which silently discarded a typed
   * name, a new photo and a set of options with no warning: the dish went back to
   * exactly what was saved and there was nothing on screen to say why.
   *
   * Held separately so closing can ask before discarding.
   */
  const [editSnapshot, setEditSnapshot] = useState("");
  /** Set when the owner tries to close a dish they have changed. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | string | null>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState("");
  const [showToggleAvailabilityModal, setShowToggleAvailabilityModal] = useState(false);
  const [itemToToggle, setItemToToggle] = useState<number | null>(null);

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
              setSavedSnapshot(snapshotOf(parsed));
            } catch (error) {
              console.error('Error loading menu items from localStorage:', error);
            }
          }
        }
        return;
      }

      try {
        console.log('[Menu Load] Loading from Supabase, restaurantId:', restaurantId);
        /*
         * The menu has an order the shop set by dragging, so it has to be asked for.
         *
         * Two attempts, because ordering by a column that does not exist fails the
         * whole query with a 400 — which, before ADD_MENU_ITEM_SORT_ORDER.sql has
         * been run, would have taken the entire menu down rather than just its
         * ordering. The retry drops the ORDER BY and the rows come back in whatever
         * order Postgres prefers, which is the behaviour from before dragging
         * existed.
         */
        let result = await supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (result.error) {
          console.warn(
            '[Menu Load] Ordered read failed, retrying without an order:',
            result.error.message,
          );
          result = await supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: true });
        }

        const { data, error } = result;

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
              setSavedSnapshot(snapshotOf(parsed));
            }
          }
        } else if (data) {
          console.log('[Menu Load] Loaded from Supabase:', data.length, 'items');

          /*
           * Whether the choices column is there at all.
           *
           * Read off the first row rather than probed separately: the load already
           * selects it, so its absence is the signal, and a column that does not
           * exist simply is not a key on the object. Decided once here because
           * getting it wrong costs the whole menu -- writing a column PostgREST does
           * not recognise fails every row, not just the ones with options.
           */
          if (data.length > 0 && !( 'customization_groups' in data[0])) {
            if (optionsColumnExists.current) {
              console.warn(
                '[Menu Load] menu_items.customization_groups is missing. ' +
                'Run ADD_MENU_ITEM_OPTIONS.sql in Supabase to save item options.',
              );
            }
            optionsColumnExists.current = false;
          }

          // Map Supabase data to MenuItem format
          const items = data.map((item: any, at: number) => ({
            id: item.id || Math.random(),
            name: item.name,
            description: item.description || '',
            price: item.price,
            image: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            category: item.category,
            sectionId: item.section_id ?? null,
            badge: item.badge || undefined,
            available: item.is_available,
            // `at` rather than the column, so a shop whose database has not run
            // ADD_MENU_ITEM_SORT_ORDER.sql yet still gets a stable, saveable order
            // instead of every row sitting on the same number.
            sortOrder: Number.isFinite(item.sort_order) ? item.sort_order : at,
            /*
             * JSONB arrives already parsed, but the localStorage fallback below
             * re-reads a stringified snapshot, and PostgREST hands back a JSON string
             * for json/jsonb when it is nested inside a row. Anything that is not an
             * array of groups is treated as "no options" rather than left to throw
             * on `.map` three edits later.
             */
            customizationGroups: parseChoiceGroups(item.customization_groups),
          }));
          setMenuItems(items);
          // A freshly loaded menu is the saved menu, by definition.
          setSavedSnapshot(snapshotOf(items));
        }
      } catch (error) {
        console.error('[Menu Load] Critical error fetching menu items:', error);
        console.log('[Menu Load] Falling back to localStorage');
      }
    };

    loadMenuItems();
  }, [restaurantId, user?.email]);


  const [editPriceError, setEditPriceError] = useState("");

  /*
   * Saving is now something the owner does, not something that happens to them.
   *
   * Every change used to be written to Supabase 300ms after it was made. That is
   * the right default for a form you are filling in and the wrong one for a menu:
   * toggling three dishes and walking away leaves a half-finished menu live for
   * customers, with no point at which any of it was deliberate.
   *
   * So the write moved behind a button. `savedSnapshot` is what was last written;
   * anything that differs from it is unsaved work.
   */
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** A stable string for a menu, holding only the fields that get written. */
  const snapshotOf = (items: MenuItem[]) =>
    JSON.stringify(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        image: item.image,
        sectionId: item.sectionId ?? null,
        badge: item.badge ?? null,
        available: item.available,
        sortOrder: item.sortOrder ?? 0,
        /*
         * Choices, and only the ones that would actually be stored.
         *
         * This is the snapshot the unsaved-changes check compares against, so a
         * field left out of it is a field the shop can change with no sign the menu
         * is dirty: no Save prompt, no blocked navigation, and the edit lost on the
         * next refresh. It compares the *stored* form rather than the raw groups so
         * that typing into an empty option row -- which is not saved and should not
         * count -- does not light up the "unsaved" state on its own.
         */
        customizationGroups: usableChoiceGroups(item.customizationGroups ?? []),
      })),
    );

  /**
 * What counts as "the dish you are editing has been changed".
 *
 * Compares the fields the form can actually edit, so opening a dish and closing it
 * again is not reported as a change. `id` is deliberately excluded: a new dish has
 * a temporary one and a saved one has a real one, and that difference is not
 * something the owner did.
 *
 * Options go through `usableChoiceGroups` for the same reason the save does -- a
 * half-typed option row is dropped rather than stored, so it must not count as an
 * edit here either, or the confirm would appear for a row that would never have
 * been saved.
 */
const itemFingerprint = (item: MenuItem) =>
  JSON.stringify({
    name: item.name ?? "",
    description: item.description ?? "",
    price: item.price ?? 0,
    image: item.image ?? "",
    sectionId: item.sectionId ?? null,
    badge: item.badge ?? null,
    available: item.available ?? true,
    customizationGroups: usableChoiceGroups(item.customizationGroups ?? []),
  });

  // Both sides go through snapshotOf. Comparing a raw JSON.stringify of the state
  // against a filtered snapshot compares two different things and is therefore
  // always unequal, which pins the save bar in its unsaved state forever.
  const isDirty = useMemo(
    () => snapshotOf(menuItems) !== savedSnapshot,
    [menuItems, savedSnapshot],
  );

  /**
   * A short-lived note about the last change or the last save.
   *
   * Both used to sit in the toolbar permanently. A "Saved 1:39:03 AM" that never goes
   * away is three words of furniture competing with the button it describes, and it
   * is still there an hour later describing a save nobody is thinking about.
   *
   * They appear when something happens and clear themselves. The Save button being
   * lit or dim is the standing signal; the words are the event.
   */
  const [notice, setNotice] = useState<{ kind: 'unsaved' | 'saved' } | null>(null);

  /**
   * The menu as one comparable string. Any edit produces a new one; nothing else does.
   */
  const snapshot = useMemo(() => snapshotOf(menuItems), [menuItems]);

  /*
   * Announce unsaved work, keyed on the menu itself rather than on isDirty.
   *
   * isDirty only flips once, from false to true, so an effect depending on it fires
   * exactly once no matter how many edits follow — the note would appear on the first
   * and quietly expire while the owner was still in the middle of the third. Keying on
   * the snapshot re-arms the clock on every change, and always builds a fresh object
   * so the clearing timeout below is restarted rather than reused.
   */
  useEffect(() => {
    if (!isDirty) return;
    setNotice({ kind: 'unsaved' });
  }, [snapshot, isDirty]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.kind === 'saved' ? 3000 : 5000);
    return () => window.clearTimeout(t);
  }, [notice]);


  const handleUploadClick = () => {
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
      // A new dish has no id yet, so it uploads under a temporary one and the
      // row it lands in keeps it. Same path as an edit; the id is all that
      // differed before.
      const id = editingItem?.id ? String(editingItem.id) : `new-${Date.now()}`;
      const result = await supabaseHelpers.uploadMenuItemImage(id, file);
      if (result?.data?.publicUrl) {
        setEditingItem((prev: any) => (prev ? { ...prev, image: result.data.publicUrl } : prev));
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

  const blankDraft = (sectionId?: string | null): Partial<MenuItem> => ({
    name: "",
    description: "",
    price: 0,
    /*
     * Where the new dish lands.
     *
     * An explicit category wins — that is the [+] on a category heading, and it
     * means "put it in here". Otherwise the current filter decides, so a shop
     * looking at Desserts and pressing Add Item gets a dessert.
     */
    sectionId:
      sectionId ??
      (selectedSection === 'all' ? sections[0]?.id ?? null : selectedSection),
    category: categories.find((c) => c.id !== "All")?.id || "Menu",
    available: true,
    image: "",
  });

  /*
   * Show / hide one dish.
   *
   * No confirmation. This is the action a shop does dozens of times a day — mark
   * it out of stock while it sells out, put it back when the kitchen restocks — and
   * a dialog on each one only teaches the owner to click through dialogs without
   * reading them, which is the reflex that makes the delete button dangerous.
   *
   * Only moves state. Nothing reaches the database until Save is pressed, which is
   * the deal the save bar makes: you can mark three dishes out of stock, change your
   * mind about one, and only then write it.
   */
  const toggleItemAvailability = (itemId: number | string) => {
    setMenuItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, available: !item.available } : item)),
    );
  };
  /** Open a card for editing. The same card, the same form, in place. */
  const startEditing = (item: MenuItem) => {
    setDraftMode('edit');
    setEditPriceError("");
    setEditingItem({ ...item });
    setEditSnapshot(itemFingerprint(item));
    setExpandedId(String(item.id));
  };

  /**
   * Collapse whatever is open.
   *
   * Discarding the draft rather than keeping it: reopening a card should show
   * what is actually saved. A half-typed price that silently reappears later
   * is worse than losing the typing.
   */
  const stopEditing = () => {
    setExpandedId(null);
    setEditingItem(null);
    setEditSnapshot("");
    setEditPriceError("");
    setConfirmDiscard(false);
    // Back to the list too.
    //
    // The form is its own screen now, so every path out of it has to leave that
    // screen: cancel, save and delete all end here, and without this you were
    // dropped onto an empty editor with no dish loaded and no way back but the
    // browser.
    setView('list');
  };

  /** Whether the open dish differs from what was saved. */
  const isEditDirty = () =>
    !!editingItem && itemFingerprint(editingItem) !== editSnapshot;

  /**
   * Leaving the form.
   *
   * Asks first when the dish has been changed, because closing is the one way out
   * of this screen that throws work away without saving it. Save and Delete do not
   * need the question -- one keeps the work and one is already behind its own
   * confirmation -- so this is the only place it is asked.
   *
   * Returns whether it actually closed, so the callers that also have other work to
   * do (starting another dish, deleting) know whether to carry on.
   */
  const requestClose = (): boolean => {
    if (isEditDirty()) {
      setConfirmDiscard(true);
      return false;
    }
    stopEditing();
    return true;
  };

  /**
   * A blank dish, open and ready to fill in, filed under the category asked for.
   */
  const startAdding = (sectionId?: string | null) => {
    // Starting a new dish closes whatever is open. If that one had changes, this
    // is still a discard, so it asks too rather than doing it behind the owner's
    // back -- the confirm below then opens over the form they were working in.
    if (expandedId !== null && !requestClose()) return;
    setDraftMode('add');
    setEditPriceError("");
    const draft = blankDraft(sectionId);
    setEditingItem(draft);
    // A new dish has nothing to lose, but the fingerprint is still needed: the
    // form must be able to tell "untouched" from "typed into and typed out of",
    // and only the fields that count towards a fingerprint.
    setEditSnapshot(itemFingerprint({ ...draft, id: 'new' } as MenuItem));
    setExpandedId('new');
    setSelectedSection('all');
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Save, whichever way the card was opened.
   *
   * A blank draft card has no id, so "update that row" is not something it can
   * mean — it appends instead. A real card keeps its id and replaces in place.
   */
  const saveEditedItem = () => {
    if (!editingItem) return;
    if (!editingItem.price || editingItem.price <= 0) {
      setEditPriceError("Price must be greater than zero.");
      return;
    }
    setEditPriceError("");

    if (draftMode === "add") {
      const item: MenuItem = {
        id: Date.now(),
        // New dishes go to the end. Without this it took whatever number the draft
        // happened to carry and could land anywhere, including ahead of dishes that
        // have been on the menu for months.
        sortOrder: menuItems.length,
        sectionId: editingItem.sectionId ?? null,
        name: editingItem.name || "",
        description: editingItem.description || "",
        price: editingItem.price || 0,
        category: editingItem.category || "Menu",
        available: editingItem.available ?? true,
        image:
          editingItem.image ||
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
        /*
         * Choices set on the draft.
         *
         * This rebuilds the item field by field rather than spreading the draft, so
         * anything added to the form later is dropped here unless it is listed --
         * which is exactly what had happened to the options: they could be filled in
         * on a brand new dish and were silently gone by the time it was added.
         */
        customizationGroups: editingItem.customizationGroups ?? [],
      };
      setMenuItems([...menuItems, item]);
    } else {
      setMenuItems(menuItems.map((item) => (item.id === editingItem.id ? editingItem : item)));
    }

    stopEditing();
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

  /**
   * The choices column, but only once the column behind it exists.
   *
   * Same shape as `sectionColumn` so a shop that has not run the migration keeps
   * saving its menu; the options simply are not stored yet.
   */
  const optionsColumn = (item: { customizationGroups?: ItemChoiceGroup[] }) =>
    optionsColumnExists.current
      ? { customization_groups: usableChoiceGroups(item.customizationGroups ?? []) }
      : {};

  /**
   * Write the whole menu.
   *
   * Every item, every time, rather than a diff: the menu is at most a few dozen
   * rows and the write is one statement per row. A diff would have to remember what
   * the last save looked like in order to be correct, which is exactly the state
   * that goes wrong when something else touches the menu.
   *
   * New items get their database id back and are swapped into local state, so the
   * next save updates rows rather than inserting duplicates.
   */
  /**
   * Write the menu. Returns whether it worked.
   *
   * The return value is what "Save and leave" acts on. Navigating away after a
   * failed write would throw the work away under a button that promised to keep it,
   * and would do it looking deliberate.
   */
  const saveChanges = async (): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    setSaveError(null);

    if (user?.email) {
      localStorage.setItem(`menuItems_${user.email}`, JSON.stringify(menuItems));
    }

    if (!restaurantId) {
      setSaveError("No shop is linked to this account yet.");
      setIsSaving(false);
      return false;
    }

    try {
      const nextItems = [...menuItems];

      for (let i = 0; i < nextItems.length; i++) {
        const item = nextItems[i];

        if (typeof item.id === 'number') {
          const { data: inserted, error } = await supabase
            .from('menu_items')
            .insert([{
              restaurant_id: restaurantId,
              name: item.name,
              description: item.description,
              price: item.price,
              category: item.category,
              ...sectionColumn(item),
              ...optionsColumn(item),
              image_url: item.image,
              is_available: item.available,
              sort_order: item.sortOrder ?? 0,
              badge: item.badge || null,
              created_at: new Date().toISOString(),
            }])
            .select()
            .single();

          if (error) throw error;
          if (inserted?.id) nextItems[i] = { ...item, id: inserted.id };
          continue;
        }

        const { error } = await supabase
          .from('menu_items')
          .update({
            name: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            ...sectionColumn(item),
            ...optionsColumn(item),
            image_url: item.image,
            is_available: item.available,
            sort_order: item.sortOrder ?? 0,
            badge: item.badge || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (error) throw error;
      }

      setMenuItems(nextItems);
      setSavedSnapshot(snapshotOf(nextItems));
      setNotice({ kind: 'saved' });

      /*
       * Did the choices actually make it to the database?
       *
       * Asked after the write, because that is the only moment it is knowable, and
       * the answer decides whether "Saved" is true. When the column is missing the
       * options were dropped from the payload and the rest of the menu is fine, so
       * the save still succeeds -- but it must not claim to have kept something it
       * threw away.
       */
      const optionsDropped =
        !optionsColumnExists.current &&
        nextItems.some((item) => usableChoiceGroups(item.customizationGroups ?? []).length > 0);
      setOptionsNotSaved(optionsDropped);
    } catch (error: any) {
      console.error('[Menu] Save failed:', error);

      const message = String(error?.message || '');
      const missingColumn =
        error?.code === 'PGRST204' || /column .* does not exist/i.test(message);

      // A raw PostgREST 400 says "column menu_items.sort_order does not exist",
      // which is true and useless to a shop owner. Name the file to run instead.
      //
      // Named per column, because "run this SQL file" is only actionable if the
      // owner knows which one, and the options column is the newest of them.
      const migration = /customization_groups/i.test(message)
        ? 'ADD_MENU_ITEM_OPTIONS.sql'
        : /sort_order/i.test(message)
          ? 'ADD_MENU_ITEM_SORT_ORDER.sql'
          : /section_id|menu_sections/i.test(message)
            ? 'ADD_MENU_SECTIONS.sql'
            : 'ADD_MENU_ITEM_SORT_ORDER.sql';

      setSaveError(
        missingColumn
          ? `Saving needs a database update. Run ${migration} in Supabase.`
          : message || "Could not save the menu. Your changes are still here - try again.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }

    return true;
  };

  /*
   * Losing unsaved menu edits to a stray refresh is the cost of explicit saving,
   * and it is the one that has to be paid for: the browser cannot ask its own
   * question for us.
   */
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  /**
   * Accept the edits as they stand and stop guarding.
   *
   * Without this the pending move would be re-blocked the moment the dialog closed,
   * because the state is still dirty — the shop chose to discard, and the guard has
   * to be told so rather than left to argue.
   */
  const discardUnsaved = () => {
    setSavedSnapshot(snapshotOf(menuItems));
    setNotice(null);
  };

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

  /**
   * Which screen the editor is on.
   *
   * The form used to open underneath its row, in the middle of a list, so editing
   * a dish meant scrolling a long form through someone else's dishes. It gets its
   * own screen now: one thing on it, with room to actually fill it in.
   */
  const [view, setView] = useState<'list' | 'detail'>('list');

  /**
   * Multi-select, entered by holding a row.
   *
   * The mode is reached by holding rather than by a button because the only two
   * things it offers — show/hide and delete — are the two things you might want to
   * do to a dozen dishes at once, and a checkbox sitting permanently on every row
   * is a control that is almost never what you wanted.
   */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

  /** The row being dragged, and the row it is currently over. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  /*
   * Refs mirroring the two drag values.
   *
   * A drag sends pointerdown, then moves, then up — often inside one frame. React
   * has not re-rendered between them, so handlers reading `dragId` from state saw
   * null and the drop did nothing. Refs are written synchronously, so every event
   * in the gesture reads what the last one wrote.
   */
  const dragIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);

  /** Row elements, for hit-testing where a drop would land. */
  const rowEls = useRef(new Map<string, HTMLElement>());

  /** A press in progress, so we can tell a tap from a hold from a drag. */
  const pressTimer = useRef<number | null>(null);
  const pressMoved = useRef(false);
  const pressConsumed = useRef(false);

  /*
   * Refs the gesture handlers read.
   *
   * Everything a gesture decides happens inside one press, often within a single
   * frame, so the state values those handlers closed over were stale: the hold
   * timer could not see that selection mode was already on, and the drag handlers
   * could not see that a drag had started.
   */
  const armTimer = useRef<number | null>(null);
  const dragArmed = useRef(false);
  const dragMoved = useRef(false);
  const pressStartY = useRef(0);
  const pressItemId = useRef<string | null>(null);
  const selectionModeRef = useRef(false);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  /** Where a category sits among the others, for the move-up / move-down guards. */
  const sectionIndexOf = (sectionId: string) =>
    sections.findIndex((s) => s.id === sectionId);

  /**
   * The dishes, numbered, grouped, with the unsaved new one filed under the
   * category it is going into.
   *
   * The number runs through the whole list rather than restarting per category, so
   * "dish 3" means one dish in this menu, in the shop's mouth and on the storefront.
   */
  const renderedGroups = useMemo(() => {
    const draft =
      draftMode === 'add' && editingItem
        ? ({ item: { ...editingItem, id: 'new' } as MenuItem, isDraft: true } as const)
        : null;

    let counter = 0;
    const next = sectionGroups.map((group) => ({
      key: group.key,
      title: group.title,
      section: sections.find((s) => s.id === group.key) ?? null,
      isRenaming: group.key !== '__unfiled' && renamingSectionId === group.key,
      rows: group.items.map((item) => ({ item, number: ++counter, isDraft: false })),
    }));

    if (draft) {
      // Filed under its own heading, so the new dish appears where it will live.
      const target = draft.item.sectionId
        ? next.find((g) => g.section?.id === draft.item.sectionId)
        : undefined;

      if (target) {
        target.rows.push({ item: draft.item, number: ++counter, isDraft: true });
      } else {
        next.unshift({
          key: '__new',
          title: 'New dish',
          section: null,
          isRenaming: false,
          rows: [{ item: draft.item, number: ++counter, isDraft: true }],
        });
      }
    }

    return next;
  }, [sectionGroups, sections, draftMode, editingItem, renamingSectionId]);

  /**
   * One dish.
   *
   * Two buttons: show/hide, and edit. Delete lives inside the form rather than on
   * the row — it is the only one of the three that cannot be undone, and a row
   * that a shop owner clicks dozens of times a day is the wrong home for it.
   *
   * A hidden dish is dimmed and greyscaled the way a closed folder does, and says
   * so in words as well, because a greyed row on a screen that is meant to show
   * every dish you have needs explaining.
   */
  /*
   * Four gestures on one card, told apart by how long and how far.
   *
   *   tap                     → open the dish
   *   hold                    → selection mode on; holding again turns it off
   *   drag (mouse)            → move the dish, anywhere on the card
   *   hold then drag (touch)  → move the dish, anywhere on the card
   *
   * The card is the drag target, not a grip in its corner: reaching for a 24px
   * handle to reorder a list of twenty is a worse thing to do than the reordering
   * itself.
   *
   * Touch needs the 250ms arm before movement counts. A finger that moves at once
   * is scrolling — the list is mostly cards, so the page has to keep winning the
   * common gesture — and a finger that pauses first has said it wants to pick
   * something up. A mouse has no such ambiguity and arms immediately.
   */
  const beginPress = (itemId: string) => (event: React.PointerEvent) => {
    pressMoved.current = false;
    pressConsumed.current = false;
    pressItemId.current = itemId;
    pressStartY.current = event.clientY;

    dragArmed.current = event.pointerType !== 'touch';
    if (!dragArmed.current) {
      armTimer.current = window.setTimeout(() => {
        armTimer.current = null;
        dragArmed.current = true;
      }, 250);
    }

    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressConsumed.current = true;

      // Holding again leaves selection mode. Getting out of it by finding
      // precisely the right button is more work than getting into it was.
      if (selectionModeRef.current) {
        endSelection();
        return;
      }

      setSelectionMode(true);
      setSelectedIds((prev) => new Set(prev).add(String(itemId)));
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    }, 450);
  };

  const movePress = (event: React.PointerEvent) => {
    if (pressItemId.current == null) return;

    // Movement past a few pixels is a decision, and it cancels the hold.
    if (!pressMoved.current && Math.abs(event.clientY - pressStartY.current) > 8) {
      pressMoved.current = true;
      if (pressTimer.current != null) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    }

    if (!dragArmed.current || !pressMoved.current) return;

    // Starting the drag from here means the click that ends the gesture has to
    // be swallowed, or every reorder also opens the editor it just moved.
    if (!dragIdRef.current) {
      pressConsumed.current = true;
      startDragNow(pressItemId.current, event);
    }
    moveDragNow(event);
  };

  const endPress = (event: React.PointerEvent) => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (armTimer.current != null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }

    if (dragIdRef.current) {
      pressConsumed.current = true;
      endDragNow(event);
    }

    dragArmed.current = false;
    pressItemId.current = null;
  };

  const toggleSelected = (itemId: string | number) => {
    const key = String(itemId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Tick a category, and everything filed under it.
   *
   * "Delete this whole section" is the operation people actually want, and making
   * them tick a heading and then every dish under it one at a time is how a bulk
   * delete never gets done. Un-ticking gives the dishes back, so a stray tap on a
   * heading is undoable.
   */
  const toggleSelectedCategory = (sectionId: string) => {
    const inside = menuItems
      .filter((item) => item.sectionId === sectionId)
      .map((item) => String(item.id));

    const wasSelected = selectedCategoryIds.has(sectionId);

    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });

    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of inside) {
        if (wasSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const selectionCount = selectedIds.size + selectedCategoryIds.size;

  const endSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSelectedCategoryIds(new Set());
  };

  /**
   * One availability rule for everything ticked.
   *
   * Availability is flipped, not set: a mix of shown and hidden dishes means "the
   * opposite of each of these", which is what someone marking a whole category out
   * of stock in one go actually means.
   */
  const toggleSelectedAvailability = () => {
    if (selectedIds.size === 0) return;
    const picked = menuItems.filter((i) => selectedIds.has(String(i.id)));
    const allAvailable = picked.length > 0 && picked.every((i) => i.available);

    setMenuItems((prev) =>
      prev.map((item) =>
        selectedIds.has(String(item.id))
          ? { ...item, available: !allAvailable }
          : item,
      ),
    );
    endSelection();
  };

  /**
   * Delete everything ticked — dishes and categories together.
   *
   * Categories go through the same confirm as everywhere else, and their dishes are
   * unfiled rather than removed: deleting a heading must never delete food.
   */
  const deleteSelectedItems = () => {
    const ids = new Set(selectedIds);
    const categoryIds = new Set(selectedCategoryIds);
    const count = ids.size + categoryIds.size;
    if (count === 0) return;
    endSelection();

    if (categoryIds.size > 0) {
      setMenuItems((prev) =>
        prev.map((item) =>
          item.sectionId && categoryIds.has(item.sectionId)
            ? { ...item, sectionId: null }
            : item,
        ),
      );
      if (selectedSection !== 'all' && categoryIds.has(selectedSection)) {
        setSelectedSection('all');
      }
    }

    void (async () => {
      if (!restaurantId) return;
      for (const sectionId of categoryIds) {
        const { error } = await supabase
          .from('menu_sections')
          .delete()
          .eq('id', sectionId);
        if (error) console.error('[Menu] Category delete failed:', error);
      }
      for (const id of ids) {
        const { error } = await supabase
          .from('menu_items')
          .delete()
          .eq('id', id)
          .eq('restaurant_id', restaurantId);
        if (error) console.error('[Menu] Item delete failed:', error);
      }
    })();

    setMenuItems((prev) => prev.filter((item) => !ids.has(String(item.id))));
    setSections((prev) => prev.filter((sec) => !categoryIds.has(sec.id)));

    setDeleteSuccessMessage(
      `${count} ${count === 1 ? 'thing' : 'things'} deleted.`
    );
    setShowDeleteSuccess(true);
    setTimeout(() => setShowDeleteSuccess(false), 2500);
  };

  /**
   * Move a dish to where it was dropped, and renumber the lot.
   *
   * Every dish gets a new position rather than just the one that moved: two halves
   * of a list with gaps and ties in them are a list whose order depends on which
   * rows the database happens to return first, which is the bug this whole column
   * exists to remove.
   */
  const moveItemTo = (from: string, to: string) => {
    if (from === to) return;
    setMenuItems((prev) => {
      const a = prev.findIndex((i) => String(i.id) === from);
      const b = prev.findIndex((i) => String(i.id) === to);
      if (a === -1 || b === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(a, 1);
      next.splice(b, 0, moved);
      return next.map((item, at) => ({ ...item, sortOrder: at }));
    });
  };

  /** Which row is under the pointer, by comparing against the ones on screen. */
  const rowUnderPointer = (clientY: number): string | null => {
    for (const [id, el] of rowEls.current) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return id;
    }
    return null;
  };

  const startDragNow = (itemId: string, event: React.PointerEvent) => {
    dragIdRef.current = itemId;
    dragOverIdRef.current = itemId;
    setDragId(itemId);
    setDragOverId(itemId);
    try {
      (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is an optimisation, not a requirement: without it the moves still
      // arrive while the pointer is over the element. A throw here — a pointer that
      // has already been released, a synthetic event — must not abort the drag.
    }
  };

  const moveDragNow = (event: React.PointerEvent) => {
    const from = dragIdRef.current;
    if (!from) return;
    const over = rowUnderPointer(event.clientY);
    if (over && over !== from && over !== dragOverIdRef.current) {
      dragOverIdRef.current = over;
      setDragOverId(over);
    }
  };

  const endDragNow = (event: React.PointerEvent) => {
    const from = dragIdRef.current;
    if (!from) return;
    try {
      (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      // Never captured, or already released.
    }
    const over = dragOverIdRef.current;
    dragIdRef.current = null;
    dragOverIdRef.current = null;
    setDragId(null);
    setDragOverId(null);
    if (over && over !== from) moveItemTo(from, over);
  };

  /** Is this row showing its form? The draft always is; a row is while it is edited. */
  const isFormOpen = (row: { item: MenuItem; isDraft: boolean }) =>
    row.isDraft ? draftMode === 'add' : expandedId === String(row.item.id);
  const renderRow = (item: MenuItem, isDraft: boolean) => {
    const key = String(item.id);
    const selected = selectedIds.has(key);
    const isDragging = dragId === key;
    const isDropTarget = Boolean(dragId) && dragOverId === key && dragId !== key;
    const badge = item.badge ? getBadgeLabel(item.badge) : 'None';

    return (
      <div
        ref={(el) => {
          if (el) rowEls.current.set(key, el);
          else rowEls.current.delete(key);
        }}
        onPointerDown={beginPress(item.id)}
        onPointerMove={movePress}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onClick={() => {
          /*
           * The hold already did its work; the click that follows it must not also
           * open the dish.
           *
           * Read and clear, rather than clear and return. It used to clear the flag
           * only on the swallowed click, so a hold that started while selection mode
           * was already on — where no press timer ever runs — left the flag set for
           * good and every later tap was eaten.
           */
          const consumedByHold = pressConsumed.current;
          pressConsumed.current = false;
          if (consumedByHold) return;
          if (isDraft) return;
          if (selectionMode) {
            toggleSelected(item.id);
            return;
          }
          startEditing(item);
          setView('detail');
        }}
        className={`flex items-center gap-2 rounded-xl border p-2 select-none transition-all ${
          isDragging
            ? 'opacity-40'
            : isDropTarget
              ? 'border-t-2 border-t-[var(--primary)]'
              : isDraft
                ? 'border-dashed border-[var(--primary)]'
                : selected
                  ? 'border-[var(--info)] bg-[var(--info-soft)]'
                  : 'border-[var(--border)]'
        } ${isDraft ? 'bg-[var(--surface)]' : 'bg-[var(--surface)]'} ${selectionMode ? 'cursor-pointer' : 'cursor-pointer'}`}
      >
        {/* Selection tick, only while selecting. */}
        {selectionMode && !isDraft && (
          <span
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${item.name}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleSelected(item.id);
              }
            }}
            className={`grid size-6 shrink-0 place-items-center rounded border-2 ${
              selected
                ? 'border-[var(--info)] bg-[var(--info)]'
                : 'border-[var(--border)]'
            }`}
          >
            {selected && <Check className="size-3.5 text-white" aria-hidden="true" />}
          </span>
        )}


        <div
          className={`size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)] transition-all ${
            item.available ? '' : 'opacity-45 grayscale'
          }`}
        >
          <ImageWithFallback
            src={item.image}
            alt={item.name}
            className="size-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--ink)] lg:text-base">
            {item.name || 'Untitled dish'}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            {item.description || 'No description yet.'}
            {!item.available && (
              <span className="font-semibold text-[var(--muted-foreground)]"> · Hidden</span>
            )}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-[var(--muted-foreground)]">
            <span className="font-bold text-[var(--primary)]">
              ₱{Number(item.price) || 0}
            </span>
            {' | '}
            {item.badge ? (
              <span className={getBadgeColor(item.badge)}>{badge}</span>
            ) : (
              <span>{badge}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isDraft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleItemAvailability(item.id);
              }}
              aria-label={item.available ? `Hide ${item.name}` : `Show ${item.name}`}
              title={item.available ? 'Hide from customers' : 'Show to customers'}
              className={`grid size-9 place-items-center rounded-lg border transition-colors ${
                item.available
                  ? 'border-[var(--success)] text-[var(--success)]'
                  : 'border-[var(--error)] text-[var(--error)]'
              }`}
            >
              {/*
  A shut eye, not a cross. A red cross on a row you are only looking at reads as
  an error on that dish; an eye that is closed reads as the thing it is — off the
  menu — and matches the wording next to it.
*/}
{item.available ? (
              <Eye className="w-4 h-4" aria-hidden="true" />
            ) : (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            )}
            </button>
          )}

          {!isDraft && !selectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startEditing(item);
                setView('detail');
              }}
              aria-label={`Edit ${item.name}`}
              title="Edit"
              className="grid size-9 place-items-center rounded-lg border border-line text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  };

  /**
   * The dish form, inline under its row.
   *
   * Rendered once and reused for both jobs. Adding and editing used to be separate
   * dialogs with separate copies of these fields, which meant the price rule and
   * the image upload existed twice and could disagree.
   */
  const renderForm = (isNew: boolean) => (
    <div className="overflow-hidden rounded-xl border border-[var(--primary)] bg-[var(--surface)]">
                            {/*
                             * The modal this form came out of had a title bar naming
                             * what it was editing. A card in a list has no such thing, and
                             * a form open mid-scroll reads as part of whichever card it
                             * sits in — so it says what it is, and offers a way out.
                             */}
                            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                              <p className="min-w-0 truncate text-sm font-bold text-[var(--ink)]">
                                {isNew ? 'New item' : editingItem.name || 'Untitled'}
                              </p>
                              <button
                                type="button"
                                onClick={requestClose}
                                aria-label="Close"
                                title="Close"
                                className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--ink)] active:scale-90"
                              >
                                <X className="size-4" aria-hidden="true" />
                              </button>
                            </div>

                            {/*
                             * One padded column with an even rhythm.
                             *
                             * The wrapper this used to have was lost when the form
                             * moved out of the list row and onto its own screen, which
                             * left every field flush against the one above it — the badge
                             * grid and the availability toggle looked like one block.
                             */}
                            <div className="space-y-5 p-4 lg:p-5">
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
                          onClick={handleUploadClick}
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
                      <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Category</label>
                      {/* Sections are the grouping control now. The old category dropdown
                          is gone; dishes keep a stored category behind the scenes so the
                          customer cuisine filter rail is unaffected. */}
                      {sections.length === 0 ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          No categories yet. Create one from the menu screen — dishes stay unfiled until you do.
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
                    {/*
                      Choices, in the item form rather than behind a separate
                      screen.

                      There was a whole customisation modal for this and nothing
                      ever opened it -- the handler that would have launched it was
                      never wired to anything, and no column existed to save to, so
                      the feature was unreachable and unrecordable. Options are part
                      of what a dish *is* here (a drink to go with it, a size), so
                      they belong on the same form as the price they change.
                    */}
                    <ItemOptionsEditor
                      groups={editingItem.customizationGroups ?? []}
                      savingBlocked={!optionsColumnExists.current}
                      onChange={(groups) =>
                        setEditingItem({ ...editingItem, customizationGroups: groups })
                      }
                    />

                    <div>
                      <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Badge (Optional)</label>
                      <p className="text-xs text-[var(--muted-foreground)] mb-3">
                        Highlight special items to attract customers. "Most ordered" is not
                        here because the app works it out from real sales and adds it for you.
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setEditingItem({ ...editingItem, badge: undefined })}
                          className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                            !editingItem.badge
                              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                              : "border-[var(--border)] bg-surface text-[var(--muted-foreground)]"
                          }`}
                        >
                          No Badge
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

                            </div>

                            {/*
                             * Save and delete, as icons.
                             *
                             * Two full-width buttons saying what they do, for actions you
                             * already know how to undo or confirm: cancel and delete sat
                             * in a row as loud as the Save, and cancel next to save on a
                             * long form is a question asked every time — the form has a
                             * back button and the list throws changes away, so there is
                             * nothing here to cancel.
                             *
                             * Icons keep the labels for screen readers and for the
                             * tooltip, and keep a destructive action from being the biggest
                             * thing on the screen.
                             */}
                            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 lg:px-5">
                              <button
                                type="button"
                                onClick={() => {
                                  const target = editingItem;
                                  stopEditing();
                                  if (target) deleteItem(target.id);
                                }}
                                aria-label="Delete item"
                                title="Delete item"
                                className="grid size-11 place-items-center rounded-xl border border-line text-[var(--error)] transition-colors hover:bg-[var(--error-soft)]"
                              >
                                <Trash2 className="size-5" aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={saveEditedItem}
                                aria-label={isNew ? "Add item" : "Save item"}
                                title={isNew ? "Add item" : "Save item"}
                                className="grid size-11 place-items-center rounded-xl bg-[var(--success)] text-white transition-opacity hover:opacity-90"
                              >
                                {isNew ? (
                                  <Plus className="size-5" aria-hidden="true" />
                                ) : (
                                  <Check className="size-5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--muted)] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 bg-[var(--muted)] w-full min-w-0">
        {/*
         * The dish editor, on its own screen.
         *
         * This used to open underneath the dish, in the middle of everybody else's
         * dishes — a long form threaded through a list, half of it off-screen at
         * any moment, and you had to remember which row belonged to it when you
         * scrolled back up. A full screen has room for the photo, the price and the
         * category on one screen, and only one thing on it to be confused about.
         */}
        {view === 'detail' && (
          <div className="min-h-screen">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-surface px-3 py-3 lg:px-5">
              <button
                type="button"
                onClick={() => {
                  stopEditing();
                  setView('list');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-[var(--primary)] transition-colors hover:bg-[var(--muted)]"
              >
                <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                Back to menu
              </button>
              <h1 className="min-w-0 truncate text-lg font-extrabold text-[var(--ink)]">
                {draftMode === 'add' ? 'New dish' : editingItem?.name || 'Edit dish'}
              </h1>
            </header>
            <div className="px-3 py-4 lg:px-5">
              {renderForm(draftMode === 'add')}
            </div>
          </div>
        )}

        {/* The list. The editor itself is its own screen — see view === 'detail'. */}
        {view === 'list' && (
          <div className="min-h-screen">
            <header className="bg-surface border-b border-[var(--border)] px-3 py-4 lg:px-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden flex-shrink-0 -ml-1 p-1 rounded-lg hover:bg-[var(--muted)]"
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5 text-[var(--ink)]" />
                </button>
                <h1 className="text-lg lg:text-2xl font-extrabold tracking-tight text-[var(--ink)]">
                  Menu Editor
                </h1>
                <p className="ml-auto text-xs lg:text-sm tabular-nums text-[var(--muted-foreground)]">
                  {menuItems.length} items · {menuItems.filter((i) => i.available).length} available
                </p>
              </div>

              {/* Narrows the list and nothing else — categories are renamed, reordered
                  and deleted from their own headings. */}
              <div className="relative mt-3">
                <select
                  id="menu-filter"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-line bg-[var(--muted)] py-2 pl-3 pr-9 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="all">All dishes ({menuItems.length})</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} ({menuItems.filter((i) => i.sectionId === section.id).length})
                    </option>
                  ))}
                </select>
                <ChevronRight
                  className="pointer-events-none absolute right-3 top-1/2 w-4 h-4 -translate-y-1/2 rotate-90 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
              </div>

              {/* Toolbar, above the divider.
                  It was at the foot of the page, which meant reaching past every dish
                  to get at the button that saves them. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setRenamingSection(null);
                    setNewSectionName("");
                    setSectionError("");
                    setShowAddSection(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--muted)]"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add Category
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startAdding();
                    setView('detail');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--muted)]"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add Item
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {/*
                    Options that were not kept.

                    Says it here rather than only in the console, because the whole
                    point is that the shop cannot otherwise tell: the save succeeds,
                    the screen says "Saved", and the choices are gone the next time
                    the page loads.
                  */}
                  {optionsNotSaved && (
                    <span
                      role="alert"
                      className="text-xs font-semibold text-[var(--amber-ink)]"
                    >
                      Choices not saved — run ADD_MENU_ITEM_OPTIONS.sql
                    </span>
                  )}
                  {saveError && (
                    <span role="alert" className="text-xs font-semibold text-[var(--error)]">
                      {saveError}
                    </span>
                  )}
                  {!saveError && notice && (
                    <span
                      role="status"
                      className={`text-xs font-semibold ${
                        notice.kind === 'saved'
                          ? 'text-[var(--success)]'
                          : 'text-[var(--muted-foreground)]'
                      }`}
                    >
                      {notice.kind === 'saved' ? 'Saved' : 'Unsaved changes'}
                    </span>
                  )}

                  {/*
                    Save, only when there is something to save.

                    It used to sit there permanently, greyed out whenever the menu
                    matched what was stored. That is the one button on the screen
                    that is always asking for a decision and is almost never
                    actionable: for most of a session there is nothing to write, so
                    it read as part of the furniture and invited a press that did
                    nothing. Hiding it makes it mean something again -- it appears
                    the moment the menu stops matching what is saved, and that is
                    also the moment there is a second unsaved-changes dialog.

                    Not merely disabled while saving, because a save in flight has
                    to stay on screen or the bar appears to jump.
                  */}
                  {(isDirty || isSaving) && (
                    <button
                      type="button"
                      onClick={saveChanges}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--success)] px-3 py-2 text-xs font-bold text-white transition-colors hover:opacity-90 active:scale-[0.97]"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                  )}
                </div>
              </div>
            </header>

            <div className="px-3 py-4 lg:px-5">
              {renderedGroups.length === 0 ? (
                <div className="py-16 text-center">
                  <Package className="mx-auto mb-3 size-14 text-[var(--border)]" aria-hidden="true" />
                  <p className="mb-4 text-[var(--muted-foreground)]">
                    {searchQuery ? 'Nothing matches that search.' : 'No dishes yet.'}
                  </p>
                  <Button
                    onClick={() => {
                      startAdding();
                      setView('detail');
                    }}
                    className="bg-[var(--primary)] hover:bg-[var(--primary)]"
                  >
                    <Plus className="mr-2 size-4" aria-hidden="true" />
                    Add your first dish
                  </Button>
                </div>
              ) : (
                <div className="space-y-7">
                  {renderedGroups.map((group) => (
                    <section key={group.key}>
                      <div className="mb-2 flex items-center gap-2">
                        {/* A tick on the heading while selecting: deleting a category is
                            as much a bulk job as hiding a dish. */}
                        {selectionMode && group.section && (
                          <span
                            role="checkbox"
                            aria-checked={selectedCategoryIds.has(group.section.id)}
                            aria-label={`Select category ${group.title}`}
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectedCategory(group.section!.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                toggleSelectedCategory(group.section!.id);
                              }
                            }}
                            className={`grid size-6 shrink-0 place-items-center rounded border-2 ${
                              selectedCategoryIds.has(group.section.id)
                                ? 'border-[var(--info)] bg-[var(--info)]'
                                : 'border-[var(--border)]'
                            }`}
                          >
                            {selectedCategoryIds.has(group.section.id) && (
                              <Check className="size-3.5 text-white" aria-hidden="true" />
                            )}
                          </span>
                        )}

                        <h2 className="min-w-0 truncate text-sm font-extrabold tracking-wide text-[var(--ink)]">
                          {group.title}
                        </h2>
                        <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                          {group.rows.filter((r) => !r.isDraft).length}
                        </span>

                        {group.section ? (
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            {group.isRenaming ? (
                              <>
                                <input
                                  type="text"
                                  autoFocus
                                  value={sectionNameDraft}
                                  onChange={(e) => setSectionNameDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      commitSectionName();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelRenamingSection();
                                    }
                                  }}
                                  onBlur={commitSectionName}
                                  aria-label={`Rename ${group.title}`}
                                  className="w-32 min-w-0 rounded-lg border border-[var(--primary)] bg-[var(--surface)] px-2 py-1 text-sm font-bold text-[var(--ink)] outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => moveSection(group.section!.id, -1)}
                                  disabled={sectionIndexOf(group.section!.id) === 0}
                                  aria-label={`Move ${group.title} up`}
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--muted-foreground)] disabled:opacity-30"
                                >
                                  <ChevronRight className="size-4 rotate-180" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSection(group.section!.id, 1)}
                                  disabled={sectionIndexOf(group.section!.id) === sections.length - 1}
                                  aria-label={`Move ${group.title} down`}
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--muted-foreground)] disabled:opacity-30"
                                >
                                  <ChevronRight className="size-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    cancelRenamingSection();
                                    setSectionToDelete(group.section!);
                                    setShowDeleteSectionModal(true);
                                  }}
                                  aria-label={`Delete ${group.title}`}
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--error)]"
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                    startAdding(group.section!.id);
                    setView('detail');
                  }}
                                  aria-label={`Add a dish to ${group.title}`}
                                  title="Add a dish here"
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--primary)]"
                                >
                                  <Plus className="size-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    startRenamingSection(group.section!.id, group.section!.name)
                                  }
                                  aria-label={`Rename ${group.title}`}
                                  title="Rename"
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--muted-foreground)]"
                                >
                                  <Edit2 className="size-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSectionToDelete(group.section!);
                                    setShowDeleteSectionModal(true);
                                  }}
                                  aria-label={`Delete ${group.title}`}
                                  title="Delete"
                                  className="grid size-8 place-items-center rounded-lg border border-line text-[var(--error)]"
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
                            not filed
                          </span>
                        )}
                      </div>

                      <ul className="space-y-1.5">
                        {group.rows.map((row) => (
                          <li key={String(row.item.id)}>
                            {renderRow(row.item, row.isDraft)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* The selection bar. Fixed to the bottom because it acts on things you
                have scrolled past, not the thing at the top of the screen. */}
            {selectionMode && (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-surface px-3 py-2.5 shadow-lg lg:left-64">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink)]">
                    {selectionCount} selected
                  </span>
                  {/* Cancel, not "Done": this discards the selection rather than
                      committing to it, and holding a row again does the same thing.
                      The count stays visible so a long selection is not lost behind a
                      mis-tap. */}
                  <button
                    type="button"
                    onClick={endSelection}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--muted-foreground)]"
                  >
                    Cancel
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectedAvailability}
                      disabled={selectedIds.size === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-[var(--ink)] disabled:opacity-40"
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      Toggle
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedItems}
                      disabled={selectionCount === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--error)] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/*
         * Leaving with unsaved work.
         *
         * Tapping another tab in the sidebar is the easiest way in the whole app to
         * throw away a menu edit, and it happened with no warning at all until now —
         * the browser dialog only covers reloading and closing the tab, which is the
         * rare case.
         *
         * Two answers, not three. "Save" is offered because most of the time losing
         * the work was not what anyone wanted, only what they had not thought about
         * yet, and making them click Discard to get there would be a small trap.
         *
         * Staying is not on the list. It is the X, which does the same thing without
         * spending a whole button to say "do nothing" — a third option sitting next to
         * two consequential ones invites a reading of the dialog where the safe choice
         * is one of the offered answers, and the only safe choice here is to close it.
         */}
        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="unsaved-title"
              className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-2xl"
            >
              <button
                type="button"
                aria-label="Stay on this page"
                onClick={() => blocker.reset?.()}
                className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--ink)]"
              >
                <X className="h-5 w-5" />
              </button>

              <h2 id="unsaved-title" className="pr-8 text-lg font-bold text-[var(--ink)]">
                Unsaved changes
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Your edits to this menu haven't been saved yet. Leaving this page now
                will lose them.
              </p>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    const ok = await saveChanges();
                    // A failed write stays on this page. Leaving would throw the
                    // edits away behind a button that said it would keep them.
                    if (!ok) return;
                    discardUnsaved();
                    blocker.proceed?.();
                  }}
                  className="rounded-xl bg-[var(--success)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Save and leave
                </button>

                <button
                  type="button"
                  onClick={() => {
                    discardUnsaved();
                    blocker.proceed?.();
                  }}
                  className="rounded-xl border border-line px-4 py-3 text-sm font-bold text-[var(--error)] transition-colors hover:bg-[var(--error-soft)]"
                >
                  Discard changes
                </button>
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

        {/* Delete Item Confirmation Modal */}
        {confirmDiscard && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--amber-soft)]">
                  <AlertTriangle className="size-5 text-[var(--amber)]" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-[var(--ink)]">
                  Discard your changes?
                </h3>
              </div>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                This {draftMode === 'add' ? 'new dish' : 'dish'} has changes that
                have not been saved. Closing now throws them away.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="flex-1 rounded-xl border border-line px-4 py-3 font-bold text-[var(--ink)] transition-colors hover:bg-[var(--muted)] active:scale-[0.97]"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={stopEditing}
                  className="flex-1 rounded-xl bg-[var(--error)] px-4 py-3 font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.97]"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
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
