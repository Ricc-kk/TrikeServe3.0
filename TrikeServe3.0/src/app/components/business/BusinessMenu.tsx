import { useState, useEffect } from "react";
import { Store, Package, Clock, User, Plus, Edit2, Image as ImageIcon, X, Search, ChevronRight, Eye, EyeOff, Trash2, Check, BarChart3, Camera, Upload, TrendingUp, Star, Award, Menu, Settings } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BusinessSidebar from "./BusinessSidebar";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import AddCustomizationModal, { CustomizationGroup } from "./AddCustomizationModal";
import { useAuth } from "../../contexts/AuthContext";

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  badge?: string;
  available: boolean;
  customizationGroups?: CustomizationGroup[];
}

export default function BusinessMenu() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

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

  // Load menu items from localStorage on mount
  useEffect(() => {
    if (user?.email) {
      const storageKey = `menuItems_${user.email}`;
      const savedItems = localStorage.getItem(storageKey);
      if (savedItems) {
        try {
          setMenuItems(JSON.parse(savedItems));
        } catch (error) {
          console.error('Error loading menu items:', error);
        }
      }
    }
  }, [user?.email]);

  // Save menu items to localStorage whenever they change
  useEffect(() => {
    if (user?.email && menuItems.length >= 0) {
      const storageKey = `menuItems_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify(menuItems));
    }
  }, [menuItems, user?.email]);

  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: "",
    description: "",
    price: 0,
    category: "Silog",
    available: true,
    image: ""
  });

  const [newCategory, setNewCategory] = useState("");

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleAvailability = (id: number) => {
    setMenuItems(menuItems.map(item =>
      item.id === id ? { ...item, available: !item.available } : item
    ));
  };

  const deleteItem = (id: number) => {
    if (confirm("Delete this item? This action cannot be undone.")) {
      setMenuItems(menuItems.filter(item => item.id !== id));
    }
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
    if (editingItem) {
      setMenuItems(menuItems.map(item =>
        item.id === editingItem.id ? editingItem : item
      ));
      setShowEditItem(false);
      setEditingItem(null);
    }
  };

  const addNewItem = () => {
    const item: MenuItem = {
      id: Date.now(),
      name: newItem.name || "",
      description: newItem.description || "",
      price: newItem.price || 0,
      category: newItem.category || "Silog",
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

  const addNewCategory = () => {
    if (newCategory.trim()) {
      const id = newCategory.toLowerCase().replace(/\s+/g, '-');
      setCategories([...categories, { id, name: newCategory }]);
      setNewCategory("");
      setShowAddCategory(false);
    }
  };

  const handleDeleteCategory = (category: string) => {
    const categoryObj = categories.find(c => c.id === category);
    if (categoryObj && confirm(`Delete category "${categoryObj.name}"? All items in this category will also be deleted. This action cannot be undone.`)) {
      setCategories(categories.filter(c => c.id !== category));
      setMenuItems(menuItems.filter(i => i.category !== category));
      setSelectedCategory("all");
    }
  };

  const toggleBulkSelection = (id: number) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const bulkToggleAvailability = () => {
    setMenuItems(menuItems.map(item =>
      selectedItems.includes(item.id) ? { ...item, available: !item.available } : item
    ));
    setSelectedItems([]);
    setShowBulkActions(false);
  };

  const bulkDelete = () => {
    if (confirm(`Delete ${selectedItems.length} items? This action cannot be undone.`)) {
      setMenuItems(menuItems.filter(item => !selectedItems.includes(item.id)));
      setSelectedItems([]);
      setShowBulkActions(false);
    }
  };

  const pendingOrders = 5;

  const getBadgeColor = (badge?: string) => {
    switch (badge) {
      case "most-ordered": return "bg-[#E11D48] text-white";
      case "most-liked": return "bg-[#3B82F6] text-white";
      case "signature": return "bg-[#F59E0B] text-white";
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

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 bg-[#F8F9FA] w-full min-w-0">
        {/* Header */}
        <div className="bg-white px-3 lg:px-4 py-3 lg:py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 lg:gap-3 mb-0.5 lg:mb-1">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden flex-shrink-0"
            >
              <Menu className="w-5 h-5 lg:w-6 lg:h-6 text-[#121212]" />
            </button>
            <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[#121212]">Menu</h1>
          </div>
          <p className="text-xs lg:text-sm text-[#64748B] lg:ml-0 ml-7">
            {menuItems.length} items • {menuItems.filter(i => i.available).length} available
          </p>
        </div>

        {viewMode === "preview" ? (
          // CUSTOMER PREVIEW MODE
          <div className="min-h-screen">
            <div className="bg-[#FFF1F2] border-b-2 border-[#E11D48] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#E11D48]" />
                  <div>
                    <p className="font-bold text-[#E11D48] text-sm">Customer Preview</p>
                    <p className="text-xs text-[#BE123C]">How customers see your menu</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewMode("edit")}
                  className="px-3 py-1.5 bg-[#E11D48] text-white rounded-lg text-sm font-semibold"
                >
                  Exit
                </button>
              </div>
            </div>

            {/* Customer View Categories */}
            <div className="px-4 py-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === category.id
                        ? "bg-[#E11D48] text-white"
                        : "bg-[#F8F9FA] text-[#64748B] border border-[#E2E8F0]"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer View Menu Items */}
            <div className="p-4 space-y-3">
              {filteredItems.filter(item => item.available).length > 0 ? (
                filteredItems.filter(item => item.available).map((item) => (
                  <Card key={item.id} className="p-0 overflow-hidden border border-[#E2E8F0] bg-white">
                    <div className="flex items-start gap-3 p-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                        <ImageWithFallback
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-bold text-[#121212] text-base">{item.name}</h3>
                        </div>
                        {item.badge && (
                          <Badge className={`${getBadgeColor(item.badge)} text-xs mb-2 inline-flex items-center gap-1`}>
                            {getBadgeIcon(item.badge)}
                            {getBadgeLabel(item.badge)}
                          </Badge>
                        )}
                        <p className="text-sm text-[#64748B] mb-2 line-clamp-2">
                          {item.description}
                        </p>
                        <p className="text-xl font-bold text-[#E11D48]">₱{item.price}</p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-base text-[#64748B]">No available items in this category</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // EDIT MODE
          <>
            {/* Tab Navigation */}
            <div className="bg-white px-4 pt-3 sticky top-0 z-50">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode("edit")}
                  className={`flex-1 py-3 rounded-t-xl font-bold text-sm transition-all ${
                    viewMode === "edit"
                      ? "bg-[#E11D48] text-white"
                      : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  Edit Menu ({menuItems.length})
                </button>
                <button
                  onClick={() => setViewMode("preview")}
                  className={`flex-1 py-3 rounded-t-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    viewMode === "preview"
                      ? "bg-[#E11D48] text-white"
                      : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white px-4 pb-3 sticky top-[52px] z-40 border-b border-[#E2E8F0]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-[#E2E8F0] rounded-xl text-sm bg-[#F8F9FA]"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="px-3 lg:px-4 py-3 bg-white border-b border-[#E2E8F0]">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    selectedCategory === "all"
                      ? "bg-[#E11D48] text-white"
                      : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                  }`}
                >
                  All Items
                </button>
                {categories.filter(c => c.id !== "All").map((category) => (
                  <div key={category.id} className="relative group flex-shrink-0">
                    <button
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-4 py-2 pr-8 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                        selectedCategory === category.id
                          ? "bg-[#E11D48] text-white"
                          : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                      }`}
                    >
                      {category.name}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(category.id);
                      }}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${
                        selectedCategory === category.id
                          ? "bg-white/20 hover:bg-white/30 text-white"
                          : "bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[#64748B]"
                      }`}
                      title="Delete category"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* Add Category Button */}
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 border-2 border-dashed border-[#E11D48] text-[#E11D48] hover:bg-[#FFF1F2] flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
              </div>
            </div>

            {/* Add Item Button */}
            <div className="px-4 py-3">
              <Button
                onClick={() => setShowAddItem(true)}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-5 text-sm font-bold rounded-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add New Menu Item
              </Button>
            </div>

            {/* Menu Items - Card Layout */}
            <div className="px-4 pb-6 space-y-3">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <Card 
                    key={item.id} 
                    className={`p-0 overflow-hidden bg-white border border-[#E2E8F0] ${selectedItems.includes(item.id) ? 'ring-2 ring-[#3B82F6]' : ''}`}
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
                                ? 'bg-[#3B82F6] border-[#3B82F6]'
                                : 'border-[#CBD5E1]'
                            }`}
                          >
                            {selectedItems.includes(item.id) && <Check className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-white" />}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                              <h3 className="font-bold text-[#121212] text-sm lg:text-base">{item.name}</h3>
                              {item.badge && (
                                <Badge className={`${getBadgeColor(item.badge)} text-[9px] lg:text-[10px] px-1.5 lg:px-2 py-0.5`}>
                                  {getBadgeLabel(item.badge)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right ml-2 lg:ml-3">
                          <p className="text-base lg:text-lg font-bold text-[#E11D48]">₱{item.price}</p>
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
                          <p className="text-xs lg:text-sm text-[#64748B] line-clamp-3 mb-2 lg:mb-3">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Status Badge and Customizations */}
                      <div className="flex items-center justify-between mt-2 lg:mt-3 ml-5 lg:ml-7">
                        <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                          {item.available ? (
                            <Badge className="bg-[#10B981] text-white text-[10px] lg:text-xs px-2 lg:px-3 py-0.5 lg:py-1">
                              Available
                            </Badge>
                          ) : (
                            <Badge className="bg-[#64748B] text-white text-[10px] lg:text-xs px-2 lg:px-3 py-0.5 lg:py-1">
                              Hidden
                            </Badge>
                          )}
                          <span className="text-[10px] lg:text-xs text-[#94A3B8]">Category: {item.category}</span>
                          {item.customizationGroups && item.customizationGroups.length > 0 && (
                            <Badge className="bg-[#3B82F6] text-white text-[10px] lg:text-xs px-2 lg:px-3 py-0.5 lg:py-1">
                              {item.customizationGroups.length} {item.customizationGroups.length === 1 ? 'Group' : 'Groups'}
                            </Badge>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleManageCustomizations(item, e)}
                          className="text-[10px] lg:text-xs font-bold text-[#3B82F6] hover:text-[#2563EB] flex items-center gap-1"
                        >
                          <Settings className="w-3 h-3 lg:w-4 lg:h-4" />
                          {item.customizationGroups && item.customizationGroups.length > 0 ? 'Edit Add-ons' : 'Add Add-ons'}
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-[#64748B] mb-4">No items found</p>
                  <Button
                    onClick={() => setShowAddItem(true)}
                    className="bg-[#E11D48] hover:bg-[#BE123C] uppercase"
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
                  className="bg-[#3B82F6] text-white rounded-full shadow-2xl px-6 py-4 font-bold text-sm flex items-center gap-2"
                >
                  {selectedItems.length} Selected
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#121212]">Add New Item</h2>
                <button onClick={() => setShowAddItem(false)}>
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Item Photo</label>
                  <div className="h-48 rounded-2xl overflow-hidden mb-3 border-2 border-dashed border-[#E2E8F0] bg-[#F8F9FA] flex items-center justify-center">
                    <div className="text-center">
                      <ImageIcon className="w-12 h-12 text-[#CBD5E1] mx-auto mb-2" />
                      <p className="text-sm text-[#64748B]">No image selected</p>
                    </div>
                  </div>
                  <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </Button>
                  <p className="text-xs text-[#64748B] mt-2 text-center">Recommended: 800x800px, max 5MB</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Item Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                    placeholder="e.g., Chicken Adobo"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Description</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl min-h-[100px]"
                    placeholder="Describe your dish, ingredients, or what makes it special"
                  />
                  <p className="text-xs text-[#64748B] mt-1">Help customers understand what they're ordering</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Price (₱) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[#64748B]">₱</span>
                    <input
                      type="number"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                      className="w-full p-3 pl-10 border-2 border-[#E2E8F0] rounded-xl text-xl font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Category *</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                  >
                    {categories.filter(c => c.id !== "All").map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl">
                  <div>
                    <p className="font-bold text-[#121212]">Make available immediately</p>
                    <p className="text-xs text-[#64748B]">Customers can order this item right away</p>
                  </div>
                  <button
                    onClick={() => setNewItem({ ...newItem, available: !newItem.available })}
                    className={`w-14 h-8 rounded-full transition-all ${
                      newItem.available ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                        newItem.available ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <Button
                  onClick={addNewItem}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6 text-base"
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
            <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#121212]">Edit Item</h2>
                <button onClick={() => setShowEditItem(false)}>
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Item Photo</label>
                  <div className="h-48 rounded-2xl overflow-hidden mb-3 border-2 border-[#E2E8F0]">
                    <ImageWithFallback
                      src={editingItem.image}
                      alt={editingItem.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                    <Upload className="w-4 h-4 mr-2" />
                    Change Photo
                  </Button>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Item Name *</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Description</label>
                  <textarea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl min-h-[100px]"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Price (₱) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[#64748B]">₱</span>
                    <input
                      type="number"
                      value={editingItem.price}
                      onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                      className="w-full p-3 pl-10 border-2 border-[#E2E8F0] rounded-xl text-xl font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Category *</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                  >
                    {categories.filter(c => c.id !== "All").map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Badge (Optional)</label>
                  <p className="text-xs text-[#64748B] mb-3">Highlight special items to attract customers</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: undefined })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all ${
                        !editingItem.badge
                          ? "border-[#E11D48] bg-[#FFF1F2] text-[#E11D48]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      No Badge
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "most-ordered" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "most-ordered"
                          ? "border-[#E11D48] bg-[#FFF1F2] text-[#E11D48]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      Most Ordered
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "most-liked" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "most-liked"
                          ? "border-[#3B82F6] bg-[#EFF6FF] text-[#3B82F6]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <Star className="w-4 h-4" />
                      Most Liked
                    </button>
                    <button
                      onClick={() => setEditingItem({ ...editingItem, badge: "signature" })}
                      className={`p-3 rounded-xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${
                        editingItem.badge === "signature"
                          ? "border-[#F59E0B] bg-[#FEF3C7] text-[#F59E0B]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      Signature
                    </button>
                  </div>
                </div>

                <Button
                  onClick={saveEditedItem}
                  className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6 text-base"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Category Modal */}
        {showAddCategory && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-white p-6 max-w-sm w-full">
              <h3 className="text-xl font-bold text-[#121212] mb-4">Add Category</h3>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl mb-4 font-semibold"
                placeholder="e.g., Breakfast Meals"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowAddCategory(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={addNewCategory}
                  className="flex-1 bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                  disabled={!newCategory.trim()}
                >
                  Add
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Actions Modal */}
        {showBulkActions && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-white w-full rounded-t-3xl p-5">
              <h3 className="text-xl font-bold text-[#121212] mb-4">
                Bulk Actions ({selectedItems.length} items)
              </h3>
              <div className="space-y-2">
                <Button
                  onClick={bulkToggleAvailability}
                  className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-4"
                >
                  Toggle Availability
                </Button>
                <Button
                  onClick={bulkDelete}
                  variant="outline"
                  className="w-full border-[#E11D48] text-[#E11D48] uppercase py-4"
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
                  className="w-full uppercase py-4"
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
      </div>
    </div>
  );
}