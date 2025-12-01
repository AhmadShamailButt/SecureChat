/**
 * Group Encryption Utilities
 * Helper functions for managing group encryption workflows
 */

import cryptoService from '../services/cryptoService';
import { storeGroupKey, getGroupKey } from '../services/groupService';
import axiosInstance from '../store/axiosInstance';

/**
 * Fetch a user's public key from the server
 */
export async function fetchUserPublicKey(userId) {
  try {
    const response = await axiosInstance.get(`/users/${userId}/public-key`);
    return response.data.publicKey;
  } catch (error) {
    console.error(`Failed to fetch public key for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Initialize group encryption when creating a new group
 * Generates a group key and encrypts it for all members
 *
 * @param {string} groupId - The group ID
 * @param {Array} members - Array of member objects with { id, name, ... }
 * @param {string} creatorId - ID of the group creator
 * @returns {Promise<void>}
 */
export async function initializeGroupEncryption(groupId, members, creatorId) {
  try {
    console.log(`🔐 Initializing encryption for group ${groupId} with ${members.length} members`);

    // 1. Generate a new AES-GCM group key
    const groupKey = await cryptoService.generateGroupKey();

    // 2. Cache the group key locally
    cryptoService.setGroupKey(groupId, groupKey);

    // 3. Encrypt and store the group key for each member
    const failedMembers = [];
    let creatorKeyStoredSuccessfully = false;

    for (const member of members) {
      try {
        // Handle both id and _id formats
        const memberId = member.id || member._id || member;
        const memberName = member.name || member.fullName || 'Unknown';

        console.log(`🔐 Encrypting key for member: ${memberName} (${memberId})`);

        // Fetch member's public key
        const memberPublicKey = await fetchUserPublicKey(memberId);

        if (!memberPublicKey) {
          throw new Error(`Member ${memberName} (${memberId}) does not have a public key set up`);
        }

        // Encrypt group key with member's public key
        const encryptedKeyData = await cryptoService.encryptGroupKeyForMember(
          groupKey,
          memberPublicKey,
          memberId
        );

        // Store encrypted key on server
        await storeGroupKey(groupId, {
          userId: memberId,
          encryptedBy: creatorId,
          ...encryptedKeyData
        });

        console.log(`✅ Group key encrypted and stored for member: ${memberName}`);

        // Track if creator's key was stored successfully
        if (memberId.toString() === creatorId.toString()) {
          creatorKeyStoredSuccessfully = true;
        }
      } catch (error) {
        const memberId = member.id || member._id || member;
        const memberName = member.name || member.fullName || 'Unknown';
        console.error(`❌ Failed to encrypt key for member ${memberId}:`, error);
        console.error(`   Error details:`, error.message);

        // Track failed members
        failedMembers.push({ id: memberId, name: memberName, error: error.message });

        // CRITICAL: If this is the creator, fail immediately
        if (memberId.toString() === creatorId.toString()) {
          throw new Error(`Failed to store encryption key for group creator. Group encryption cannot be initialized.`);
        }
      }
    }

    // Ensure creator's key was stored
    if (!creatorKeyStoredSuccessfully) {
      throw new Error('Creator encryption key was not stored. Cannot initialize group encryption.');
    }

    // Log summary
    if (failedMembers.length > 0) {
      console.warn(`⚠️ Encryption setup completed with ${failedMembers.length} failed member(s):`,
        failedMembers.map(m => `${m.name} (${m.id})`).join(', '));
      console.warn(`   These members will not be able to read messages until their keys are added.`);
    }

    console.log(`🎉 Group encryption initialized successfully for group ${groupId}`);
    console.log(`   ✅ ${members.length - failedMembers.length}/${members.length} members encrypted successfully`);

    return {
      success: true,
      totalMembers: members.length,
      successfulMembers: members.length - failedMembers.length,
      failedMembers
    };
  } catch (error) {
    console.error('Failed to initialize group encryption:', error);
    throw error;
  }
}

/**
 * Add encryption key for a new group member
 * Fetches the group key, decrypts it, and encrypts it for the new member
 *
 * @param {string} groupId - The group ID
 * @param {string} newMemberId - ID of the new member to add
 * @param {string} currentUserId - ID of the current user (who is adding the member)
 * @param {string} groupCreatorId - ID of the group creator
 * @returns {Promise<void>}
 */
export async function addMemberEncryptionKey(groupId, newMemberId, currentUserId, groupCreatorId) {
  try {
    console.log(`🔐 Adding encryption key for new member ${newMemberId} in group ${groupId}`);

    // 1. Get the group key (from cache or server)
    let groupKey = cryptoService.getGroupKey(groupId);

    if (!groupKey) {
      // Fetch encrypted group key for current user
      const encryptedKeyData = await getGroupKey(groupId, currentUserId);

      // Fetch the public key of whoever encrypted this key
      const encryptorId = encryptedKeyData.encryptedBy || groupCreatorId;
      const encryptorPublicKey = await fetchUserPublicKey(encryptorId);

      // Decrypt the group key
      groupKey = await cryptoService.decryptGroupKey(
        encryptedKeyData,
        encryptorPublicKey,
        encryptorId,
        groupId
      );
    }

    // 2. Fetch new member's public key
    const newMemberPublicKey = await fetchUserPublicKey(newMemberId);

    // 3. Encrypt group key for new member
    const encryptedKeyForNewMember = await cryptoService.encryptGroupKeyForMember(
      groupKey,
      newMemberPublicKey,
      newMemberId
    );

    // 4. Store encrypted key on server
    await storeGroupKey(groupId, {
      userId: newMemberId,
      encryptedBy: currentUserId, // Current user is encrypting for the new member
      ...encryptedKeyForNewMember
    });

    console.log(`✅ Encryption key added for new member ${newMemberId}`);
  } catch (error) {
    console.error('Failed to add member encryption key:', error);
    throw error;
  }
}

/**
 * Re-encrypt group key for a member whose keys have changed
 * This fixes key mismatches when a member regenerates their keys
 *
 * @param {string} groupId - The group ID
 * @param {string} memberId - ID of the member to re-encrypt for
 * @param {string} currentUserId - ID of the current user (must be creator or have group key)
 * @param {string} groupCreatorId - ID of the group creator
 * @returns {Promise<void>}
 */
export async function reEncryptGroupKeyForMember(groupId, memberId, currentUserId, groupCreatorId) {
  try {
    console.log(`🔐 Re-encrypting group key for member ${memberId} in group ${groupId}`);

    // 1. Get the group key (from cache or server)
    let groupKey = cryptoService.getGroupKey(groupId);

    if (!groupKey) {
      // Fetch encrypted group key for current user
      const encryptedKeyData = await getGroupKey(groupId, currentUserId);

      // Fetch the public key of whoever encrypted this key
      const encryptorId = encryptedKeyData.encryptedBy || groupCreatorId;
      const encryptorPublicKey = await fetchUserPublicKey(encryptorId);

      // Decrypt the group key
      groupKey = await cryptoService.decryptGroupKey(
        encryptedKeyData,
        encryptorPublicKey,
        encryptorId,
        groupId
      );
    }

    // 2. Fetch member's current public key (may have changed)
    const memberPublicKey = await fetchUserPublicKey(memberId);

    // 3. Encrypt group key for member with their current public key
    const encryptedKeyForMember = await cryptoService.encryptGroupKeyForMember(
      groupKey,
      memberPublicKey,
      memberId
    );

    // 4. Store encrypted key on server (overwrites old one)
    await storeGroupKey(groupId, {
      userId: memberId,
      encryptedBy: currentUserId,
      ...encryptedKeyForMember
    });

    console.log(`✅ Group key re-encrypted for member ${memberId}`);
  } catch (error) {
    console.error(`Failed to re-encrypt group key for member ${memberId}:`, error);
    throw error;
  }
}

/**
 * Fetch and decrypt the group key for the current user
 *
 * @param {string} groupId - The group ID
 * @param {string} currentUserId - ID of the current user
 * @param {string} groupCreatorId - ID of the group creator
 * @param {Array} groupMembers - Array of group members (optional, for repair)
 * @returns {Promise<CryptoKey>} - The decrypted AES group key
 */
export async function fetchAndDecryptGroupKey(groupId, currentUserId, groupCreatorId, groupMembers = null) {
  try {
    // Check cache first
    let groupKey = cryptoService.getGroupKey(groupId);

    if (groupKey) {
      console.log(`🔑 Using cached group key for group ${groupId}`);
      return groupKey;
    }

    console.log(`🔐 Fetching and decrypting group key for group ${groupId}`);

    // Fetch encrypted group key from server
    try {
      const encryptedKeyData = await getGroupKey(groupId, currentUserId);
      
      console.log(`📦 Fetched encrypted group key data:`, {
        hasEncryptedKey: !!encryptedKeyData.encryptedGroupKey,
        hasIv: !!encryptedKeyData.iv,
        hasAuthTag: !!encryptedKeyData.authTag,
        encryptedBy: encryptedKeyData.encryptedBy,
        encryptedKeyLength: encryptedKeyData.encryptedGroupKey?.length || 0,
        ivLength: encryptedKeyData.iv?.length || 0,
        authTagLength: encryptedKeyData.authTag?.length || 0,
        encryptedKeyPreview: encryptedKeyData.encryptedGroupKey?.substring(0, 50) || 'N/A',
        ivPreview: encryptedKeyData.iv?.substring(0, 20) || 'N/A',
        authTagPreview: encryptedKeyData.authTag?.substring(0, 20) || 'N/A'
      });

      // Fetch the public key of whoever encrypted this key (usually the creator)
      const encryptorId = encryptedKeyData.encryptedBy || groupCreatorId;
      console.log(`🔑 Fetching public key for encryptor: ${encryptorId}`);
      
      const encryptorPublicKey = await fetchUserPublicKey(encryptorId);
      
      if (!encryptorPublicKey) {
        throw new Error(`Public key not found for encryptor ${encryptorId}`);
      }

      console.log(`🔐 Attempting to decrypt group key...`);
      // Decrypt the group key
      groupKey = await cryptoService.decryptGroupKey(
        encryptedKeyData,
        encryptorPublicKey,
        encryptorId,
        groupId
      );

      console.log(`✅ Group key decrypted for group ${groupId}`);
      
      // If creator successfully decrypted, automatically re-encrypt for all members
      // This ensures everyone's keys are up to date (fixes key mismatches)
      // Runs in background - doesn't block
      if (currentUserId.toString() === (groupCreatorId?.toString() || groupCreatorId) && groupMembers) {
        // Run async in background - don't wait for it
        (async () => {
          try {
            console.log(`🔄 Creator detected - updating group keys for all members...`);
            for (const member of groupMembers) {
              const memberId = member.id || member._id || member;
              // Skip re-encrypting for the creator themselves (they already have the key)
              if (memberId.toString() === currentUserId.toString()) {
                continue;
              }
              try {
                await reEncryptGroupKeyForMember(groupId, memberId, currentUserId, groupCreatorId);
              } catch (reEncryptError) {
                // Log but don't fail - some members might not have keys set up yet
                console.log(`⚠️ Could not update key for member ${memberId}:`, reEncryptError.message);
              }
            }
            console.log(`✅ Group keys updated for all members`);
          } catch (backgroundError) {
            // Don't throw - this is background maintenance
            console.log(`⚠️ Background key update failed:`, backgroundError.message);
          }
        })();
      }
      
      return groupKey;
    } catch (error) {
      // Check if this is a key mismatch error (decryption failed due to key change)
      const isKeyMismatch = error.message?.includes('key mismatch') || 
                           error.message?.includes('Failed to decrypt') ||
                           error.name === 'OperationError';
      
      // If key mismatch and user is creator, try to re-encrypt for all members
      if (isKeyMismatch && groupMembers && currentUserId.toString() === (groupCreatorId?.toString() || groupCreatorId)) {
        console.warn(`⚠️ Key mismatch detected. Creator will re-encrypt group key for all members...`);
        
        try {
          // Get group key from another member or regenerate
          let recoveredGroupKey = null;
          
          // Try to get group key from cache (if creator already has it)
          recoveredGroupKey = cryptoService.getGroupKey(groupId);
          
          // If not in cache, try to get it from another member
          if (!recoveredGroupKey && groupMembers.length > 1) {
            for (const member of groupMembers) {
              const memberId = member.id || member._id || member;
              if (memberId.toString() === currentUserId.toString()) continue;
              
              try {
                const memberKeyData = await getGroupKey(groupId, memberId);
                const memberEncryptorId = memberKeyData.encryptedBy || groupCreatorId;
                const memberEncryptorPublicKey = await fetchUserPublicKey(memberEncryptorId);
                recoveredGroupKey = await cryptoService.decryptGroupKey(
                  memberKeyData,
                  memberEncryptorPublicKey,
                  memberEncryptorId,
                  groupId
                );
                console.log(`✅ Recovered group key from member ${memberId}`);
                break;
              } catch (e) {
                continue;
              }
            }
          }
          
          // If still no key, regenerate (only if creator)
          if (!recoveredGroupKey) {
            console.log(`🔄 Regenerating group key...`);
            recoveredGroupKey = await cryptoService.generateGroupKey();
            cryptoService.setGroupKey(groupId, recoveredGroupKey);
          }
          
          // Re-encrypt for all members with their current public keys
          console.log(`🔐 Re-encrypting group key for all members...`);
          for (const member of groupMembers) {
            const memberId = member.id || member._id || member;
            try {
              await reEncryptGroupKeyForMember(groupId, memberId, currentUserId, groupCreatorId);
            } catch (reEncryptError) {
              console.error(`⚠️ Failed to re-encrypt for member ${memberId}:`, reEncryptError.message);
            }
          }
          
          // Now try to fetch and decrypt again
          const newEncryptedKeyData = await getGroupKey(groupId, currentUserId);
          const newEncryptorId = newEncryptedKeyData.encryptedBy || groupCreatorId;
          const newEncryptorPublicKey = await fetchUserPublicKey(newEncryptorId);
          groupKey = await cryptoService.decryptGroupKey(
            newEncryptedKeyData,
            newEncryptorPublicKey,
            newEncryptorId,
            groupId
          );
          
          console.log(`✅ Group key re-encrypted and decrypted successfully`);
          return groupKey;
        } catch (recoverError) {
          console.error(`❌ Failed to recover from key mismatch:`, recoverError);
        }
      }
      
      // If key not found (404), try to repair encryption
      if (error.response?.status === 404 && groupMembers) {
        console.warn(`⚠️ Group key not found, attempting to repair encryption...`);

        // Import repair function
        const { repairGroupEncryption } = await import('./repairGroupEncryption');

        // Attempt to repair (only creator can initialize)
        const repaired = await repairGroupEncryption(
          groupId,
          groupMembers,
          currentUserId,
          groupCreatorId
        );

        if (repaired) {
          // Try fetching again after repair
          groupKey = cryptoService.getGroupKey(groupId);
          if (groupKey) {
            console.log(`✅ Group key available after repair`);
            return groupKey;
          }
        }
      }

      throw error;
    }
  } catch (error) {
    console.error('Failed to fetch and decrypt group key:', error);
    throw error;
  }
}

/**
 * Encrypt a message for a group
 *
 * @param {string} plaintext - The message to encrypt
 * @param {string} groupId - The group ID
 * @param {string} currentUserId - ID of the current user
 * @param {string} groupCreatorId - ID of the group creator
 * @param {Array} groupMembers - Array of group members (optional, for repair)
 * @returns {Promise<Object>} - Encryption data { encryptedData, iv, authTag }
 */
export async function encryptMessageForGroup(plaintext, groupId, currentUserId, groupCreatorId, groupMembers = null) {
  try {
    // Get or fetch the group key (with automatic repair if needed)
    const groupKey = await fetchAndDecryptGroupKey(groupId, currentUserId, groupCreatorId, groupMembers);

    // Encrypt the message
    const { ciphertext, iv, authTag } = await cryptoService.encryptGroupMessage(
      plaintext,
      groupKey
    );

    return {
      encryptedData: ciphertext,
      iv,
      authTag
    };
  } catch (error) {
    console.error('Failed to encrypt message for group:', error);
    throw error;
  }
}

/**
 * Decrypt a group message
 *
 * @param {Object} encryptedData - Object with { encryptedData, iv, authTag }
 * @param {string} groupId - The group ID
 * @param {string} currentUserId - ID of the current user
 * @param {string} groupCreatorId - ID of the group creator
 * @param {Array} groupMembers - Array of group members (optional, for repair)
 * @returns {Promise<string>} - The decrypted plaintext message
 */
export async function decryptGroupMessage(encryptedData, groupId, currentUserId, groupCreatorId, groupMembers = null) {
  try {
    // Get or fetch the group key (with automatic repair if needed)
    const groupKey = await fetchAndDecryptGroupKey(groupId, currentUserId, groupCreatorId, groupMembers);

    // Decrypt the message
    const plaintext = await cryptoService.decryptGroupMessage(
      {
        ciphertext: encryptedData.encryptedData,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag
      },
      groupKey
    );

    return plaintext;
  } catch (error) {
    console.error('Failed to decrypt group message:', error);
    throw error;
  }
}

export default {
  fetchUserPublicKey,
  initializeGroupEncryption,
  addMemberEncryptionKey,
  fetchAndDecryptGroupKey,
  encryptMessageForGroup,
  decryptGroupMessage
};
