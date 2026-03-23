
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy, limit, deleteField 
} from "firebase/firestore";
import { 
  getStorage, ref, uploadString, getDownloadURL, deleteObject 
} from "firebase/storage";
import { GeneratedImage, FashionCategory } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyAwHlu2wTH-yCCmiHIq2tGB8BYm1r2e3i4",
  authDomain: "gen-lang-client-0283140097.firebaseapp.com",
  projectId: "gen-lang-client-0283140097",
  storageBucket: "gen-lang-client-0283140097.firebasestorage.app",
  messagingSenderId: "14965245428",
  appId: "1:14965245428:web:b9655f1317fef30028a5a1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Guest ID Management ---
export const getGuestId = (): string => {
  const STORAGE_KEY = 'fashion_app_guest_id';
  let guestId = localStorage.getItem(STORAGE_KEY);
  
  // Validate format: Must start with DK_GUEST_
  if (!guestId || !guestId.startsWith('DK_GUEST_')) {
    // Generate DK_GUEST_ + 4 random digits (e.g., DK_GUEST_1024)
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    guestId = `DK_GUEST_${randomDigits}`;
    localStorage.setItem(STORAGE_KEY, guestId);
    console.log("Regenerated Guest ID to comply with format:", guestId);
  }
  
  return guestId;
};

// --- Helper to handle Permission Errors ---
const handlePermissionError = (error: any) => {
  const msg = error.message || '';
  if (msg.includes('permission-denied') || msg.includes('storage/unauthorized') || error.code === 'permission-denied' || error.code === 'storage/unauthorized') {
    alert(
      "⛔ Firebase 권한 설정 오류 (Permission Error)\n\n" +
      "게스트 모드를 사용하려면 Firebase 콘솔에서 보안 규칙(Rules)을 '공개(Public)'로 설정해야 합니다.\n\n" +
      "1. Firestore Database > Rules\n" +
      "2. Storage > Rules\n\n" +
      "위 두 곳의 규칙을 'allow read, write: if true;' 로 변경하고 [Publish]를 눌러주세요."
    );
  }
};

// --- Storage & DB Logic ---

