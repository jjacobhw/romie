/*
 * Romie Texting Module
 * Provides functions to manage user accounts, conversations, and messages in Firebase.
 * All error messages are logged to the console.
 */

/**
 * Creates a user account with an username and password, adds them to Firebase, 
 * and returns the user object.
 * @param {string} username - The username for the new account.
 * @param {string} password - The password for the new account.
 * @returns {Object} The created (or already existing) user object.
 */
function createAccount(username, password) {
    // Return error is username already exists in Firebase
    let userRef = firebase.firestore().collection('users').where('name', '==', username);
    userRef.get().then((querySnapshot) => {
        if (!querySnapshot.empty) {
            // TODO: Change text to look good in React
            console.error(`Username ${username} already exists.`);
            return querySnapshot.docs[0].data();
        }
    });
    // Create a user object with the given username and password
    let user = {
        name: username,
        password: password,
        avatarUrl: 'https://kommodo.ai/i/zxasnXB2wNYSXfxpIr9N', // Default avatar URL for new users
    };
    // Add the user to Firebase
    firebase.firestore().collection('users').add(user);

    return user;
}

/**
 * Update the user's username in Firebase.
 * @param {string} oldUsername - The current username of the user.
 * @param {string} newUsername - The new username for the user.
 * @return {boolean} True if the user is in the database, false otherwise.
 */
function updateProfileUsername(oldUsername, newUsername) {
    // Update the user's username in Firebase
    let userRef = firebase.firestore().collection('users').where('name', '==', oldUsername);
    userRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // If old username doesn't exist, return an error
            if (!doc.exists) {
                console.error(`User ${oldUsername} not found.`);
                return false;
            }
            // Update the user's username
            doc.ref.update({
                name: newUsername,
            });
        });
    });
    return true;
}

/**
 * Update the user's profile picture (avatar URL) in Firebase.
 * @param {string} username - The username of the user to update.
 * @param {string} avatarUrl - The new avatar URL for the user.
 * @return {boolean} True if the user is in the database, false otherwise.
 */
function updateProfilePic(username, avatarUrl) {
    // Update the user's profile in Firebase
    let userRef = firebase.firestore().collection('users').where('name', '==', username);
    userRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // If username doesn't exist, return an error
            if (!doc.exists) {
                console.error(`User ${username} not found.`);
                return false;
            }
            // Update the user's profile with the new username and avatar URL
            doc.ref.update({
                name: username,
                avatarUrl: avatarUrl,
            });
        });
    });
    return true;
}

/**
 * Delete the user's account from Firebase (if no account is found, prints error and does nothing)
 * @param {string} username - The username of the user to delete.
 * @return {boolean} True if the user was deleted, false otherwise.
 */
function deleteAccount(username) {
    let userRef = firebase.firestore().collection('users').where('name', '==', username);
    userRef.get().then((querySnapshot) => {
        // If the user isn't found, return an error
        if (querySnapshot.empty) {
            // TODO: Change text to look good in React
            console.error(`User ${username} not found.`);
            return;
        }
        // Remove user from all conversations
        let conversationsRef = firebase.firestore().collection('conversations').where('users', 'array-contains', username);
        conversationsRef.get().then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                doc.ref.update({
                    users: firebase.firestore.FieldValue.arrayRemove(username),
                });
            });
        });
        // Delete the user from the database
        querySnapshot.forEach((doc) => {
            doc.ref.delete();
        });
        // Check if the user is still in the database
        let checkUserRef = firebase.firestore().collection('users').where('name', '==', username);
        checkUserRef.get().then((querySnapshot) => {
            if (!querySnapshot.empty) {
                console.error(`Failed to delete user ${username}.`);
                return false;
            }
        });
    });
    return true;
}

/**
 * Initialize a chat room in Firebase and return an invite code to it.
 * @param {string} username - The username of the user creating the conversation.
 * @returns {integer} The invite code for the created conversation, 
 * or -1 if the user is already in a conversation or does not exist.
 */
async function createConversation(username) {
    // Check if the user exists
    let userRef = firebase.firestore().collection('users').where('name', '==', username);
    let userSnapshot = await userRef.get();
    if (userSnapshot.empty) {
        console.error(`User ${username} not found.`);
        return -1;
    }
    // Check if the user is already in an active conversation
    let userConversationsRef = firebase.firestore().collection('conversations').where('users', 'array-contains', username);
    let userConversationsSnapshot = await userConversationsRef.get();
    if (!userConversationsSnapshot.empty) {
        console.error(`User ${username} is already in a conversation with invite code ${userConversationsSnapshot.docs[0].data().inviteCode}.`);
        return -1;
    }
    // Generate a unique invite code
    let inviteCode;
    do {
        inviteCode = Math.random().toString(36).substring(2, 8);
        var existing = await firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode).get();
    } while (!existing.empty);
    // Initialize a conversation with generated invite code
    let conversation = {
        inviteCode: inviteCode,
        messages: [],
        users: [username],
    };
    // Save conversation to Firebase
    firebase.firestore().collection('conversations').add(conversation);

    return inviteCode;
}

