import { GeneratedImage } from '../types';

export interface GalleryItem extends GeneratedImage {
  id: string;
  url: string; // Base64 or object URL
  storagePath: string; // Not strictly needed for local, but kept for compatibility
  folderName: string;
  isPublic: boolean;
  isFavorite: boolean;
  userId: string; // This will be the PIN
  deletedAt?: number;
  referenceImages?: string[]; // Added for comparison feature
}

const DB_NAME = 'FashionSynthDB';
const DB_VERSION = 1;
const STORE_NAME = 'images';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('folderName', 'folderName', { unique: false });
      }
    };
  });
};

export const saveImageToLocal = async (
  userId: string, 
  item: GeneratedImage, 
  base64Data: string
): Promise<{ id: string; url: string; storagePath: string } | null> => {
  try {
    const db = await initDB();
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    const galleryItem: GalleryItem = {
      ...item,
      id,
      url: base64Data,
      storagePath: id,
      folderName: 'All',
      isPublic: false,
      isFavorite: false,
      userId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(galleryItem);

      request.onsuccess = () => resolve({ id, url: base64Data, storagePath: id });
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Local Save Error:", error);
    return null;
  }
};

export const getUserGallery = async (userId: string): Promise<GalleryItem[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userId');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const items = request.result as GalleryItem[];
        const filtered = items.filter(item => item.folderName !== 'Trash');
        resolve(filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Get Gallery Error:", error);
    return [];
  }
};

export const getTrashGallery = async (userId: string): Promise<GalleryItem[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userId');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const items = request.result as GalleryItem[];
        const filtered = items.filter(item => item.folderName === 'Trash');
        resolve(filtered.sort((a, b) => (b.deletedAt || b.timestamp || 0) - (a.deletedAt || a.timestamp || 0)));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Get Trash Error:", error);
    return [];
  }
};

export const getCommunityGallery = async (): Promise<GalleryItem[]> => {
  // Community gallery is disabled in local mode, return empty array
  return [];
};

export const updateImageMetadata = async (id: string, updates: Partial<GalleryItem>) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          resolve(false);
          return;
        }
        const updatedItem = { ...item, ...updates };
        const putRequest = store.put(updatedItem);
        putRequest.onsuccess = () => resolve(true);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error("Update Metadata Error:", error);
    return false;
  }
};

export const toggleFavoriteStatus = async (id: string, currentStatus: boolean) => {
  return await updateImageMetadata(id, { isFavorite: !currentStatus });
};

export const softDeleteImage = async (id: string) => {
  return await updateImageMetadata(id, { 
    folderName: 'Trash', 
    deletedAt: Date.now(),
    isFavorite: false 
  });
};

export const restoreImage = async (id: string) => {
  return await updateImageMetadata(id, { 
    folderName: 'All', 
    deletedAt: undefined 
  });
};

export const deleteImageFromLocal = async (id: string) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Hard Delete Error:", error);
    return false;
  }
};

export const emptyTrash = async (userId: string) => {
  try {
    const trashItems = await getTrashGallery(userId);
    if (trashItems.length === 0) return true;
    
    const promises = trashItems.map(item => deleteImageFromLocal(item.id));
    const results = await Promise.all(promises);
    return results.every(r => r === true);
  } catch (error) {
    console.error("Empty Trash Error:", error);
    return false;
  }
};

export const duplicateImageToFolder = async (originItem: GalleryItem, targetFolder: string): Promise<GalleryItem | null> => {
  try {
    const db = await initDB();
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    const newItem: GalleryItem = {
      ...originItem,
      id: newId,
      folderName: targetFolder,
      timestamp: Date.now(),
      isFavorite: originItem.isFavorite || false
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(newItem);

      request.onsuccess = () => resolve(newItem);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Duplicate Error:", error);
    return null;
  }
};

export const deleteMultipleImages = async (items: { id: string }[]) => {
  try {
    const promises = items.map(item => deleteImageFromLocal(item.id));
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
