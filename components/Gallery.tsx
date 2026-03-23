
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GalleryItem, getUserGallery, getCommunityGallery, getTrashGallery, deleteImageFromLocal, softDeleteImage, restoreImage, updateImageMetadata, duplicateImageToFolder, toggleFavoriteStatus, deleteMultipleImages, moveMultipleImages, emptyTrash } from '../services/localDb';
import { Trash2, Download, RefreshCw, Loader2, ExternalLink, AlertTriangle, Folder, FolderPlus, Globe, Lock, MoreVertical, FolderInput, CheckCircle2, User, Copy, MoveRight, X, Wand2, Shirt, Camera, Move, Filter, Star, CheckSquare, Square, MousePointer2, ChevronLeft, ChevronRight, RotateCcw, Layers, ZoomIn } from 'lucide-react';

interface GalleryProps {
  userId: string;
  isActive?: boolean; // Trigger refresh
  onUseImage?: (base64: string, destination: 'TRY_ON' | 'MODEL_MV' | 'MODEL_POSE') => void;
}

type ViewMode = 'MY_GALLERY' | 'COMMUNITY';

// Helper for CORS-friendly image conversion using Canvas
const urlToBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL('image/png');
        resolve(dataURL);
      } catch (err) {
        // Tainted canvas or other error
        reject(err);
      }
    };
    img.onerror = (err) => reject(new Error('Failed to load image for conversion'));
  });
};