/**
 * Add user to the conversation in Firebase associated with the given invite code.
 * @param {string} username - The username of the user joining the conversation.
 * @param {integer} inviteCode - The invite code of the conversation to join.
 * @returns {boolean} True if the user successfully joined the conversation, 
 * or false if user doesn't exist, is already in a conversation, or invite code is invalid.
 */
function joinConversation(username, inviteCode) {
    // Check if the user exists
    let userRef = firebase.firestore().collection('users').where('name', '==', username);
    userRef.get().then((querySnapshot) => {
        if (querySnapshot.empty) {
            console.error(`User ${username} not found.`);
            return false;
        }
    });
    // Check if the user is already in a conversation
    let userConversationsRef = firebase.firestore().collection('conversations').where('users', 'array-contains', username);
    userConversationsRef.get().then((querySnapshot) => {
        if (!querySnapshot.empty) {
            // TODO: Change text to look good in React
            console.error(`User ${username} is already in a conversation with invite code ${querySnapshot.docs[0].data().inviteCode}.`);
            return false;
        }
    });
    // Find conversation with the given invite code
    let conversationRef = firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode);
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // Add user to the conversation
            doc.ref.update({
                users: firebase.firestore.FieldValue.arrayUnion(username),
            });
        });
    });
    // If conversation with the given invite code doesn't exist, return an error message
    conversationRef.get().then((querySnapshot) => {
        if (querySnapshot.empty) {
            // TODO: Change text to look good in React
            console.error(`Conversation with invite code ${inviteCode} does not exist.`);
            return false;
        }
    });
    return true;
}

/**
 * Refresh messages in conversation to user's screen.
 * @param {integer} inviteCode - The invite code of the conversation to retrieve.
 * @return {boolean} True if the conversation was successfully retrieved, false otherwise.
 */
function getConversation(inviteCode) {
    // Find conversation with the given invite code
    let conversationRef = firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode);
    // Print to user's screen only the messages that aren't already displayed.
    let displayedMessages = new Set();  
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            let conversation = doc.data();
            // TODO: Change text to look good in React
            conversation.messages.forEach((message) => {
                if (!displayedMessages.has(message)) {
                    console.log(message);
                    displayedMessages.add(message);
                }
            });
        });
    });
    // Check if conversation with the given invite code exists
    conversationRef.get().then((querySnapshot) => {
        if (querySnapshot.empty) {
            // TODO: Change text to look good in React
            console.error(`Conversation with invite code ${inviteCode} does not exist.`);
            return false;
        }
    });
    return true;
}

/**
 * Remove a user from the conversation in Firebase associated with the given invite code.
 * @param {string} username - The username of the user leaving the conversation.
 * @param {integer} inviteCode - The invite code of the conversation to leave.
 * @return {boolean} True if the user successfully left the conversation, false otherwise.
 */
function leaveConversation(username, inviteCode) {
    // Find conversation with the given invite code
    let conversationRef = firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode);
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // Remove user from the conversation
            doc.ref.update({
                users: firebase.firestore.FieldValue.arrayRemove(username),
            });
            // Delete the conversation if no users are left
            if (doc.data().users.length === 0) {
                deleteConversation(inviteCode);
            }
        });
    });
    // Check if user is still in the conversation
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            if (doc.data().users.includes(username)) {
                return false;
            }
        });
    });
    return true;
}

/**
 * Delete a conversation from Firebase associated with the given invite code.
 * @param {integer} inviteCode - The invite code of the conversation to delete.
 * @return {boolean} True if the conversation was successfully deleted, false otherwise.
 */
function deleteConversation(inviteCode) {
    // Find conversation with the given invite code
    let conversationRef = firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode);
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // Delete the conversation
            doc.ref.delete();
        });
    });
    // Try to find conversation with the given invite code to verify deletion
    conversationRef.get().then((querySnapshot) => {
        if (!querySnapshot.empty) {
            console.error('Failed to delete conversation with invite code:', inviteCode);
            return false;
        }
    });
    return true;
}

/**
 * Add a message to the front of the queue in the specified conversation.
 * @param {string} username - The username of the user sending the message.
 * @param {integer} inviteCode - The invite code of the conversation to send the message to.
 * @param {string} messageText - The text content of the message to send.
 * @param {string} attachments - Any attachments associated with the message.
 */
function sendMessage(username, inviteCode,messageText, attachments) {
    // Find conversation with the given invite code
    let conversationRef = firebase.firestore().collection('conversations').where('inviteCode', '==', inviteCode);
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            // Add the message to the front of the queue
            doc.ref.update({
                messages: firebase.firestore.FieldValue.arrayUnion({
                    username: username,
                    messageText: messageText,
                    attachments: attachments,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                })
            });
        });
    });
    // Check if message text was successfully added to the conversation
    conversationRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            let messages = doc.data().messages;
            let messageExists = messages.some((msg) => msg.messageText === messageText && msg.username === username);
            if (!messageExists) {
                console.error('Failed to send message to conversation with invite code:', inviteCode);
                return false;
            }
        });
    });
    return true;
}

function readMessages() {}

function shareInviteCode() {}

function syncMessages() {}

function uploadMedia(file) {}

// TODO: function signInUser(username, password) {}
// TODO: function signOutUser() {}