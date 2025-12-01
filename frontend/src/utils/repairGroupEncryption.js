/**
 * Repair/Initialize encryption for groups that were created before encryption was implemented
 */

import cryptoService from '../services/cryptoService';
import { storeGroupKey, getGroupKey } from '../services/groupService';
import { toast } from 'react-hot-toast';
import axiosInstance from '../store/axiosInstance';

/**
 * Fetch a user's public key from the server or local storage
 * For the current user, tries local first, then server
 */
async function fetchUserPublicKey(userId, currentUserId = null) {
  // If this is the current user, try to get public key from local crypto service first
  if (currentUserId && userId.toString() === currentUserId.toString()) {
    try {
      const localPublicKey = await cryptoService.exportPublicKey();
      if (localPublicKey) {
        console.log(`✅ Using local public key for current user ${userId}`);
        return localPublicKey;
      }
    } catch (error) {
      console.log(`⚠️ Local public key not available, fetching from server...`);
    }
  }
  
  // For other users or if local key not available, fetch from server
  try {
    const response = await axiosInstance.get(`/users/${userId}/public-key`);
    return response.data.publicKey;
  } catch (error) {
    console.error(`Failed to fetch public key for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Initialize encryption for a group that doesn't have it yet
 * This repairs groups created before encryption was implemented
 *
 * @param {string} groupId - The group ID
 * @param {Array} members - Array of member objects
 * @param {string} currentUserId - Current user's ID
 * @param {string} groupCreatorId - Group creator's ID (only creator can initialize)
 */
export async function repairGroupEncryption(groupId, members, currentUserId, groupCreatorId) {
  try {
    // Only allow the group creator to initialize encryption
    // This prevents different members from generating different keys
    if (currentUserId !== groupCreatorId) {
      // Don't log repeatedly to avoid console spam
      throw new Error('Only group creator can initialize encryption');
    }

    console.log(`🔧 Repairing encryption for group ${groupId} (as creator)`);

    // IMPORTANT: Check if any group keys already exist for this group
    // If they do, we should NOT generate a new key as that would create
    // a key mismatch where different members have different keys
    console.log(`⚠️ Checking if group keys already exist before repairing...`);

    // Try to fetch the creator's own key first
    try {
      const existingCreatorKey = await getGroupKey(groupId, currentUserId);
      if (existingCreatorKey) {
        console.log(`✅ Creator's group key already exists. Using existing encryption.`);

        // Decrypt and cache the existing key
        const encryptorId = existingCreatorKey.encryptedBy || groupCreatorId;
        const encryptorPublicKey = await fetchUserPublicKey(encryptorId, currentUserId);
        const groupKey = await cryptoService.decryptGroupKey(
          existingCreatorKey,
          encryptorPublicKey,
          encryptorId,
          groupId
        );

        // The key is now cached, repair is complete
        console.log(`✅ Existing group key loaded and cached`);
        return true;
      }
    } catch (error) {
      // If error is not 404, something else went wrong
      if (error.response?.status !== 404) {
        console.error(`❌ Error checking for existing key:`, error);
        throw error;
      }
      // If 404, continue with initialization (key doesn't exist yet)
      console.log(`⚠️ No existing creator key found (404). Proceeding with fresh initialization.`);
    }

    // If we get here, no keys exist yet, so initialize fresh
    toast.loading('Setting up encryption for this group...', { id: 'repair-encryption' });

    // 0. Ensure current user's public key is on server (for creator)
    try {
      const localPublicKey = await cryptoService.exportPublicKey();
      if (localPublicKey) {
        try {
          // Try to upload public key to server if not already there
          await axiosInstance.put('/users/public-key', { publicKey: localPublicKey });
          console.log('✅ Creator public key uploaded to server');
        } catch (uploadError) {
          // If upload fails, continue anyway - we can use local key
          console.warn('⚠️ Could not upload creator public key to server, using local key');
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not export local public key, will try server fetch');
    }

    // 1. Generate a new AES-GCM group key
    const groupKey = await cryptoService.generateGroupKey();

    // 2. Cache the group key locally
    cryptoService.setGroupKey(groupId, groupKey);

    // 3. Encrypt and store the group key for each member
    let successCount = 0;
    let failCount = 0;
    let creatorKeyStored = false;

    for (const member of members) {
      try {
        const memberId = member.id || member._id;
        const memberName = member.name || member.fullName || 'Unknown';

        // Fetch member's public key (use local key for current user)
        const memberPublicKey = await fetchUserPublicKey(memberId, currentUserId);

        // Encrypt group key with member's public key
        const encryptedKeyData = await cryptoService.encryptGroupKeyForMember(
          groupKey,
          memberPublicKey,
          memberId
        );

        // Store encrypted key on server
        await storeGroupKey(groupId, {
          userId: memberId,
          encryptedBy: groupCreatorId,
          ...encryptedKeyData
        });

        successCount++;
        console.log(`✅ Group key encrypted and stored for member: ${memberName}`);

        // Track creator's key
        if (memberId.toString() === groupCreatorId.toString()) {
          creatorKeyStored = true;
        }
      } catch (error) {
        failCount++;
        const memberId = member.id || member._id;
        console.error(`Failed to encrypt key for member ${memberId}:`, error);

        // CRITICAL: Fail if creator's key can't be stored
        if (memberId.toString() === groupCreatorId.toString()) {
          toast.error('Failed to setup encryption - could not store creator key', { id: 'repair-encryption' });
          throw new Error('Failed to store creator encryption key');
        }
        // Continue with other members if not creator
      }
    }

    if (!creatorKeyStored) {
      toast.error('Failed to setup encryption - creator key not stored', { id: 'repair-encryption' });
      throw new Error('Creator encryption key was not stored');
    }

    if (successCount === members.length) {
      toast.success('Encryption setup complete!', { id: 'repair-encryption' });
      console.log(`🎉 Group encryption initialized successfully for group ${groupId}`);
      return true;
    } else if (successCount > 0) {
      toast.success(`Encryption setup complete (${successCount}/${members.length} members)`, { id: 'repair-encryption' });
      console.warn(`⚠️ Partial success: ${successCount} succeeded, ${failCount} failed`);
      return true;
    } else {
      toast.error('Failed to setup encryption', { id: 'repair-encryption' });
      console.error(`❌ Failed to initialize encryption for group ${groupId}`);
      return false;
    }
  } catch (error) {
    // Only log unexpected errors (not creator-only errors)
    if (!error.message?.includes('Only group creator can initialize encryption')) {
      console.error('Failed to repair group encryption:', error);
      toast.error('Failed to setup encryption', { id: 'repair-encryption' });
    }
    return false;
  }
}

export default repairGroupEncryption;