export const saveImageToFirebase = async (
  userId: string, 
  item: GeneratedImage, 
  base64Data: string
): Promise<{ id: string; url: string; storagePath: string } | null> => {
  try {
    // 1. Upload Base64 to Firebase Storage
    // Remove header if present
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`;
    const storageRef = ref(storage, fileName);
    
    await uploadString(storageRef, base64Content, 'base64', { contentType: 'image/png' });
    const downloadUrl = await getDownloadURL(storageRef);

    // 2. Save Metadata to Firestore
    const docRef = await addDoc(collection(db, "images"), {
      userId: userId,
      url: downloadUrl, // Public URL
      prompt: item.prompt || "",
      category: item.category || "GENERAL",
      resolution: item.resolution || "1K",
      timestamp: Date.now(),
      storagePath: fileName, // Needed for deletion
      folderName: 'All', // Default folder
      isPublic: false,    // Default private
      isFavorite: false   // Default not favorite
    });

    console.log("Auto-saved to Firebase:", fileName);
    // Explicitly returning id to differentiate from local ID
    return { id: docRef.id, url: downloadUrl, storagePath: fileName };
  } catch (error: any) {
    console.error("Firebase Save Error:", error);
    handlePermissionError(error);
    return null;
  }
};

export interface GalleryItem extends GeneratedImage {
  storagePath: string; // Made required for GalleryItem
  folderName: string;
  isPublic: boolean;
  isFavorite: boolean;
  userId?: string;
  deletedAt?: number;
}

export const getUserGallery = async (userId?: string): Promise<GalleryItem[]> => {
  try {
    let q;
    if (userId) {
        // Restrict view to specific user ID
        // Increase limit to 300 to ensure we get enough items even if some are in Trash
        q = query(
            collection(db, "images"),
            where("userId", "==", userId),
            limit(300)
        );
    } else {
        // Fallback for when no ID is provided (shouldn't happen in app flow)
        q = query(
            collection(db, "images"), 
            limit(300)
        );
    }
    
    const querySnapshot = await getDocs(q);
    const items: GalleryItem[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;
      // Client-side filtering: Exclude Trash items
      if (data.folderName !== 'Trash') {
          items.push({
            id: doc.id, // Use doc ID as local ID for gallery items loaded from server
            url: data.url,
            prompt: data.prompt,
            category: data.category,
            resolution: data.resolution,
            timestamp: data.timestamp,
            storagePath: data.storagePath,
            folderName: data.folderName || 'All',
            isPublic: !!data.isPublic,
            isFavorite: !!data.isFavorite,
            userId: data.userId,
            deletedAt: data.deletedAt
          });
      }
    });
    
    // Client-side sorting (Newest first)
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (error: any) {
    console.error("Get Gallery Error:", error);
    handlePermissionError(error);
    return [];
  }
};

// New: Fetch ONLY Trash items
export const getTrashGallery = async (userId: string): Promise<GalleryItem[]> => {
    try {
        // Query by userId only to avoid composite index issues.
        // We fetch a larger batch and filter in memory.
        const q = query(
            collection(db, "images"),
            where("userId", "==", userId),
            limit(500)
        );
        
        const querySnapshot = await getDocs(q);
        const items: GalleryItem[] = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.folderName === 'Trash') {
                items.push({
                    id: doc.id,
                    url: data.url,
                    prompt: data.prompt,
                    category: data.category,
                    resolution: data.resolution,
                    timestamp: data.timestamp,
                    storagePath: data.storagePath,
                    folderName: 'Trash',
                    isPublic: !!data.isPublic,
                    isFavorite: !!data.isFavorite,
                    userId: data.userId,
                    deletedAt: data.deletedAt
                });
            }
        });
        
        // Sort by deletedAt desc if available, else timestamp
        return items.sort((a, b) => (b.deletedAt || b.timestamp || 0) - (a.deletedAt || a.timestamp || 0));
    } catch (error: any) {
        console.error("Get Trash Error:", error);
        return [];
    }
};

export const getCommunityGallery = async (): Promise<GalleryItem[]> => {
  try {
    // Fetch all public images
    const q = query(
      collection(db, "images"),
      where("isPublic", "==", true),
      limit(50) 
    );
    
    const querySnapshot = await getDocs(q);
    const items: GalleryItem[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Exclude Trash from community even if marked public (safeguard)
      if (data.folderName !== 'Trash') {
          items.push({
            id: doc.id,
            url: data.url,
            prompt: data.prompt,
            category: data.category,
            resolution: data.resolution,
            timestamp: data.timestamp,
            storagePath: data.storagePath,
            folderName: 'Community', // Virtual folder
            isPublic: true,
            isFavorite: !!data.isFavorite,
            userId: data.userId
          });
      }
    });
    
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (error: any) {
    console.error("Community Gallery Error:", error);
    return [];
  }
};

export const updateImageMetadata = async (id: string, updates: { folderName?: string; isPublic?: boolean; isFavorite?: boolean; deletedAt?: any }) => {
    try {
        const docRef = doc(db, "images", id);
        await updateDoc(docRef, updates);
        return true;
    } catch (error: any) {
        console.error("Update Metadata Error:", error);
        handlePermissionError(error);
        return false;
    }
};

export const toggleFavoriteStatus = async (id: string, currentStatus: boolean) => {
    return await updateImageMetadata(id, { isFavorite: !currentStatus });
};

// Soft Delete (Move to Trash)
export const softDeleteImage = async (id: string) => {
    return await updateImageMetadata(id, { 
        folderName: 'Trash', 
        deletedAt: Date.now(),
        isFavorite: false // Optionally remove favorite status when trashing
    });
};

// Restore from Trash
export const restoreImage = async (id: string) => {
    // Restore to 'All' folder and remove deletedAt
    return await updateImageMetadata(id, { 
        folderName: 'All', 
        deletedAt: deleteField() // Correctly remove the field
    });
};

// Empty Trash (Delete all items in Trash)
export const emptyTrash = async (userId: string) => {
    try {
        const trashItems = await getTrashGallery(userId);
        if (trashItems.length === 0) return true;
        
        // Use deleteMultipleImages logic manually
        const promises = trashItems.map(item => deleteImageFromFirebase(item.id, item.storagePath));
        const results = await Promise.all(promises);
        return results.every(r => r === true);
    } catch (error) {
        console.error("Empty Trash Error:", error);
        return false;
    }
};

// NEW: Duplicate image logic for Copy operation
export const duplicateImageToFolder = async (originItem: GalleryItem, targetFolder: string): Promise<GalleryItem | null> => {
    try {
        // Create new document with same data but new timestamp and folder
        // We reuse the storagePath so we don't duplicate the actual file (saving storage)
        const newDocRef = await addDoc(collection(db, "images"), {
            userId: originItem.userId,
            url: originItem.url,
            prompt: originItem.prompt,
            category: originItem.category,
            resolution: originItem.resolution,
            timestamp: Date.now(),
            storagePath: originItem.storagePath, // Point to same file
            folderName: targetFolder,
            isPublic: originItem.isPublic,
            isFavorite: originItem.isFavorite || false
        });

        // Return the new item structure for UI update
        return {
            ...originItem,
            id: newDocRef.id,
            folderName: targetFolder,
            timestamp: Date.now(),
            isFavorite: originItem.isFavorite || false
        };
    } catch (error: any) {
        console.error("Duplicate Error:", error);
        handlePermissionError(error);
        return null;
    }
};

export const deleteImageFromFirebase = async (id: string, storagePath: string) => {
  try {
    if (!id) {
        console.warn("[Hard Delete] No id provided. Skipping.");
        return false;
    }
    console.log(`[Hard Delete] Starting deletion for Doc: ${id}, Path: ${storagePath}`);

    // Step 1: Delete from Storage (Best effort)
    if (storagePath) {
        try {
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
            console.log("[Hard Delete] Storage file deleted successfully.");
        } catch (storageErr: any) {
            // CRITICAL: We ignore 'object-not-found' to allow cleaning up 'ghost data' (DB records without files)
            if (storageErr.code === 'storage/object-not-found') {
                console.warn("[Hard Delete] File not found in storage. Proceeding to delete DB record to clean up ghost data.");
            } else {
                console.error("[Hard Delete] Storage Error (non-404):", storageErr);
                // Continue to DB delete even if storage fails, to keep DB clean
            }
        }
    } else {
        console.warn("[Hard Delete] No storagePath provided. Skipping storage delete.");
    }
    
    // Step 2: Delete from Firestore (Must succeed)
    await deleteDoc(doc(db, "images", id));
    console.log("[Hard Delete] Firestore document deleted successfully.");
    
    return true;
  } catch (error: any) {
    console.error("[Hard Delete] Final Error:", error);
    // handlePermissionError(error); // Suppress alert for bulk actions or background tasks
    return false;
  }
};

// --- Bulk Operations Helper ---

export const deleteMultipleImages = async (items: { id: string; storagePath: string }[]) => {
  try {
    const promises = items.map(item => deleteImageFromFirebase(item.id, item.storagePath));
    const results = await Promise.all(promises);
    return results.every(r => r === true);
  } catch (error) {
    console.error("Bulk Delete Error:", error);
    return false;
  }
};

export const moveMultipleImages = async (ids: string[], targetFolder: string) => {
  try {
    const promises = ids.map(id => updateImageMetadata(id, { folderName: targetFolder }));
    const results = await Promise.all(promises);
    return results.every(r => r === true);
  } catch (error) {
    console.error("Bulk Move Error:", error);
    return false;
  }
};