const Gallery: React.FC<GalleryProps> = ({ userId, isActive, onUseImage }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('MY_GALLERY');
  const [images, setImages] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showReference, setShowReference] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const IMAGES_PER_PAGE = 20;

  // Track broken images to hide them
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  // Folder State
  const [folders, setFolders] = useState<string[]>(['All']);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // User Filter State
  const [filterUserId, setFilterUserId] = useState<string | null>(null);

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<GalleryItem | null>(null); // Null if bulk delete
  const [bulkDeletableIds, setBulkDeletableIds] = useState<string[]>([]); // New: Stores filtered IDs for bulk delete
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Move/Copy Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false); 
  const [itemToMove, setItemToMove] = useState<GalleryItem | null>(null); // Null if bulk move
  const [targetFolder, setTargetFolder] = useState('');

  // Active Menu State (Use Image Menu)
  const [activeUseMenuId, setActiveUseMenuId] = useState<string | null>(null);

  // Undo Toast State
  const [undoToast, setUndoToast] = useState<{ visible: boolean; items: GalleryItem[] } | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  // --- Folder Management Helpers ---
  const loadCustomFolders = (): string[] => {
      try {
          const stored = localStorage.getItem('guest_custom_folders');
          return stored ? JSON.parse(stored) : [];
      } catch (e) {
          return [];
      }
  };

  const saveCustomFolders = (newFolders: string[]) => {
      localStorage.setItem('guest_custom_folders', JSON.stringify(newFolders));
  };

  const fetchData = async () => {
    setLoading(true);
    setActiveUseMenuId(null);
    setFailedImageIds(new Set()); 
    setFilterUserId(null); // Reset user filter on main mode switch
    setSelectedIds(new Set()); // Reset selection
    setIsSelectionMode(false);
    setCurrentPage(1); // Reset page on refresh/filter change
    
    if (viewMode === 'MY_GALLERY') {
        if (activeFolder === 'Trash') {
            const data = await getTrashGallery(userId);
            setImages(data);
        } else {
            const data = await getUserGallery(userId);
            setImages(data);
            
            // Merge derived folders with persistent custom folders
            const derivedFolders = new Set<string>(['All']);
            
            // 1. Folders from images (excluding trash, already handled by getUserGallery)
            data.forEach(img => {
                if (img.folderName && img.folderName !== 'Trash') derivedFolders.add(img.folderName);
            });

            // 2. Persistent folders from LocalStorage
            const customFolders = loadCustomFolders();
            customFolders.forEach(f => derivedFolders.add(f));

            setFolders(Array.from(derivedFolders).sort());
        }
    } else {
        const data = await getCommunityGallery();
        setImages(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isActive) {
        fetchData();
    }
  }, [isActive, viewMode, activeFolder]); // Trigger on folder change too

  // Handle outside click to close menus
  useEffect(() => {
      const handleClickOutside = () => setActiveUseMenuId(null);
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // --- Filtering Logic (Optimized with useMemo) ---
  const filteredImages = useMemo(() => {
      const result = images.filter(img => {
          // 1. Folder Filtering
          let folderMatch = true;
          if (activeFolder === 'Trash') {
              folderMatch = true; // All fetched items are trash
          } else if (activeFolder === 'Favorites') {
              folderMatch = img.isFavorite;
          } else {
              folderMatch = viewMode === 'COMMUNITY' || activeFolder === 'All' || img.folderName === activeFolder;
          }
          
          // 2. User Filtering
          const userMatch = !filterUserId || img.userId === filterUserId;

          // 3. Broken Image Filtering (Upfront optimization)
          const notBroken = !failedImageIds.has(img.id);

          return folderMatch && userMatch && notBroken;
      });
      return result;
  }, [images, activeFolder, viewMode, filterUserId, failedImageIds]);

  // Derived pagination items
  const totalPages = Math.ceil(filteredImages.length / IMAGES_PER_PAGE);
  const paginatedImages = useMemo(() => {
      return filteredImages.slice((currentPage - 1) * IMAGES_PER_PAGE, currentPage * IMAGES_PER_PAGE);
  }, [filteredImages, currentPage]);

  // Handle page reset when total pages decrease
  useEffect(() => {
      if (currentPage > totalPages && totalPages > 0) {
          setCurrentPage(totalPages);
      }
  }, [totalPages, currentPage]);

  // --- Modal Navigation Logic ---
  const handleNavigateModal = (direction: 'next' | 'prev') => {
    if (!selectedImage) return;
    
    // Filter out failed images for navigation to avoid dead ends or closings
    const validList = filteredImages; // Navigation works across all filtered images, not just current page
    if (validList.length <= 1) return;
    
    const currentIndex = validList.findIndex(img => img.id === selectedImage.id);
    if (currentIndex === -1) return;
    
    let newIndex;
    if (direction === 'prev') {
        newIndex = currentIndex === 0 ? validList.length - 1 : currentIndex - 1;
    } else {
        newIndex = currentIndex === validList.length - 1 ? 0 : currentIndex + 1;
    }
    
    setSelectedImage(validList[newIndex]);
  };

  // Keyboard listener for modal navigation
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!selectedImage) return;
          if (e.key === 'ArrowLeft') handleNavigateModal('prev');
          if (e.key === 'ArrowRight') handleNavigateModal('next');
          if (e.key === 'Escape') setSelectedImage(null);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, filteredImages]);

  useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
      setShowReference(false);
  }, [selectedImage]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(1, zoom * delta), 10);
    
    if (newZoom <= 1.05) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(newZoom);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan(prev => ({
        x: prev.x + e.movementX / zoom,
        y: prev.y + e.movementY / zoom
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- Safe Download Logic (Canvas Proxy -> Fallback) ---
  const handleDownload = async (e: React.MouseEvent | null, url: string) => {
    if (e) e.stopPropagation();
    try {
        // Try Canvas method first to get a clean blob for download name control
        const base64 = await urlToBase64(url);
        
        const link = document.createElement('a');
        link.href = base64;
        link.download = `fs-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.warn("Canvas download failed, falling back to direct link", err);
        // Fallback: Direct Link (Browser handles it)
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.download = `fs-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  // --- Selection Logic ---
  const toggleSelection = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleSelectAll = () => {
      // In pagination mode, "Select All" should probably select all on the current page or all filtered?
      // Usually "All on current page" is safer, but "All filtered" is more powerful. 
      // Let's do all filtered for admin convenience.
      const ids = filteredImages.map(img => img.id);
      setSelectedIds(new Set(ids));
  };

  const handleDeselectAll = () => {
      setSelectedIds(new Set());
  };

  // --- Folder Logic ---
  const handleCreateFolder = () => {
      if (!newFolderName.trim()) return;
      const name = newFolderName.trim();
      
      // Update State
      if (!folders.includes(name)) {
          setFolders(prev => [...prev, name].sort());
          
          // Persist to LocalStorage
          const currentCustom = loadCustomFolders();
          if (!currentCustom.includes(name)) {
              saveCustomFolders([...currentCustom, name]);
          }
      }
      
      setNewFolderName('');
      setIsNewFolderModalOpen(false);
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderName: string) => {
      e.stopPropagation();
      if (folderName === 'All' || folderName === 'Favorites' || folderName === 'Trash') return;

      if (!window.confirm(`'${folderName}' 폴더를 삭제하시겠습니까?\n\n폴더 내부의 이미지는 삭제되지 않고 'All' 폴더로 이동됩니다.`)) {
          return;
      }

      // 1. Identify images in this folder
      const imagesInFolder = images.filter(img => img.folderName === folderName);
      
      // 2. Move them to 'All' in Firebase
      if (imagesInFolder.length > 0) {
          const idsToMove = imagesInFolder.map(img => img.id);
          await moveMultipleImages(idsToMove, 'All');
          
          // Update Local Image State
          setImages(prev => prev.map(img => 
              img.folderName === folderName ? { ...img, folderName: 'All' } : img
          ));
      }

      // 3. Remove from LocalStorage
      const currentCustom = loadCustomFolders();
      const updatedCustom = currentCustom.filter(f => f !== folderName);
      saveCustomFolders(updatedCustom);

      // 4. Update Folder State
      setFolders(prev => prev.filter(f => f !== folderName));

      // 5. Switch view if needed
      if (activeFolder === folderName) {
          setActiveFolder('All');
      }
  };

  const handleFolderSelectionConfirm = () => {
      if (!targetFolder) return;
      setIsMoveModalOpen(false);
      
      // If bulk move, skip to execution directly or open confirmation?
      // Reusing ActionModalOpen for logic branching
      setIsActionModalOpen(true);
  };

  const executeMove = async () => {
      if (!targetFolder) return;
      const folderName = targetFolder.trim();
      
      if (itemToMove) {
          // Single Move
          const success = await updateImageMetadata(itemToMove.id, { folderName: folderName });
          if (success) {
              setImages(prev => prev.map(img => img.id === itemToMove.id ? { ...img, folderName: folderName } : img));
          }
      } else {
          // Bulk Move
          const idsToMove: string[] = Array.from(selectedIds);
          const success = await moveMultipleImages(idsToMove, folderName);
          if (success) {
              setImages(prev => prev.map(img => selectedIds.has(img.id) ? { ...img, folderName: folderName } : img));
              setSelectedIds(new Set());
              setIsSelectionMode(false);
          }
      }

      // Add to persistent folders if new
      if (!folders.includes(folderName)) {
          setFolders(prev => [...prev, folderName].sort());
          const currentCustom = loadCustomFolders();
          if (!currentCustom.includes(folderName)) {
              saveCustomFolders([...currentCustom, folderName]);
          }
      }
      resetMoveState();
  };

  const executeCopy = async () => {
      if (!itemToMove) {
          // Fallback to Move for bulk in this UI implementation for safety/simplicity
          await executeMove();
          return;
      }

      const folderName = targetFolder.trim();
      const newItem = await duplicateImageToFolder(itemToMove, folderName);
      if (newItem) {
          setImages(prev => [newItem, ...prev]);
          if (!folders.includes(folderName)) {
              setFolders(prev => [...prev, folderName].sort());
              const currentCustom = loadCustomFolders();
              if (!currentCustom.includes(folderName)) {
                  saveCustomFolders([...currentCustom, folderName]);
              }
          }
      }
      resetMoveState();
  };

  const resetMoveState = () => {
      setIsActionModalOpen(false);
      setItemToMove(null);
      setTargetFolder('');
  };
  
  // --- Share Logic ---
  const handleTogglePublic = async (e: React.MouseEvent, item: GalleryItem) => {
      e.stopPropagation();
      const newStatus = !item.isPublic;
      const success = await updateImageMetadata(item.id, { isPublic: newStatus });
      if (success) {
          setImages(prev => prev.map(img => img.id === item.id ? { ...img, isPublic: newStatus } : img));
      }
  };

  // --- Favorite Logic ---
  const handleToggleFavorite = async (e: React.MouseEvent, item: GalleryItem) => {
      e.stopPropagation();
      const newStatus = !item.isFavorite;
      const success = await toggleFavoriteStatus(item.id, item.isFavorite);
      if (success) {
          setImages(prev => prev.map(img => img.id === item.id ? { ...img, isFavorite: newStatus } : img));
      }
  };

  // --- UNDO TOAST HANDLER ---
  const triggerUndoToast = (items: GalleryItem[]) => {
      // Clear existing timeout
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      
      setUndoToast({ visible: true, items });
      
      // Auto hide after 5 seconds
      undoTimeoutRef.current = window.setTimeout(() => {
          setUndoToast(null);
      }, 5000);
  };

  const handleUndo = async () => {
      if (!undoToast) return;
      
      const itemsToRestore = undoToast.items;
      setUndoToast(null);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

      // Optimistic UI Restore
      setImages(prev => [...itemsToRestore, ...prev].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));

      // API Call
      for (const item of itemsToRestore) {
          await restoreImage(item.id);
      }
  };

  // --- Restore Logic (From Trash) ---
  const handleRestoreClick = async (e: React.MouseEvent, item: GalleryItem) => {
      e.stopPropagation();
      await restoreImage(item.id);
      // Remove from Trash view
      setImages(prev => prev.filter(img => img.id !== item.id));
  };

  // --- Delete Logic ---
  const handleDeleteClick = (e: React.MouseEvent, item: GalleryItem) => {
    e.stopPropagation();
    
    // If in Trash -> Permanent Delete Confirmation
    if (activeFolder === 'Trash') {
        setItemToDelete(item);
        setIsDeleteModalOpen(true);
        return;
    }

    // SAFEGUARD: Prevent deleting favorites in normal view
    if (item.isFavorite) {
        alert("즐겨찾기 된 이미지는 삭제할 수 없습니다. 즐겨찾기를 먼저 해제해주세요.");
        return;
    }

    // Soft Delete: Instant UI removal + Undo Toast
    // 1. Optimistic Update
    setImages(prev => prev.filter(img => img.id !== item.id));
    if (selectedImage?.id === item.id) setSelectedImage(null);

    // 2. Trigger Toast
    triggerUndoToast([item]);

    // 3. API Call
    softDeleteImage(item.id);
  };

  const handleBulkDeleteClick = () => {
      if (selectedIds.size === 0) return;

      const selectedItems = images.filter(img => selectedIds.has(img.id));

      if (activeFolder === 'Trash') {
          // Bulk Hard Delete
          setBulkDeletableIds(selectedItems.map(img => img.id));
          setItemToDelete(null); // Indicator for Bulk
          setIsDeleteModalOpen(true);
          return;
      }

      const favorites = selectedItems.filter(img => img.isFavorite);
      const deletables = selectedItems.filter(img => !img.isFavorite);

      // SAFEGUARD: Bulk delete protections
      if (deletables.length === 0) {
          alert("선택한 이미지는 모두 즐겨찾기 상태여서 삭제할 수 없습니다.");
          return;
      }

      // Soft Delete Bulk
      // 1. Optimistic UI
      setImages(prev => prev.filter(img => !selectedIds.has(img.id) || favorites.find(f => f.id === img.id)));
      setSelectedIds(new Set());
      setIsSelectionMode(false);

      // 2. Trigger Toast
      triggerUndoToast(deletables);

      // 3. API Call
      deletables.forEach(item => softDeleteImage(item.id));
  };

  // --- Empty Trash ---
  const handleEmptyTrash = async () => {
      if (!window.confirm("Are you sure you want to delete ALL items in the Trash? This cannot be undone.")) return;
      
      setLoading(true);
      const success = await emptyTrash(userId);
      if (success) {
          setImages([]);
      }
      setLoading(false);
  };

  const confirmDelete = async () => {
    // This function is ONLY for Hard Delete (from Trash)
    setIsDeleting(true);
    
    if (itemToDelete) {
        // Single Hard Delete
        const success = await deleteImageFromLocal(itemToDelete.id);
        if (success) {
          setImages(prev => prev.filter(img => img.id !== itemToDelete.id));
          if (selectedImage?.id === itemToDelete.id) {
              setSelectedImage(null);
          }
        }
    } else {
        // Bulk Hard Delete
        const itemsToDelete = images
            .filter(img => bulkDeletableIds.includes(img.id))
            .map(img => ({
                id: img.id,
                storagePath: img.storagePath
            }));
        
        const success = await deleteMultipleImages(itemsToDelete);
        if (success) {
            setImages(prev => prev.filter(img => !bulkDeletableIds.includes(img.id)));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
        }
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    setItemToDelete(null);
    setBulkDeletableIds([]);
  };

  // --- Bulk Download Logic ---
  const handleBulkDownload = async () => {
      const items = images.filter(img => selectedIds.has(img.id));
      for (const item of items) {
          await handleDownload(null, item.url);
          // Small delay to prevent browser blocking multiple downloads
          await new Promise(r => setTimeout(r, 500));
      }
  };

  // --- Bulk Move Trigger ---
  const handleBulkMoveClick = () => {
      if (selectedIds.size === 0) return;
      setItemToMove(null); // Indicator for Bulk
      setIsMoveModalOpen(true);
  };

  // --- Send To Tab Logic ---
  const handleSendTo = async (destination: 'TRY_ON' | 'MODEL_MV' | 'MODEL_POSE', item: GalleryItem) => {
      if (!onUseImage) return;
      setActiveUseMenuId(null);
      
      // Use URL directly to prevent CORS issues with Canvas
      onUseImage(item.url, destination);
  };

  return (
    <div className="flex h-full bg-[#0f172a] text-slate-200 relative">
      
      {/* Sidebar (Only for My Gallery) */}
      {viewMode === 'MY_GALLERY' && (
          <div className="w-60 bg-[#1e293b] border-r border-slate-700 flex flex-col shrink-0 relative z-30">
              <div className="p-4 border-b border-slate-700">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Folders</h3>
                  <button 
                    onClick={() => setIsNewFolderModalOpen(true)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-blue-400 flex items-center justify-center gap-2 transition-colors"
                  >
                      <FolderPlus size={16} /> New Folder
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar pb-20">
                  {/* Default All */}
                  <button
                    onClick={() => setActiveFolder('All')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${activeFolder === 'All' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                  >
                      <div className="flex items-center gap-2 truncate">
                          <Folder size={16} className={activeFolder === 'All' ? 'text-blue-200' : 'text-slate-500'} />
                          <span className="truncate">All Images</span>
                      </div>
                  </button>

                  {/* Favorites Menu */}
                  <button
                    onClick={() => setActiveFolder('Favorites')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${activeFolder === 'Favorites' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                  >
                      <div className="flex items-center gap-2 truncate">
                          <Star size={16} className={activeFolder === 'Favorites' ? 'text-white fill-white' : 'text-slate-500'} />
                          <span className="truncate">Favorites</span>
                      </div>
                  </button>

                  <div className="my-2 border-t border-slate-700/50"></div>

                  {folders.filter(f => f !== 'All').map(folder => (
                      <div 
                        key={folder}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors group cursor-pointer ${activeFolder === folder ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                        onClick={() => setActiveFolder(folder)}
                      >
                          <div className="flex items-center gap-2 truncate flex-1">
                              <Folder size={16} className={activeFolder === folder ? 'text-blue-200' : 'text-slate-500'} />
                              <span className="truncate">{folder}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                             {/* Delete Folder Button - Show on Hover */}
                             <button
                                onClick={(e) => handleDeleteFolder(e, folder)}
                                className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${activeFolder === folder ? 'hover:bg-blue-500 text-blue-200 hover:text-white' : 'hover:bg-slate-700 text-slate-500 hover:text-red-400'}`}
                                title="Delete Folder"
                             >
                                 <Trash2 size={14} />
                             </button>
                          </div>
                      </div>
                  ))}
              </div>

              {/* Trash - Sticky Bottom */}
              <div className="p-3 border-t border-slate-700 bg-[#1e293b]">
                  <button
                    onClick={() => setActiveFolder('Trash')}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm flex items-center justify-between transition-colors group ${activeFolder === 'Trash' ? 'bg-red-900/80 text-red-200 border border-red-800 shadow-inner' : 'text-slate-400 hover:bg-slate-800 hover:text-red-300'}`}
                  >
                      <div className="flex items-center gap-2 truncate">
                          <Trash2 size={18} className={activeFolder === 'Trash' ? "fill-red-900/50" : ""} />
                          <span className="truncate font-medium">Trash Bin</span>
                      </div>
                      <span className="text-xs opacity-70 group-hover:opacity-100">
                          {activeFolder === 'Trash' ? images.length : ''}
                      </span>
                  </button>
              </div>
          </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Header */}
          <div className="h-16 border-b border-slate-700 bg-[#1e293b] flex items-center justify-between px-6 shrink-0 z-20">
              <div className="flex bg-slate-800 p-1 rounded-lg">
                  <button 
                    onClick={() => setViewMode('MY_GALLERY')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'MY_GALLERY' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      All Images (Admin)
                  </button>
                  <button 
                    onClick={() => setViewMode('COMMUNITY')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'COMMUNITY' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      Community
                  </button>
              </div>
              
              <div className="flex items-center gap-4">
                 {/* Empty Trash Button */}
                 {activeFolder === 'Trash' && filteredImages.length > 0 && (
                     <button 
                        onClick={handleEmptyTrash}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs flex items-center gap-2 transition-colors shadow-lg animate-pulse"
                     >
                        <Trash2 size={14} fill="currentColor" /> Empty Trash
                     </button>
                 )}

                 {/* Selection Mode Toggle */}
                 {viewMode === 'MY_GALLERY' && filteredImages.length > 0 && (
                     <div className="flex items-center gap-2 mr-2 border-r border-slate-600 pr-4">
                         {isSelectionMode ? (
                             <>
                                <span className="text-sm font-bold text-blue-400">{selectedIds.size} Selected</span>
                                <button onClick={handleSelectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">All</button>
                                <button onClick={handleDeselectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">None</button>
                                <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="p-1.5 hover:bg-slate-700 rounded-full text-slate-400"><X size={18} /></button>
                             </>
                         ) : (
                             <button 
                                onClick={() => setIsSelectionMode(true)}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm flex items-center gap-2 transition-colors"
                             >
                                <CheckSquare size={16} /> Select
                             </button>
                         )}
                     </div>
                 )}

                 {filterUserId && (
                     <div className="flex items-center gap-2 bg-blue-900/50 px-3 py-1 rounded-full border border-blue-700/50">
                         <span className="text-xs text-blue-200">Filtered by User: {filterUserId.split('_').pop()}</span>
                         <button onClick={() => setFilterUserId(null)} className="p-0.5 hover:bg-blue-800 rounded-full"><X size={12} /></button>
                     </div>
                 )}
                 <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    {viewMode === 'MY_GALLERY' ? (
                        activeFolder === 'Favorites' ? <><Star size={20} className="text-amber-400 fill-amber-400"/> Favorites</> : 
                        activeFolder === 'Trash' ? <><Trash2 size={20} className="text-red-400"/> Trash Bin</> : 
                        activeFolder
                    ) : 'Community Feed'}
                 </h2>
                 <button 
                    onClick={fetchData} 
                    disabled={loading}
                    className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
                 >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                 </button>
              </div>
          </div>

          {/* Grid with Content Visibility Optimization */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0f172a] custom-scrollbar pb-32 relative">
              {/* Undo Toast */}
              {undoToast && (
                  <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[250] animate-in slide-in-from-bottom-4 duration-300 w-full max-w-md">
                      <div className="bg-slate-900 border border-slate-600 text-slate-200 p-4 rounded-xl shadow-2xl flex flex-col gap-3 relative overflow-hidden">
                          {/* Timer Bar */}
                          <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-[width_5s_linear_forwards] w-full origin-left"></div>
                          
                          <div className="flex items-center justify-between">
                              <span className="text-sm font-medium flex items-center gap-2">
                                  <Trash2 size={16} className="text-red-400" />
                                  {undoToast.items.length} item(s) moved to trash
                              </span>
                              <div className="flex items-center gap-3">
                                <button 
                                    onClick={handleUndo}
                                    className="text-blue-400 hover:text-blue-300 font-bold text-sm flex items-center gap-1 bg-blue-900/30 px-3 py-1.5 rounded-lg border border-blue-800 hover:bg-blue-900/50 transition-colors"
                                >
                                    <RotateCcw size={14} /> UNDO
                                </button>
                                <button 
                                    onClick={() => setUndoToast(null)}
                                    className="text-slate-500 hover:text-slate-300"
                                >
                                    <X size={16} />
                                </button>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {loading && filteredImages.length === 0 ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="animate-spin text-blue-500" size={32} />
                  </div>
              ) : filteredImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                      {activeFolder === 'Trash' ? (
                          <>
                            <Trash2 size={48} className="mb-4 opacity-30" />
                            <p>Trash is empty.</p>
                          </>
                      ) : (
                          <>
                            <Folder size={48} className="mb-4 opacity-50" />
                            <p>No images found.</p>
                          </>
                      )}
                  </div>
              ) : (
                  <>
                    <div 
                      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                      style={{ contentVisibility: 'auto' }} 
                    >
                        {paginatedImages.map(item => {
                            const isSelected = selectedIds.has(item.id);

                            return (
                            <div 
                              key={item.id}
                              className={`group bg-[#1e293b] rounded-xl overflow-hidden border transition-all shadow-md hover:shadow-xl flex flex-col h-auto 
                                  ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : item.isFavorite ? 'border-amber-500/50' : 'border-slate-800 hover:border-blue-500'}
                              `}
                              onClick={isSelectionMode ? (e) => toggleSelection(e, item.id) : undefined}
                            >
                                {/* 1. Image Area - Click to View or Select */}
                                <div 
                                  className="relative aspect-[3/4] bg-black cursor-pointer overflow-hidden"
                                  onClick={!isSelectionMode ? () => setSelectedImage(item) : undefined}
                                >
                                    <img 
                                      src={item.url} 
                                      alt="Gallery Item" 
                                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${activeFolder === 'Trash' ? 'grayscale opacity-70' : ''}`}
                                      loading="lazy" 
                                      onError={() => {
                                          setFailedImageIds(prev => {
                                              const next = new Set(prev);
                                              next.add(item.id);
                                              return next;
                                          });
                                      }}
                                    />
                                    
                                    {/* Trash Overlay Indicator */}
                                    {activeFolder === 'Trash' && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                            <Trash2 size={64} className="text-red-500" />
                                        </div>
                                    )}
                                    
                                    {/* Selection Checkbox Overlay */}
                                    {isSelectionMode && (
                                        <div className="absolute top-2 left-2 z-20">
                                            <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors shadow-sm ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-black/50 border-white/30 backdrop-blur'}`}>
                                                {isSelected && <CheckSquare size={14} className="text-white" />}
                                            </div>
                                        </div>
                                    )}

                                    {/* Folder Info Badge (Only show in All or Favorites view) */}
                                    {(!isSelectionMode && (activeFolder === 'All' || activeFolder === 'Favorites') && item.folderName) && (
                                        <div className="absolute top-2 left-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur border border-white/10 z-10 flex items-center gap-1 opacity-80 hover:opacity-100">
                                            <Folder size={8} /> {item.folderName}
                                        </div>
                                    )}

                                    {/* Public Badge */}
                                    {item.isPublic && (
                                        <div className={`absolute top-2 ${!isSelectionMode && (activeFolder === 'All' || activeFolder === 'Favorites') ? 'left-auto right-2' : 'left-2'} bg-emerald-600/90 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur flex items-center gap-1 z-10 shadow-sm`}>
                                            <Globe size={10} /> Public
                                        </div>
                                    )}

                                    {/* Resolution Badge */}
                                    {item.resolution && item.resolution !== '1K' && (
                                        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur border border-white/10 z-10">
                                            {item.resolution}
                                        </div>
                                    )}
                                </div>
                                
                                {/* 2. Action Bar (Footer) - Separated from Image */}
                                <div className={`p-3 border-t border-slate-700 bg-[#1e293b] flex flex-col gap-2 ${isSelectionMode ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {/* Top Row: User & Date */}
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <div 
                                            className="flex items-center gap-1.5 truncate max-w-[60%] hover:text-blue-400 cursor-pointer transition-colors"
                                            onClick={(e) => {
                                                if (item.userId) {
                                                    e.stopPropagation();
                                                    setFilterUserId(filterUserId === item.userId ? null : item.userId);
                                                }
                                            }}
                                            title={item.userId || 'Unknown'}
                                        >
                                            <User size={10} /> 
                                            <span className="truncate">{item.userId ? item.userId.split('_').pop() : 'Unknown'}</span>
                                        </div>
                                        <span className="opacity-70">{new Date(item.timestamp || 0).toLocaleDateString()}</span>
                                    </div>

                                    {/* Bottom Row: Action Buttons */}
                                    <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-800">
                                         {/* Left: File Actions */}
                                         <div className="flex items-center gap-1">
                                             {viewMode === 'MY_GALLERY' && activeFolder !== 'Trash' && (
                                                  <button 
                                                      onClick={(e) => handleToggleFavorite(e, item)}
                                                      className={`p-1.5 rounded transition-colors ${item.isFavorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-400 hover:text-yellow-400 hover:bg-slate-700'}`}
                                                      title="Toggle Favorite"
                                                  >
                                                      <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
                                                  </button>
                                             )}
                                             <button 
                                                  onClick={(e) => handleDownload(e, item.url)}
                                                  className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors"
                                                  title="Download"
                                             >
                                                 <Download size={14} />
                                             </button>
                                             {viewMode === 'MY_GALLERY' && (
                                                 activeFolder === 'Trash' ? (
                                                     <button 
                                                          onClick={(e) => handleRestoreClick(e, item)}
                                                          className="p-1.5 hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                                                          title="Restore"
                                                     >
                                                         <RotateCcw size={14} />
                                                     </button>
                                                 ) : (
                                                     <button 
                                                          onClick={(e) => handleDeleteClick(e, item)}
                                                          className="p-1.5 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded transition-colors"
                                                          title="Delete (Trash)"
                                                      >
                                                         <Trash2 size={14} />
                                                     </button>
                                                 )
                                             )}
                                             {activeFolder === 'Trash' && (
                                                  <button 
                                                      onClick={(e) => handleDeleteClick(e, item)}
                                                      className="p-1.5 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded transition-colors"
                                                      title="Delete Forever"
                                                  >
                                                      <Trash2 size={14} fill="currentColor" />
                                                  </button>
                                             )}
                                         </div>

                                         {/* Right: Use / Move */}
                                         <div className="flex items-center gap-2">
                                              {viewMode === 'MY_GALLERY' && activeFolder !== 'Trash' && (
                                                  <button 
                                                      onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); }}
                                                      className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors"
                                                      title="Move to Folder"
                                                  >
                                                      <FolderInput size={14} />
                                                  </button>
                                              )}
                                              
                                              {/* Use Image Button with Dropdown logic */}
                                              <div className="relative">
                                                  <button 
                                                    className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${activeUseMenuId === item.id ? 'bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'}`}
                                                    onClick={(e) => { e.stopPropagation(); setActiveUseMenuId(activeUseMenuId === item.id ? null : item.id); }}
                                                  >
                                                     <Wand2 size={12} /> Use
                                                  </button>

                                                  {/* Dropdown Menu - Opens Upwards */}
                                                  {activeUseMenuId === item.id && (
                                                      <div className="absolute bottom-full right-0 mb-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-1 min-w-[160px] flex flex-col gap-1 z-50 animate-in zoom-in-95 duration-100 origin-bottom-right">
                                                          <button onClick={(e) => { e.stopPropagation(); handleSendTo('TRY_ON', item); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2 transition-colors">
                                                              <Shirt size={14} /> Outfit Try-on
                                                          </button>
                                                          <button onClick={(e) => { e.stopPropagation(); handleSendTo('MODEL_MV', item); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2 transition-colors">
                                                              <Camera size={14} /> Multi-view
                                                          </button>
                                                          <button onClick={(e) => { e.stopPropagation(); handleSendTo('MODEL_POSE', item); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2 transition-colors">
                                                              <Move size={14} /> Pose/Physics
                                                          </button>
                                                          
                                                          {viewMode === 'MY_GALLERY' && activeFolder !== 'Trash' && (
                                                              <>
                                                                  <div className="h-px bg-slate-700 my-1"></div>
                                                                  <button onClick={(e) => handleTogglePublic(e, item)} className={`px-3 py-2 text-left text-xs rounded flex items-center gap-2 transition-colors ${item.isPublic ? 'text-emerald-400 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                                                                      {item.isPublic ? <><Lock size={14} /> Make Private</> : <><Globe size={14} /> Make Community</>}
                                                                  </button>
                                                              </>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                         </div>
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="mt-12 mb-8 flex justify-center items-center gap-3">
                            <button 
                                onClick={() => { setCurrentPage(Math.max(1, currentPage - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                                disabled={currentPage === 1}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            
                            <div className="flex items-center gap-2">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                    // Logic to show a limited number of page buttons if total is high
                                    if (totalPages > 7) {
                                        if (page !== 1 && page !== totalPages && Math.abs(page - currentPage) > 1) {
                                            if (page === currentPage - 2 || page === currentPage + 2) return <span key={page} className="text-slate-600">...</span>;
                                            return null;
                                        }
                                    }
                                    
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                            className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${currentPage === page ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            </div>

                            <button 
                                onClick={() => { setCurrentPage(Math.min(totalPages, currentPage + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                                disabled={currentPage === totalPages}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                  </>
              )}
          </div>
          
          {/* Bulk Action Bar (Floating) */}
          {selectedIds.size > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-2xl shadow-2xl p-2 px-4 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-6">
                  <span className="text-sm font-bold text-white mr-2">{selectedIds.size} Selected</span>
                  
                  <div className="h-6 w-px bg-slate-600"></div>

                  <button 
                    onClick={handleBulkDeleteClick}
                    className="flex flex-col items-center gap-1 text-slate-300 hover:text-red-400 p-2 rounded transition-colors group"
                  >
                      {activeFolder === 'Trash' ? (
                          <>
                            <Trash2 size={20} className="group-hover:scale-110 transition-transform fill-current" />
                            <span className="text-[10px] font-medium">Destroy</span>
                          </>
                      ) : (
                          <>
                            <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-medium">Delete</span>
                          </>
                      )}
                  </button>

                  {activeFolder !== 'Trash' && (
                      <button 
                        onClick={handleBulkMoveClick}
                        className="flex flex-col items-center gap-1 text-slate-300 hover:text-blue-400 p-2 rounded transition-colors group"
                      >
                          <FolderInput size={20} className="group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-medium">Move</span>
                      </button>
                  )}

                  <button 
                    onClick={handleBulkDownload}
                    className="flex flex-col items-center gap-1 text-slate-300 hover:text-white p-2 rounded transition-colors group"
                  >
                      <Download size={20} className="group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-medium">Download</span>
                  </button>
              </div>
          )}
      </div>

      {/* New Folder Modal */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setIsNewFolderModalOpen(false)}>
            <div className="bg-[#1e293b] w-full max-w-sm rounded-xl border border-slate-700 p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4">Create New Folder</h3>
                <input 
                    type="text" 
                    value={newFolderName} 
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder Name"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white mb-4 focus:border-blue-500 outline-none"
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsNewFolderModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                    <button onClick={handleCreateFolder} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium">Create</button>
                </div>
            </div>
        </div>
      )}

      {/* Move/Select Folder Modal */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setIsMoveModalOpen(false)}>
            <div className="bg-[#1e293b] w-full max-w-sm rounded-xl border border-slate-700 p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4">
                    {itemToMove ? 'Select Target Folder' : `Move ${selectedIds.size} Items`}
                </h3>
                <div className="space-y-1 max-h-60 overflow-y-auto mb-4 custom-scrollbar">
                    {folders.map(folder => (
                        <button
                            key={folder}
                            onClick={() => setTargetFolder(folder)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${targetFolder === folder ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><Folder size={16} /> {folder}</span>
                            {targetFolder === folder && <CheckCircle2 size={16} />}
                        </button>
                    ))}
                </div>
                
                <div className="flex gap-2 mb-4 pt-4 border-t border-slate-700">
                    <input 
                        type="text" 
                        placeholder="Or create new..." 
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 text-sm text-white"
                        onChange={(e) => setTargetFolder(e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsMoveModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                    <button onClick={handleFolderSelectionConfirm} disabled={!targetFolder} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium disabled:opacity-50">Next</button>
                </div>
            </div>
        </div>
      )}

      {/* Copy vs Move Action Modal */}
      {isActionModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={resetMoveState}>
            <div className="bg-[#1e293b] w-full max-w-sm rounded-xl border border-slate-700 p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                     <h3 className="text-lg font-bold text-white">
                         {itemToMove ? 'Move or Copy Item?' : 'Move Selected Items?'}
                     </h3>
                     <button onClick={resetMoveState} className="text-slate-500 hover:text-white"><X size={20}/></button>
                </div>
                
                <p className="text-sm text-slate-400 mb-6">
                    {itemToMove 
                        ? <>Do you want to move the image to <b>{targetFolder}</b>, or create a copy of it?</>
                        : <>Move <b>{selectedIds.size}</b> images to <b>{targetFolder}</b>?</>
                    }
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={executeMove}
                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-blue-500 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-slate-700 group-hover:bg-blue-600/20 flex items-center justify-center text-slate-300 group-hover:text-blue-400 transition-colors">
                            <MoveRight size={20} />
                        </div>
                        <span className="text-sm font-semibold text-slate-300 group-hover:text-white">Move</span>
                        <span className="text-[10px] text-slate-500">Remove from current</span>
                    </button>

                    {itemToMove && (
                        <button 
                            onClick={executeCopy}
                            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-emerald-500 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-full bg-slate-700 group-hover:bg-emerald-600/20 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 transition-colors">
                                <Copy size={20} />
                            </div>
                            <span className="text-sm font-semibold text-slate-300 group-hover:text-white">Copy</span>
                            <span className="text-[10px] text-slate-500">Keep in both folders</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => { if(!isDeleting) setIsDeleteModalOpen(false); }}
        >
          <div 
            className="bg-[#1e293b] w-full max-w-sm rounded-xl border border-slate-700 shadow-2xl p-6 flex flex-col gap-4 relative animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
               <div className="p-3 bg-red-900/30 rounded-full shrink-0 border border-red-500/20">
                 <AlertTriangle className="text-red-500" size={24} />
               </div>
               <div>
                 <h3 className="text-lg font-bold text-white">
                    {activeFolder === 'Trash' 
                        ? (itemToDelete ? 'Delete Permanently?' : 'Empty Selected Trash?')
                        : (!itemToDelete && bulkDeletableIds.length < selectedIds.size 
                            ? 'Partial Delete Warning' 
                            : (itemToDelete ? 'Delete Image?' : 'Delete Selected?'))
                    }
                 </h3>
                 <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                   {activeFolder === 'Trash' ? (
                       "This action is irreversible. The selected items will be permanently removed from the server."
                   ) : (
                       itemToDelete 
                        ? "Move this image to Trash? You can restore it later."
                        : (!itemToDelete && bulkDeletableIds.length < selectedIds.size)
                            ? `총 ${selectedIds.size}개 중 즐겨찾기 된 ${selectedIds.size - bulkDeletableIds.length}개를 제외하고, 나머지 ${bulkDeletableIds.length}개만 휴지통으로 이동하시겠습니까?`
                            : `Move ${selectedIds.size} images to Trash?`
                   )}
                 </p>
               </div>
            </div>
            
            <div className="flex gap-3 mt-2">
               <button 
                 onClick={() => setIsDeleteModalOpen(false)}
                 disabled={isDeleting}
                 className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50"
               >
                 Cancel
               </button>
               <button 
                 onClick={confirmDelete}
                 disabled={isDeleting}
                 className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
               >
                 {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                 {activeFolder === 'Trash' ? (isDeleting ? 'Destroying...' : 'Delete Forever') : (isDeleting ? 'Moving...' : 'Move to Trash')}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedImage && !isSelectionMode && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          {/* Navigation Buttons */}
          <button 
             onClick={(e) => { e.stopPropagation(); handleNavigateModal('prev'); }}
             className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all z-[110]"
          >
             <ChevronLeft size={32} />
          </button>
          
          <button 
             onClick={(e) => { e.stopPropagation(); handleNavigateModal('next'); }}
             className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all z-[110]"
          >
             <ChevronRight size={32} />
          </button>

          <div className="relative max-w-5xl max-h-[90vh] flex flex-col md:flex-row gap-4 bg-[#1e293b] rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
             {/* Close Button */}
             <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 bg-black/60 hover:bg-red-600 text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-colors z-[120] shadow-lg"
             >
                <X size={24} />
             </button>

             {/* Compare Button */}
             {selectedImage.referenceImages && selectedImage.referenceImages.length > 0 && (
                <button 
                    onPointerDown={(e) => { e.stopPropagation(); setShowReference(true); }}
                    onPointerUp={(e) => { e.stopPropagation(); setShowReference(false); }}
                    onPointerLeave={() => setShowReference(false)}
                    className={`absolute top-16 right-4 p-2 rounded-full backdrop-blur-md border border-white/10 transition-all z-[120] shadow-lg ${showReference ? 'bg-blue-600 text-white scale-110' : 'bg-black/60 text-white hover:bg-white/20'}`}
                    title="Hold to compare with reference"
                >
                    <Layers size={24} />
                </button>
             )}

             <div 
                className="bg-black flex-1 flex items-center justify-center min-h-[50vh] overflow-hidden relative select-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
             >
                <img 
                    src={showReference && selectedImage.referenceImages && selectedImage.referenceImages.length > 0 ? selectedImage.referenceImages[0] : selectedImage.url} 
                    alt="Detail" 
                    className={`max-h-[85vh] w-auto object-contain ${isDragging ? '' : 'transition-transform duration-150 ease-out'}`} 
                    style={{ 
                        transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                        transformOrigin: 'center'
                    }}
                    draggable={false}
                    onError={() => {
                        setSelectedImage(null);
                        setFailedImageIds(prev => {
                            const next = new Set(prev);
                            next.add(selectedImage.id);
                            return next;
                        });
                    }}
                />

                {/* Zoom Indicator */}
                {zoom > 1 && (
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 z-30">
                        <ZoomIn size={14} />
                        {Math.round(zoom * 100)}%
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setZoom(1);
                                setPan({ x: 0, y: 0 });
                            }}
                            className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
                            title="Reset Zoom"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                )}
             </div>
             <div className="w-full md:w-80 p-6 flex flex-col gap-4 bg-[#1e293b]">
                <h3 className="text-lg font-bold text-white border-b border-slate-700 pb-2">Details</h3>
                <div className="space-y-3 text-sm">
                   <div><span className="text-slate-500 block text-xs">Category</span><span className="text-slate-200">{selectedImage.category}</span></div>
                   <div><span className="text-slate-500 block text-xs">Resolution</span><span className="text-slate-200">{selectedImage.resolution}</span></div>
                   <div><span className="text-slate-500 block text-xs">Date</span><span className="text-slate-200">{new Date(selectedImage.timestamp || 0).toLocaleString()}</span></div>
                   <div><span className="text-slate-500 block text-xs">Folder</span><span className="text-slate-200 flex items-center gap-1"><Folder size={12}/> {selectedImage.folderName || 'All'}</span></div>
                   <div><span className="text-slate-500 block text-xs">Visibility</span><span className={selectedImage.isPublic ? "text-emerald-400" : "text-slate-400"}>{selectedImage.isPublic ? "Public (Community)" : "Private"}</span></div>
                   <div><span className="text-slate-500 block text-xs mb-1">Prompt</span><div className="bg-slate-900 p-2 rounded text-xs text-slate-300 max-h-40 overflow-y-auto custom-scrollbar">{selectedImage.prompt}</div></div>
                </div>
                <div className="mt-auto flex flex-col gap-2 pt-4">
                    <button 
                        onClick={() => setActiveUseMenuId(selectedImage.id === activeUseMenuId ? null : selectedImage.id)} 
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-sm flex items-center justify-center gap-2 relative"
                    >
                        <Wand2 size={14} /> Use Image
                         {activeUseMenuId === selectedImage.id && (
                            <div className="absolute bottom-full mb-2 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-1 z-50 animate-in zoom-in-95 duration-100 flex flex-col gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleSendTo('TRY_ON', selectedImage); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2">
                                    <Shirt size={14} /> Outfit Try-on
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleSendTo('MODEL_MV', selectedImage); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2">
                                    <Camera size={14} /> Multi-view
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleSendTo('MODEL_POSE', selectedImage); }} className="px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded flex items-center gap-2">
                                    <Move size={14} /> Pose/Physics
                                </button>
                            </div>
                        )}
                    </button>
                    <a href={selectedImage.url} target="_blank" rel="noreferrer" className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded font-medium text-sm flex items-center justify-center gap-2"><ExternalLink size={14} /> Open Original</a>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
